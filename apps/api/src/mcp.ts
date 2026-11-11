import { getPlace, SearchError, searchPlaces } from "./search";
import type { Env } from "./env";
import { countPlaces, type Recorder } from "./stats";

// Stateless MCP over Streamable HTTP: every POST is one JSON-RPC message
// answered with plain JSON, so no sessions or SSE are needed.
const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

const TOOLS = [
  {
    name: "find_places",
    title: "Find places",
    description:
      "Find restaurants, cafés, bars and other places near a location, in Turkish or English (e.g. query \"sushi\", near \"Kadıköy\"). Returns up to 10 compact results with distance, open-now and contact. Coverage: İstanbul.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to look for: a cuisine, dish, kind of place or name. e.g. \"vegan\", \"balık\", \"third wave coffee\"." },
        near: { type: "string", description: "A district or neighbourhood, e.g. \"Kadıköy\", \"Beşiktaş\", \"Moda\". Use this or lat/lng." },
        lat: { type: "number" },
        lng: { type: "number" },
        radius_m: { type: "number", description: "Search radius in metres, up to 4800." },
        open_now: { type: "boolean", description: "Drop places known to be closed right now." },
        limit: { type: "number", description: "1–10, default 5." },
      },
    },
    annotations: { title: "Find places", readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "get_place",
    title: "Get place",
    description: "Full details for one place from find_places: address, hours, contact and, when a publisher provides it, the menu with prices and diet tags.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    annotations: { title: "Get place", readOnlyHint: true, openWorldHint: false },
  },
];

type Rpc = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(+v) ? +v : undefined);

async function callTool(env: Env, record: Recorder, name: string, args: Record<string, unknown>) {
  const text = (data: unknown, isError = false) => ({
    content: [{ type: "text", text: JSON.stringify(data) }],
    ...(isError ? { isError: true } : { structuredContent: data }),
  });
  try {
    if (name === "find_places") {
      const result = await searchPlaces(env, {
        q: typeof args.query === "string" ? args.query : undefined,
        near: typeof args.near === "string" ? args.near : undefined,
        lat: num(args.lat),
        lng: num(args.lng),
        radiusM: num(args.radius_m),
        openNow: args.open_now === true,
        limit: num(args.limit),
      });
      record(countPlaces(env, result.results.map((r) => r.id), "appearances", "mcp"));
      return text(result);
    }
    if (name === "get_place") {
      const place = typeof args.id === "string" ? await getPlace(env, args.id) : null;
      if (place) record(countPlaces(env, [place.id as string], "lookups", "mcp"));
      return place ? text(place) : text({ error: "not_found" }, true);
    }
  } catch (e) {
    if (e instanceof SearchError) return text({ error: e.code, message: e.message }, true);
    throw e;
  }
  return null;
}

async function handle(env: Env, record: Recorder, msg: Rpc): Promise<object | null> {
  const ok = (result: unknown) => ({ jsonrpc: "2.0", id: msg.id ?? null, result });
  const fail = (code: number, message: string) => ({ jsonrpc: "2.0", id: msg.id ?? null, error: { code, message } });
  if (msg.id === undefined) return null; // notifications get no reply
  switch (msg.method) {
    case "initialize": {
      const asked = String(msg.params?.protocolVersion ?? "");
      return ok({
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "lokadex", title: "Lokadex by Lokand", version: "0.1.0" },
        instructions:
          "Lokadex is an open index of places for AI agents, by Lokand. Use find_places for \"<what> near <where>\" questions, then get_place for details. Cite the attribution field.",
      });
    }
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: TOOLS });
    case "tools/call": {
      const name = String(msg.params?.name ?? "");
      const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
      const result = await callTool(env, record, name, args);
      return result ? ok(result) : fail(-32602, `Unknown tool: ${name}`);
    }
    default:
      return fail(-32601, `Method not found: ${msg.method}`);
  }
}

export async function mcpHandler(env: Env, request: Request, record: Recorder): Promise<Response> {
  if (request.method === "GET") return new Response("Lokadex MCP: POST JSON-RPC here.", { status: 405, headers: { allow: "POST" } });
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { allow: "POST" } });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 });
  }
  const batch = Array.isArray(body);
  const msgs = (batch ? body : [body]) as Rpc[];
  if (!msgs.length || msgs.some((m) => !m || typeof m !== "object" || typeof m.method !== "string")) {
    // Responses from the client (to server requests we never send) are acknowledged.
    if (msgs.every((m) => m && typeof m === "object" && !("method" in m))) return new Response(null, { status: 202 });
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid request" } }, { status: 400 });
  }
  const replies = (await Promise.all(msgs.map((m) => handle(env, record, m)))).filter(Boolean);
  if (!replies.length) return new Response(null, { status: 202 });
  return Response.json(batch ? replies : replies[0]);
}
