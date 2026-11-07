import { describe, expect, it } from "vitest";
import {
  authoritative,
  boundingBox,
  coreName,
  distanceMeters,
  evidenceScore,
  fold,
  geohash,
  geohashBounds,
  geohashRing,
  metroAt,
  nameSimilarity,
  normalizePhone,
  openState,
  rankScore,
  searchCells,
  shouldAttach,
  trustLabel,
} from "./index";

describe("fold", () => {
  it("meets Turkish spellings in the middle", () => {
    expect(fold("KADIKÖY")).toBe("kadikoy");
    expect(fold("Kadıköy'de")).toBe("kadikoy");
    expect(fold("İstanbul Şişli")).toBe("istanbul sisli");
    expect(fold("Çiğ köfte — Ümraniye")).toBe("cig kofte umraniye");
  });
});

describe("names", () => {
  it("ignores generic place words", () => {
    expect(coreName("Kırmızı Meyhanesi")).toBe("kirmizi");
    expect(coreName("Cafe")).toBe("cafe");
  });
  it("scores the same place high and different places low", () => {
    expect(nameSimilarity("Kırmızı Meyhane", "KIRMIZI MEYHANESİ")).toBe(1);
    expect(nameSimilarity("Çiya Sofrası", "Ciya Sofrasi")).toBe(1);
    expect(nameSimilarity("Moda Kahvecisi", "Moda Kahveci")).toBeGreaterThan(0.85);
    expect(nameSimilarity("Kırmızı", "Mavi Balık")).toBeLessThan(0.3);
  });
  it("normalizes phones to comparable digits", () => {
    expect(normalizePhone("+90 (216) 000 00 00")).toBe("902160000000");
    expect(normalizePhone("0216 000 00 00")).toBe("902160000000");
    expect(normalizePhone("123")).toBeNull();
  });
});

describe("geo", () => {
  const moda = { lat: 40.9831, lng: 29.0255 };
  it("encodes and bounds geohashes", () => {
    const h = geohash(moda.lat, moda.lng, 7);
    expect(h).toHaveLength(7);
    const b = geohashBounds(h);
    expect(moda.lat).toBeGreaterThanOrEqual(b.latLo);
    expect(moda.lat).toBeLessThanOrEqual(b.latHi);
  });
  it("rings a cell with its neighbours", () => {
    const ring = geohashRing(geohash(moda.lat, moda.lng, 5));
    expect(ring).toHaveLength(9);
    expect(new Set(ring).size).toBe(9);
  });
  it("covers the search radius", () => {
    const { cells, precision } = searchCells(moda, 1500);
    const near = { lat: moda.lat + 0.012, lng: moda.lng - 0.012 };
    expect(distanceMeters(moda, near)).toBeLessThan(1700);
    expect(cells).toContain(geohash(near.lat, near.lng, precision));
  });
  it("measures distance and boxes", () => {
    expect(Math.round(distanceMeters({ lat: 41, lng: 29 }, { lat: 41.01, lng: 29 }))).toBe(1112);
    const box = boundingBox(moda, 1000);
    expect(box.latHi - box.latLo).toBeCloseTo(0.018, 3);
  });
  it("finds the metro for a point", () => {
    expect(metroAt(moda.lat, moda.lng)?.id).toBe("istanbul");
    expect(metroAt(51.5, -0.12)).toBeNull();
  });
});

describe("openState", () => {
  const tz = "Europe/Istanbul";
  // 2026-11-09 is a Monday; Istanbul is UTC+3.
  const at = (h: number, m = 0, day = 9) => new Date(Date.UTC(2026, 10, day, h - 3, m));
  const hours = {
    mon: { open: "09:00", close: "22:00" },
    fri: { open: "18:00", close: "02:00" },
    sun: { closed: true },
  };
  it("answers open, closed and not-yet-open", () => {
    expect(openState(hours, tz, at(12))).toEqual({ open: true, closesAt: "22:00" });
    expect(openState(hours, tz, at(8))).toEqual({ open: false, opensAt: "09:00" });
    expect(openState(hours, tz, at(23))).toEqual({ open: false });
    expect(openState(hours, tz, at(12, 0, 8))).toEqual({ open: false });
  });
  it("carries overnight hours past midnight", () => {
    // Saturday 01:00 is still Friday night.
    expect(openState(hours, tz, at(1, 0, 14))).toEqual({ open: true, closesAt: "02:00" });
    expect(openState(hours, tz, at(23, 0, 13))).toEqual({ open: true, closesAt: "02:00" });
  });
  it("says unknown rather than guessing", () => {
    expect(openState(hours, tz, at(12, 0, 10))).toEqual({ open: null });
    expect(openState(hours, null, at(12))).toEqual({ open: null });
    expect(openState(hours, "Not/AZone", at(12))).toEqual({ open: null });
  });
});

describe("trust", () => {
  it("attaches on a bidirectional domain alone", () => {
    expect(shouldAttach({ bidirectionalDomain: true })).toBe(true);
  });
  it("needs more than one strong signal otherwise", () => {
    expect(shouldAttach({ samePhone: true })).toBe(false);
    expect(shouldAttach({ samePhone: true, distanceM: 40, nameSimilarity: 0.9 })).toBe(true);
    expect(shouldAttach({ samePhone: true, sameSocial: true })).toBe(true);
  });
  it("keeps a same-name impostor unattached", () => {
    expect(shouldAttach({ distanceM: 10, nameSimilarity: 1 })).toBe(false);
    expect(shouldAttach({ distanceM: 10, nameSimilarity: 1, inUse: true })).toBe(false);
    expect(evidenceScore({ distanceM: 500, nameSimilarity: 1 })).toBe(0);
  });
  it("lets the place's own site speak first, then weighted evidence, then freshness", () => {
    const base = { reputation: 1, evidence: 1, bidirectional: false, fetchedAt: 1 };
    const claims = [
      { ...base, source: "platform", reputation: 0.9 },
      { ...base, source: "own-site", bidirectional: true, reputation: 0.5 },
      { ...base, source: "newer", reputation: 0.9, fetchedAt: 2 },
    ];
    expect(authoritative(claims)?.source).toBe("own-site");
    expect(authoritative(claims.slice(0, 1).concat(claims.slice(2)))?.source).toBe("newer");
  });
  it("labels by evidence, never claiming verification", () => {
    expect(trustLabel(false)).toBe("listed");
    expect(trustLabel(true)).toBe("published");
  });
});

describe("rankScore", () => {
  it("prefers relevant, near, complete, fresh places", () => {
    const base = { relevance: 0.8, distanceM: 300, radiusM: 1500, completeness: 0.8, reputation: 1, ageDays: 1 };
    expect(rankScore(base)).toBeGreaterThan(rankScore({ ...base, distanceM: 1400 }));
    expect(rankScore(base)).toBeGreaterThan(rankScore({ ...base, completeness: 0.1 }));
    expect(rankScore(base)).toBeGreaterThan(rankScore({ ...base, ageDays: 400 }));
    expect(rankScore(base)).toBeLessThanOrEqual(1);
  });
});

describe("diets", () => {
  it("round-trips tags through the mask and ignores unknown ones", async () => {
    const { dietMask, dietTags } = await import("./index");
    expect(dietTags(dietMask(["vegan", "gluten_free", "made_up"]))).toEqual(["vegan", "gluten_free"]);
  });
});
