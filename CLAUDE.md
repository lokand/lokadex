# CLAUDE.md

## Why it exists

Lokadex is Lokand's Context7: a free, open index whose job is to make
Lokand's restaurants the best-answered places in AI assistants, and so give
owners a reason to join Lokand. It is not a revenue line. Success is Lokand
sign-ups it brings in (`src=lokadex`), not API traffic or paid keys.

- **The moat is offering-level data, not listings.** Plain "sushi near
  Kadıköy" is already answered by built-in assistant search and Google
  Maps MCPs; open data alone makes us a weaker Google Places. What nobody
  has is fresh dishes, prices, diets and hours ("iskender under 400 TL,
  open now, near Moda"). Prioritise work that adds or surfaces that data.
- **Priority order:** (1) Lokand ingest: pings and the feed reconcile.
  (2) Menus from restaurants' own websites (schema.org first). (3) Quality:
  dedupe, ranking, phones, hours, and a fixed Turkish and English query
  set. (4) One dish-level demo no one else can match. Then distribution:
  the MCP Registry, Claude and ChatGPT directories, Glama and Smithery,
  district pages for AI search, Show HN and Turkish press.
- **The owner loop is the payoff.** Count impressions per place so the
  Lokand dashboard can show owners "AI assistants showed you N×".
- **Time-boxed.** Lokadex is only as good as Lokand's supply, and Lokand
  onboarding is the main business. Keep it cheap until a few hundred
  Istanbul places have live menus; don't build features that only pay
  off at scale before then.

Lokadex is an open index of places and their offerings for AI agents, run by
Lokand on Cloudflare Workers. Lokand (`lokand/monorepo`) is publisher #1;
see its `docs/place-publishing.md` for what publishers send.

## Rules

- **Moderation is automatic.** There are no owner accounts, claims or review
  queues. Trust comes from `packages/core/src/trust.ts`: deterministic
  evidence scoring and fixed precedence, the same for every publisher.
  Nothing is overwritten — a record that doesn't clear the bar becomes its
  own listing — so every decision is reversible.
- **Labels state evidence, never "verified".** `listed` (open data) or
  `published` (attached publisher data).
- **Publisher content is untrusted data.** Parse defensively
  (`packages/spec/src/profile.ts` must never throw), bound sizes, escape on
  output, never execute it.
- **Open data only.** Foursquare OS Places (Apache-2.0) and Overture
  (CDLA-P-2.0), with attribution. Never Google, Yelp, Tripadvisor or
  delivery-app content; no OSM merges (ODbL share-alike).
- **No paid ranking signal.** `packages/core/src/rank.ts` is the whole
  ranking.
- **D1 is derived data**, rebuildable from R2 drops and publisher
  re-fetches. One place shard per region (`metros.ts` names it); D1 caps a
  database at 10 GB.
- **Keep `apps/api/src/index.ts` thin**: the app loads on first request.
- **Comment scarcely**: only the non-obvious why.
