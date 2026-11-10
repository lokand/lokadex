import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { fold, geohash } from "@lokadex/core";

const KADIKOY = { lat: 40.9903, lng: 29.0295 };

async function place(id: string, name: string, opts: { lat?: number; lng?: number; cuisines?: string[]; category?: string; hours?: object } = {}) {
  const lat = opts.lat ?? KADIKOY.lat + 0.002;
  const lng = opts.lng ?? KADIKOY.lng;
  await env.PLACES_TR.prepare(
    `INSERT INTO place (id, metro, name, name_folded, lat, lng, cell5, cell7, category, cuisines, hours, timezone, updated_at)
     VALUES (?, 'istanbul', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Europe/Istanbul', ?)`,
  )
    .bind(id, name, fold(name), lat, lng, geohash(lat, lng, 5), geohash(lat, lng, 7), opts.category ?? "restaurant", (opts.cuisines ?? []).join(" ") || null, opts.hours ? JSON.stringify(opts.hours) : null, Date.now())
    .run();
}

beforeAll(async () => {
  await env.CORE.prepare(
    "INSERT INTO area (id, metro, name, name_folded, kind, lat, lng, radius_m) VALUES ('kadikoy', 'istanbul', 'Kadıköy', 'kadikoy', 'district', ?, ?, 1500)",
  )
    .bind(KADIKOY.lat, KADIKOY.lng)
    .run();
  await env.CORE.prepare(
    "INSERT INTO area (id, metro, name, name_folded, kind, lat, lng, radius_m) VALUES ('ist', 'istanbul', 'İstanbul Havalimanı', 'istanbul havalimani', 'landmark', 41.262, 28.742, 2500)",
  ).run();
  await place("s1", "Akito Suşi", { cuisines: ["sushi", "japanese"] });
  await place("s2", "Far Sushi", { cuisines: ["sushi"], lat: KADIKOY.lat + 0.03 });
  await place("k1", "Kebapçı Halil", { cuisines: ["kebab", "halal"] });
  await place("c1", "Moda Kahve", { category: "cafe", cuisines: ["coffee"] });
  await place("n1", "Gece Sushi", {
    cuisines: ["sushi"],
    hours: Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, { closed: true }])),
  });
  await env.PLACES_TR.prepare(
    "INSERT INTO offering (id, place_id, source, name, name_folded, price, currency, updated_at) VALUES ('o1', 'c1', 'publisher:lokand.com', 'Lahmacun Tost', 'lahmacun tost', 120, 'TRY', 1)",
  ).run();
});

const search = async (qs: string) => (await SELF.fetch(`https://api.lokadex.test/v1/places/search?${qs}`)).json() as Promise<any>;

describe("search", () => {
  it("finds sushi near a named district, within the radius", async () => {
    const body = await search("q=sushi&near=Kad%C4%B1k%C3%B6y");
    const ids = body.results.map((r: any) => r.id);
    expect(ids).toContain("s1");
    expect(ids).not.toContain("s2");
    expect(ids).not.toContain("k1");
    expect(body.query.near).toBe("Kadıköy");
    expect(body.attribution).toMatch(/Foursquare/);
  });

  it("reads the location out of the query and handles Turkish words", async () => {
    const body = await search(`q=${encodeURIComponent("suşi kadıköy")}`);
    expect(body.results.map((r: any) => r.id)).toContain("s1");
  });

  it("drops places known to be closed when open_now is set", async () => {
    const all = (await search("q=sushi&near=kadikoy")).results.map((r: any) => r.id);
    const open = (await search("q=sushi&near=kadikoy&open_now=true")).results.map((r: any) => r.id);
    expect(all).toContain("n1");
    expect(open).not.toContain("n1");
  });

  it("filters diets through cuisine tags and finds dishes on menus", async () => {
    expect((await search("q=helal&near=kadikoy")).results.map((r: any) => r.id)).toEqual(["k1"]);
    expect((await search("q=lahmacun&near=kadikoy")).results.map((r: any) => r.id)).toEqual(["c1"]);
  });

  it("explains a missing or unknown location", async () => {
    const res = await SELF.fetch("https://api.lokadex.test/v1/places/search?q=sushi");
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).error).toBe("no_location");
    expect((await search("q=sushi&near=atlantis")).error).toBe("unknown_area");
    expect((await search(`q=sushi&near=${encodeURIComponent("İstanbul")}`)).error).toBe("too_broad");
    expect((await search("q=sushi%20istanbul")).error).toBe("no_location");
    expect((await search("q=sushi&near=havalimani")).error).toBe("unknown_area");
    expect((await search(`q=sushi&near=${encodeURIComponent("istanbul havalimanı")}`)).query.near).toBe("İstanbul Havalimanı");
    expect((await search("q=sushi&lat=48.85&lng=2.35")).error).toBe("out_of_coverage");
  });

  it("returns a place with its menu", async () => {
    const res = await SELF.fetch("https://api.lokadex.test/v1/places/c1");
    const body = (await res.json()) as any;
    expect(body.name).toBe("Moda Kahve");
    expect(body.offerings[0]).toMatchObject({ name: "Lahmacun Tost", price: 120, currency: "TRY" });
    expect((await SELF.fetch("https://api.lokadex.test/v1/places/nope")).status).toBe(404);
  });
});

const rpc = async (method: string, params?: object, id: number | null = 1) =>
  SELF.fetch("https://api.lokadex.test/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", ...(id === null ? {} : { id }), method, params }),
  });

describe("mcp", () => {
  it("initializes and lists two read-only tools", async () => {
    const init = (await (await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } })).json()) as any;
    expect(init.result.protocolVersion).toBe("2025-06-18");
    expect((await rpc("notifications/initialized", undefined, null)).status).toBe(202);
    const list = (await (await rpc("tools/list")).json()) as any;
    expect(list.result.tools.map((t: any) => t.name)).toEqual(["find_places", "get_place"]);
    expect(list.result.tools.every((t: any) => t.annotations.readOnlyHint)).toBe(true);
  });

  it("calls find_places and reports bad input as a tool error", async () => {
    const res = (await (await rpc("tools/call", { name: "find_places", arguments: { query: "sushi", near: "Kadıköy" } })).json()) as any;
    expect(res.result.structuredContent.results.map((r: any) => r.id)).toContain("s1");
    const bad = (await (await rpc("tools/call", { name: "find_places", arguments: { query: "sushi" } })).json()) as any;
    expect(bad.result.isError).toBe(true);
    const unknown = (await (await rpc("tools/call", { name: "nope", arguments: {} })).json()) as any;
    expect(unknown.error.code).toBe(-32602);
  });
});
