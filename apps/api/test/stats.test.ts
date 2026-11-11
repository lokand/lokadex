import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { fold, geohash } from "@lokadex/core";
import worker from "../src/index";
import { recorder } from "../src/stats";

const AT = { lat: 41.0422, lng: 29.0083 };

async function place(id: string, name: string, cuisines: string[]) {
  await env.PLACES_TR.prepare(
    `INSERT INTO place (id, metro, name, name_folded, lat, lng, cell5, cell7, category, cuisines, updated_at)
     VALUES (?, 'istanbul', ?, ?, ?, ?, ?, ?, 'restaurant', ?, ?)`,
  )
    .bind(id, name, fold(name), AT.lat, AT.lng, geohash(AT.lat, AT.lng, 5), geohash(AT.lat, AT.lng, 7), cuisines.join(" "), Date.now())
    .run();
}

beforeAll(async () => {
  await place("st_a", "Beşiktaş Pide", ["pide"]);
  await place("st_b", "Çarşı Pide", ["pide"]);
  await place("st_c", "Deniz Balık", ["seafood"]);
  await env.PLACES_TR.prepare(
    "INSERT INTO place_source (source, source_id, place_id, attached, fetched_at) VALUES ('publisher:lokand.com', 'biz_123', 'st_c', 1, 1)",
  ).run();
});

// Called directly (not through SELF) so the waitUntil writes can be awaited.
async function call(path: string, init?: RequestInit) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`https://api.lokadex.test${path}`, init), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

const rpc = (method: string, params: object) =>
  call("/mcp", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });

const rows = async (placeId: string) =>
  (
    await env.CORE.prepare("SELECT day, channel, appearances, lookups FROM place_stat_daily WHERE place_id = ? ORDER BY channel").bind(placeId).all()
  ).results;

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

describe("recording", () => {
  it("counts each returned place once per search, aggregated per day and channel", async () => {
    const q = `/v1/places/search?q=pide&lat=${AT.lat}&lng=${AT.lng}`;
    const ids = ((await (await call(q)).json()) as any).results.map((r: any) => r.id).sort();
    expect(ids).toEqual(["st_a", "st_b"]);
    await call(q);
    expect(await rows("st_a")).toEqual([{ day: today(), channel: "rest", appearances: 2, lookups: 0 }]);
    expect(await rows("st_c")).toEqual([]);
  });

  it("counts detail fetches as lookups, and MCP under its own channel", async () => {
    await call("/v1/places/st_c");
    expect((await call("/v1/places/nope")).status).toBe(404);
    await rpc("tools/call", { name: "get_place", arguments: { id: "st_c" } });
    await rpc("tools/call", { name: "find_places", arguments: { query: "balık", lat: AT.lat, lng: AT.lng } });
    expect(await rows("st_c")).toEqual([
      { day: today(), channel: "mcp", appearances: 1, lookups: 1 },
      { day: today(), channel: "rest", appearances: 0, lookups: 1 },
    ]);
    expect(await rows("nope")).toEqual([]);
  });

  it("swallows a failed write", async () => {
    let task: Promise<unknown> | undefined;
    recorder({ waitUntil: (p) => (task = p) })(Promise.reject(new Error("D1 down")));
    await expect(task).resolves.toBeUndefined();
  });
});

describe("stats", () => {
  it("returns totals for the range and the one before, with a zero-filled daily series", async () => {
    const seed = [
      [daysAgo(0), "rest", 3, 1],
      [daysAgo(0), "mcp", 2, 0],
      [daysAgo(6), "rest", 1, 1],
      [daysAgo(7), "rest", 10, 4],
      [daysAgo(13), "mcp", 5, 0],
      [daysAgo(14), "rest", 100, 100],
    ] as const;
    await env.CORE.batch(
      seed.map(([day, ch, a, l]) =>
        env.CORE.prepare("INSERT INTO place_stat_daily (place_id, day, channel, appearances, lookups) VALUES ('st_b', ?, ?, ?, ?)").bind(day, ch, a, l),
      ),
    );
    const res = await call("/v1/places/st_b/stats?range=7d");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=300");
    const body = (await res.json()) as any;
    expect(body.current).toEqual({
      from: daysAgo(6),
      to: today(),
      appearances: 6,
      lookups: 2,
      by_channel: { rest: { appearances: 4, lookups: 2 }, mcp: { appearances: 2, lookups: 0 } },
    });
    expect(body.previous).toEqual({ from: daysAgo(13), to: daysAgo(7), appearances: 15, lookups: 4 });
    expect(body.daily).toHaveLength(7);
    expect(body.daily[0]).toEqual({ day: daysAgo(6), appearances: 1, lookups: 1 });
    expect(body.daily[3]).toEqual({ day: daysAgo(3), appearances: 0, lookups: 0 });
    expect(body.daily[6]).toEqual({ day: today(), appearances: 5, lookups: 1 });
    expect(Object.keys(body).sort()).toEqual(["about", "current", "daily", "place_id", "previous", "range"]);
  });

  it("defaults to 30 days and rejects other ranges and unknown places", async () => {
    expect(((await (await call("/v1/places/st_a/stats")).json()) as any).daily).toHaveLength(30);
    expect((await call("/v1/places/st_a/stats?range=1y")).status).toBe(400);
    expect((await call("/v1/places/nope/stats")).status).toBe(404);
  });

  it("is addressable by the publisher's own id", async () => {
    await env.CORE.prepare("INSERT INTO place_stat_daily (place_id, day, channel, appearances, lookups) VALUES ('st_c', ?, 'mcp', 0, 2)").bind(today()).run();
    const body = (await (await call("/v1/publishers/Lokand.com/places/biz_123/stats?range=7d")).json()) as any;
    expect(body.publisher).toEqual({ domain: "lokand.com", id: "biz_123" });
    expect(body.place_id).toBe("st_c");
    expect(body.current.lookups).toBe(2);
    expect((await call("/v1/publishers/lokand.com/places/biz_999/stats")).status).toBe(404);
    expect((await call("/v1/publishers/other.example/places/biz_123/stats")).status).toBe(404);
  });
});
