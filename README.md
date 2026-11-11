# Lokadex

An open index of places and what they offer — dishes, prices, diets, hours —
built for AI agents. Ask it "vegan food near Kadıköy, open now" and it answers
with real menus. Free to use, open to every publisher. A Lokand project.

## Layout

| Path | What it is |
|---|---|
| `packages/core` | Pure logic: Turkish-aware text folding, name matching, geohash and distance, opening hours, trust scoring, ranking, metros. |
| `packages/spec` | The open publishing format: `/.well-known/lokadex.json`, signed change pings, and the `/place.json` (schema.org JSON-LD) parser. |
| `apps/api` | The Cloudflare Worker: REST + MCP on `api.` / `mcp.`, ingestion, workflows. D1 migrations under `migrations/`. |

## API

| Endpoint | What it returns |
|---|---|
| `GET /v1/places/search?q=&near=` (or `lat`, `lng`) | Up to 10 ranked places. |
| `GET /v1/places/{id}` | One place with its menu. |
| `GET /v1/places/{id}/stats?range=7d\|30d\|90d` | How often agents met the place: `appearances` (returned in a search) and `lookups` (detail fetched), for the range and the one before, plus a daily series and a `rest`/`mcp` split. |
| `GET /v1/publishers/{domain}/places/{publisher_place_id}/stats` | The same, addressed by the publisher's own id (`identifier` in its `/place.json`). |
| `POST /mcp` | MCP server: `find_places`, `get_place`. |

No auth. Stats are open to everyone and aggregate only: counts per place,
UTC day and channel, never queries, locations, IPs or user agents. They are
unverified (anyone can inflate them by searching) and ranking never reads
them. They live in the core database, not a place shard, because they can't
be rebuilt from the open-data drops.

## Develop

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm dev:api        # http://localhost:8789
```
