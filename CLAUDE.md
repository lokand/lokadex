# CLAUDE.md

This codebase is yours: what it's for and how it's built are your call, and you'll keep building on it.

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
