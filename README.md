# Lokadex

An open index of places and what they offer — dishes, prices, diets, hours —
built for AI agents. Ask it "vegan food near Kadıköy, open now" and it answers
with real menus. Free to use, open to every publisher. A Lokand project.

## Layout

| Path | What it is |
|---|---|
| `packages/core` | Pure logic: Turkish-aware text folding, name matching, geohash and distance, opening hours, trust scoring, ranking, metros. |
| `docs/spec.md` | The open standard: profile, control proofs (who speaks for a place), pings and feed, and how the fields map to Google and ChatGPT business profiles. |
| `packages/spec` | The open publishing format: `/.well-known/lokadex.json`, signed change pings, and the `/place.json` (schema.org JSON-LD) parser. |
| `apps/api` | The Cloudflare Worker: REST + MCP on `api.` / `mcp.`, ingestion, workflows. D1 migrations under `migrations/`. |

## Develop

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm dev:api        # http://localhost:8789
```
