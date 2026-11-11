import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./env";
import { checkControl, ControlError } from "./control";
import { mcpHandler } from "./mcp";
import { PAGE } from "./page";
import { ATTRIBUTION, getPlace, SearchError, searchPlaces } from "./search";

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
      control: "/v1/control?domain=example.com&publisher=https://lokand.com&place={id}",
      spec: "https://github.com/lokand/lokadex/blob/main/docs/spec.md",
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
    return c.json(result, 200, { "cache-control": "public, max-age=60" });
  } catch (e) {
    if (e instanceof SearchError) return c.json({ error: e.code, message: e.message }, 400);
    throw e;
  }
});

app.get("/v1/places/:id", async (c) => {
  const place = await getPlace(c.env, c.req.param("id"));
  return place ? c.json(place, 200, { "cache-control": "public, max-age=60" }) : c.json({ error: "not_found" }, 404);
});

app.get("/v1/control", async (c) => {
  const q = c.req.query();
  try {
    return c.json(await checkControl({ domain: q.domain, publisher: q.publisher, place: q.place }), 200, { "cache-control": "no-store" });
  } catch (e) {
    if (e instanceof ControlError) return c.json({ error: e.code, message: e.message }, 400);
    throw e;
  }
});

app.all("/mcp", (c) => mcpHandler(c.env, c.req.raw));

app.notFound((c) => c.json({ error: "not_found" }, 404));
