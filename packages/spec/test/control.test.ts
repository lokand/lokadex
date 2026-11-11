import { describe, expect, it } from "vitest";
import { controlDomain, controlProofs, controlRecordName, formatControlRecord, parseControlRecord, parsePlaceProfile, txtData } from "../src/index";

describe("controlDomain", () => {
  it("normalizes website URLs and hosts", () => {
    expect(controlDomain("https://www.Kirmizi.com.tr/menu?x=1")).toBe("kirmizi.com.tr");
    expect(controlDomain("kirmizi.lokand.co")).toBe("kirmizi.lokand.co");
    expect(controlRecordName("kirmizi.com.tr")).toBe("_lokadex.kirmizi.com.tr");
  });

  it("refuses anything that isn't a public DNS name", () => {
    for (const bad of [null, "", "localhost", "http://127.0.0.1", "https://10.0.0.1/", "x.local", "a..b", "-a.com", "foo.test", "ex ample.com", 7]) {
      expect(controlDomain(bad as string)).toBeNull();
    }
  });
});

describe("control records", () => {
  it("round-trips the TXT format", () => {
    const txt = formatControlRecord({ publisher: "https://lokand.com/", place: "biz_1" });
    expect(txt).toBe("v=lokadex1; publisher=https://lokand.com; place=biz_1");
    expect(parseControlRecord(txt)).toEqual({ publisher: "https://lokand.com", place: "biz_1", listing: null });
    expect(parseControlRecord("v=lokadex1;listing=remove")).toEqual({ publisher: null, place: null, listing: "remove" });
  });

  it("joins split DoH character-strings", () => {
    expect(txtData('"v=lokadex1; publisher=https://lo" "kand.com"')).toBe("v=lokadex1; publisher=https://lokand.com");
    expect(txtData('"a \\"q\\""')).toBe('a "q"');
  });

  it("ignores other versions, http publishers and junk", () => {
    for (const bad of [null, "", "google-site-verification=abc", "v=lokadex2; publisher=https://a.com", "v=lokadex1; publisher=http://a.com", "v=lokadex1", "x".repeat(2000)]) {
      expect(parseControlRecord(bad)).toBeNull();
    }
  });
});

describe("controlProofs", () => {
  const publisher = "https://lokand.com";
  const pointer = { v: 1, publisher, place: { id: "biz_1", profile: "https://x.lokand.co/place.json" } };

  it("finds the site pointer and the DNS record", () => {
    expect(controlProofs({ publisher, placeId: "biz_1", pointer, txt: [] })).toEqual({ proofs: ["site"], remove: false });
    expect(controlProofs({ publisher, placeId: "biz_1", pointer: null, txt: ["v=lokadex1; publisher=https://lokand.com; place=biz_1"] })).toEqual({ proofs: ["dns"], remove: false });
    expect(controlProofs({ publisher, placeId: "biz_9", pointer: null, txt: ["v=lokadex1; publisher=https://lokand.com"] }).proofs).toEqual(["dns"]);
  });

  it("does not let another publisher or place borrow a proof", () => {
    expect(controlProofs({ publisher: "https://other.com", placeId: "biz_1", pointer, txt: ["v=lokadex1; publisher=https://lokand.com"] }).proofs).toEqual([]);
    expect(controlProofs({ publisher, placeId: "biz_2", pointer, txt: ["v=lokadex1; publisher=https://lokand.com; place=biz_1"] }).proofs).toEqual([]);
  });

  it("lets a removal request win", () => {
    expect(controlProofs({ publisher, placeId: "biz_1", pointer, txt: ["v=lokadex1; listing=remove"] })).toEqual({ proofs: [], remove: true });
  });
});

describe("profile surface fields", () => {
  it("reads logo, photos, email and price range defensively", () => {
    const p = parsePlaceProfile({
      "@type": "Restaurant",
      name: "A",
      email: "mailto:hi@a.com",
      logo: { "@type": "ImageObject", url: "https://a.com/logo.png" },
      image: ["https://a.com/1.jpg", { contentUrl: "https://a.com/2.jpg" }, "http://a.com/insecure.jpg", "javascript:alert(1)", "https://a.com/1.jpg"],
      priceRange: "₺₺",
    })!;
    expect(p).toMatchObject({ email: "hi@a.com", logo: "https://a.com/logo.png", images: ["https://a.com/1.jpg", "https://a.com/2.jpg"], priceRange: "₺₺" });
    expect(parsePlaceProfile({ "@type": "Restaurant", name: "B", email: "nope", logo: 5, image: {} })).toMatchObject({ email: null, logo: null, images: [] });
  });
});
