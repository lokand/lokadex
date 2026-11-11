import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { fold, geohash } from "@lokadex/core";

async function insertPlace(id: string, name: string, cuisines: string[]) {
  const lat = 40.9906;
  const lng = 29.0283;
  await env.PLACES_TR.prepare(
    `INSERT INTO place (id, metro, name, name_folded, lat, lng, cell5, cell7, cuisines, updated_at)
     VALUES (?, 'istanbul', ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, name, fold(name), lat, lng, geohash(lat, lng, 5), geohash(lat, lng, 7), cuisines.join(" "), Date.now())
    .run();
}

describe("place shard schema", () => {
  it("finds places by folded name and cuisine through FTS, whatever the spelling", async () => {
    await insertPlace("p1", "Kırmızı Meyhane", ["meze", "seafood"]);
    const q = (term: string) =>
      env.PLACES_TR.prepare(
        "SELECT p.id FROM place_fts f JOIN place p ON p.rowid = f.rowid WHERE place_fts MATCH ?",
      )
        .bind(term)
        .all<{ id: string }>();
    expect((await q(fold("KIRMIZI"))).results.map((r) => r.id)).toEqual(["p1"]);
    expect((await q("seafood")).results.map((r) => r.id)).toEqual(["p1"]);
    expect((await q("kirm*")).results.map((r) => r.id)).toEqual(["p1"]);
  });

  it("keeps FTS in step with updates and drops offerings with their place", async () => {
    await insertPlace("p2", "Mavi Balık", ["seafood"]);
    await env.PLACES_TR.prepare(
      "INSERT INTO offering (id, place_id, source, name, name_folded, updated_at) VALUES ('o1', 'p2', 'publisher:lokand.com', 'Levrek', 'levrek', 1)",
    ).run();
    await env.PLACES_TR.prepare("UPDATE place SET name_folded = 'deniz yildizi' WHERE id = 'p2'").run();
    const hits = await env.PLACES_TR.prepare(
      "SELECT p.id FROM place_fts f JOIN place p ON p.rowid = f.rowid WHERE place_fts MATCH 'mavi'",
    ).all();
    expect(hits.results).toEqual([]);
    await env.PLACES_TR.prepare("DELETE FROM place WHERE id = 'p2'").run();
    const left = await env.PLACES_TR.prepare("SELECT count(*) AS n FROM offering WHERE place_id = 'p2'").first<{ n: number }>();
    expect(left?.n).toBe(0);
  });
});

describe("core schema", () => {
  it("has the publisher, gazetteer and stats tables", async () => {
    const { results } = await env.CORE.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '%_fts%' AND name NOT LIKE 'd1_%' AND name NOT LIKE '_cf_%' ORDER BY name",
    ).all<{ name: string }>();
    expect(results.map((r) => r.name)).toEqual(
      expect.arrayContaining(["api_key", "area", "category_map", "ingest_run", "place_stat_daily", "publisher", "report_agg"]),
    );
  });
});

describe("worker", () => {
  it("answers health checks", async () => {
    const res = await SELF.fetch("https://api.lokadex.test/health");
    expect(await res.json()).toEqual({ ok: true, service: "lokadex", by: "Lokand" });
  });
});
