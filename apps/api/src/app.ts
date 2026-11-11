import { type Context, Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./env";
import { mcpHandler } from "./mcp";
import { PAGE } from "./page";
import { ATTRIBUTION, getPlace, SearchError, searchPlaces } from "./search";
import { countPlaces, placeExists, placeIdForPublisher, placeStats, RANGES, recorder, type Range } from "./stats";

export const app = new Hono<{ Bindings: Env }>();

app.use("*", cors({ origin: "*", allowHeaders: ["content-type", "authorization", "mcp-protocol-version", "mcp-session-id"], exposeHeaders: ["mcp-session-id"] }));

app.get("/", (c) =>
  (c.req.header("accept") ?? "").includes("text/html")
    ? c.html(PAGE)
    : c.json({
    service: "Lokadex",
    about: "An open index of places and their offerings for AI agents. Free for everyone. A Lokand project: https://lokand.com",
    endpoints: {
      search: "/v1/places/search?q=sushi&near=Kadıköy",
      place: "/v1/places/{id}",
      stats: "/v1/places/{id}/stats?range=30d",
      publisher_stats: "/v1/publishers/{domain}/places/{publisher_place_id}/stats?range=30d",
      mcp: "/mcp",
    },
    coverage: ["istanbul"],
    attribution: ATTRIBUTION,
  }),
);

app.get("/health", (c) => c.json({ ok: true, service: "lokadex", by: "Lokand" }));

const num = (v: string | undefined) => (v !== undefined && v.trim() !== "" && Number.isFinite(+v) ? +v : undefined);

app.get("/v1/places/search", async (c) => {
  const q = c.req.query();
  try {
    const result = await searchPlaces(c.env, {
      q: q.q,
      near: q.near,
      lat: num(q.lat),
      lng: num(q.lng),
      radiusM: num(q.radius_m),
      openNow: q.open_now === "true" || q.open_now === "1",
      limit: num(q.limit),
    });
    recorder(c.executionCtx)(countPlaces(c.env, result.results.map((r) => r.id), "appearances", "rest"));
    return c.json(result, 200, { "cache-control": "public, max-age=60" });
  } catch (e) {
    if (e instanceof SearchError) return c.json({ error: e.code, message: e.message }, 400);
    throw e;
  }
});

app.get("/v1/places/:id", async (c) => {
  const place = await getPlace(c.env, c.req.param("id"));
  if (place) recorder(c.executionCtx)(countPlaces(c.env, [place.id as string], "lookups", "rest"));
  return place ? c.json(place, 200, { "cache-control": "public, max-age=60" }) : c.json({ error: "not_found" }, 404);
});

const statsResponse = async (c: Context<{ Bindings: Env }>, placeId: string | null, extra: object = {}) => {
  const range = c.req.query("range") ?? "30d";
  if (!(range in RANGES)) return c.json({ error: "bad_range", message: "range is one of 7d, 30d, 90d." }, 400);
  if (!placeId || !(await placeExists(c.env, placeId))) return c.json({ error: "not_found" }, 404);
  return c.json({ ...extra, ...(await placeStats(c.env, placeId, range as Range)) }, 200, { "cache-control": "public, max-age=300" });
};

app.get("/v1/places/:id/stats", (c) => statsResponse(c, c.req.param("id")));

app.get("/v1/publishers/:domain/places/:externalId/stats", async (c) => {
  const domain = c.req.param("domain").toLowerCase();
  const externalId = c.req.param("externalId");
  const placeId = await placeIdForPublisher(c.env, domain, externalId);
  return statsResponse(c, placeId, { publisher: { domain, id: externalId } });
});

app.all("/mcp", (c) => mcpHandler(c.env, c.req.raw, recorder(c.executionCtx)));

app.notFound((c) => c.json({ error: "not_found" }, 404));
