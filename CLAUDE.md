# CLAUDE.md

## Is there a market, and does it make money?

As a business of its own, probably not, at least for a long time. As a channel for Lokand, possibly, but only once it has menu data nobody else has. Today the live index is open data that anyone can download, so it's a weaker Google Places.

**Is there a market for the MCP?**
- **Plain place search is already crowded.** Claude, ChatGPT and Gemini already answer "sushi near Kadıköy" with built-in search and maps, and there are Google Maps MCPs. Nobody installs a connector for that.
- **What nobody has is dish-level, current data:** "iskender under 400 TL, open now, near Moda", "vegan dishes in Kadıköy", "gluten-free menu items near me". That data only exists where owners keep menus up to date, which is Lokand's data. Right now not a single live place has a menu.
- **Who would use it:** developers building travel, hotel-concierge and city-guide apps, plus heavy AI users. It's a niche. Ordinary diners will reach this data through their assistant's web search reading Lokand sites, which the work already shipped in the monorepo enables, not through an MCP install.

**Will it make money?**
- **Directly: barely.** Context7 doesn't earn much itself either; it's marketing for Upstash. A paid tier for heavy commercial API use could come much later.
- **Indirectly: yes, if it brings in owners.** The pitch "your menu shows up in AI assistants, free" plus a dashboard card ("AI assistants showed your place 340 times") gives owners a reason to sign up and keep their menu current. That feeds Lokand's paid features. Track Lokand sign-ups that come from Lokadex.

**What would improve it, in order**
1. **Connect Lokand data.** Receive Lokand's change notices and feed. This is already designed, and it's what makes Lokadex different.
2. **Read menus from restaurants' own websites.** Many already publish menus in a structured, machine-readable form, and this would add a lot of dish data cheaply.
3. **Quality:** remove duplicates, fix ranking and phone numbers, add opening hours, and build a fixed set of about 200 Turkish and English test queries.
4. **One demo nobody else can do:** a dish-level answer with price and diet, shown side by side with Google.

**Marketing, once step 1 is done**
- List it in the MCP Registry, Claude's connectors directory, ChatGPT apps, Glama and Smithery.
- District pages ("Vegan dishes in Kadıköy, 140 dishes at 38 places") so search engines and AI assistants cite them.
- Show HN as "an open places index for AI agents", Turkish tech press, food creators.
- English answers over Turkish menus, for tourists.

**My recommendation:** limit the time you spend on this. Lokadex is only as good as the menu data behind it, and that comes from Lokand onboarding, which is still the main business. Do step 1 and the directory listings, a few days of work, then go back to Lokand. Push Lokadex harder once a couple of hundred Istanbul restaurants have live menus. If Lokand sign-ups from Lokadex stay near zero after that, keep it as a cheap side project.

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
