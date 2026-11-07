import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  parsePlaceProfile,
  parseSignatureHeader,
  publisherDocSchema,
  sitePointerSchema,
  verifyPing,
  type PublisherKey,
} from "../src/index";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/lokand-place.json", import.meta.url), "utf8"));

describe("parsePlaceProfile", () => {
  const p = parsePlaceProfile(fixture)!;

  it("reads the place from a Lokand profile", () => {
    expect(p.identifier).toBe("biz_kirmizi");
    expect(p.name).toBe("Kırmızı Meyhane");
    expect(p.schemaType).toBe("Restaurant");
    expect([p.lat, p.lng]).toEqual([40.9906, 29.0283]);
    expect(p.address).toEqual({
      streetAddress: "Moda Cd. 12",
      addressLocality: "Kadıköy",
      addressRegion: "İstanbul",
      addressCountry: "TR",
    });
    expect(p.category).toBe("meyhane");
    expect(p.cuisines).toEqual(["meze", "seafood"]);
    expect(p.timezone).toBe("Europe/Istanbul");
    expect(p.currency).toBe("TRY");
    expect(p.hours).toEqual({ mon: { open: "17:00", close: "01:00" }, tue: { open: "17:00", close: "01:00" } });
    expect(p.sameAs).toEqual(["https://www.instagram.com/kirmizimeyhane"]);
  });

  it("reads every offering with prices, diets, allergens and sold-out state", () => {
    expect(p.menus).toHaveLength(1);
    const byName = Object.fromEntries(p.menus[0]!.offerings.map((o) => [o.name, o]));
    expect(byName["Humus"]).toMatchObject({ price: 120, currency: "TRY", soldOut: false, allergens: ["sesame"], section: "Mezeler" });
    expect(byName["Humus"]!.diets.sort()).toEqual(["gluten_free", "vegan"]);
    expect(byName["Lakerda"]).toMatchObject({ price: 260, soldOut: true, allergens: ["fish"] });
    expect(byName["Rakı"]).toMatchObject({ price: 300, contains: ["alcohol"] });
    expect(byName["Rakı"]!.variations).toEqual([{ name: "Tek", price: 300 }, { name: "Duble", price: 520 }]);
    expect(byName["Günün çorbası"]).toMatchObject({ price: null });
    expect(byName["Günün çorbası"]!.diets.sort()).toEqual(["spicy", "vegetarian"]);
  });

  it("reads a bare page JSON-LD node too", () => {
    const bare = parsePlaceProfile({ "@type": "CafeOrCoffeeShop", name: "Moda Kahve", address: "Moda Cd. 1" });
    expect(bare).toMatchObject({ name: "Moda Kahve", schemaType: "CafeOrCoffeeShop", address: { streetAddress: "Moda Cd. 1" }, menus: [] });
  });

  it("never throws on garbage and refuses non-places", () => {
    for (const junk of [null, 42, "x", [], {}, { "@graph": "nope" }, { "@type": "Person", name: "Ada" }]) {
      expect(parsePlaceProfile(junk)).toBeNull();
    }
    const weird = parsePlaceProfile({
      "@type": ["Restaurant"],
      name: "  A  ",
      geo: { latitude: 999, longitude: "x" },
      hasMenu: [{ "@type": "Menu", hasMenuSection: [{ hasMenuItem: [{ "@type": "MenuItem" }, 7, { "@type": "MenuItem", name: "B", offers: { price: "-3" } }] }] }],
    })!;
    expect(weird.name).toBe("A");
    expect(weird.lat).toBeNull();
    expect(weird.menus[0]!.offerings).toEqual([expect.objectContaining({ name: "B", price: null })]);
  });
});

describe("publisher documents", () => {
  it("accepts the keygen output shape and the site pointer", () => {
    expect(
      publisherDocSchema.safeParse({
        v: 1,
        keys: [{ kty: "OKP", crv: "Ed25519", x: "3CQ6ZkDBj9LAPbV6Gh0wV_FZpn5ceX1ImRRtJH8PHoM", kid: "lokand-2026-11-07", alg: "EdDSA", use: "sig" }],
      }).success,
    ).toBe(true);
    expect(
      sitePointerSchema.safeParse({ v: 1, publisher: "https://lokand.com", place: { id: "biz_1", profile: "https://x.lokand.co/place.json" } }).success,
    ).toBe(true);
    expect(sitePointerSchema.safeParse({ v: 1, listing: "remove" }).success).toBe(true);
  });
});

describe("verifyPing", () => {
  async function publisher() {
    const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
    const pub = (await crypto.subtle.exportKey("jwk", pair.publicKey)) as JsonWebKey;
    const key: PublisherKey = { kty: "OKP", crv: "Ed25519", x: pub.x!, kid: "k1" };
    // Signed exactly the way Lokand's index-notify.ts signs.
    const sign = async (t: number, body: string) => {
      const sig = new Uint8Array(await crypto.subtle.sign("Ed25519", pair.privateKey, new TextEncoder().encode(`${t}.${body}`)));
      const b64 = btoa(String.fromCharCode(...sig)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      return `kid=k1,t=${t},sig=${b64}`;
    };
    return { key, sign };
  }

  it("accepts a fresh ping signed with a listed key", async () => {
    const { key, sign } = await publisher();
    const body = JSON.stringify({ id: "biz_1", url: "https://x.lokand.co/place.json" });
    const header = await sign(1_800_000_000, body);
    expect(parseSignatureHeader(header)?.kid).toBe("k1");
    expect(await verifyPing({ body, header, keys: [key], nowS: 1_800_000_010 })).toEqual({ ok: true, kid: "k1" });
  });

  it("rejects tampering, stale pings, unknown keys and junk", async () => {
    const { key, sign } = await publisher();
    const body = '{"id":"biz_1"}';
    const header = await sign(1_800_000_000, body);
    expect(await verifyPing({ body: '{"id":"biz_2"}', header, keys: [key], nowS: 1_800_000_000 })).toMatchObject({ reason: "bad_signature" });
    expect(await verifyPing({ body, header, keys: [key], nowS: 1_800_001_000 })).toMatchObject({ reason: "stale" });
    expect(await verifyPing({ body, header, keys: [{ ...key, kid: "other" }], nowS: 1_800_000_000 })).toMatchObject({ reason: "unknown_key" });
    expect(await verifyPing({ body, header: "nonsense", keys: [key], nowS: 1_800_000_000 })).toMatchObject({ reason: "malformed" });
  });
});
