# Lokadex Place Profile, v1

An open, account-free way for a place (a restaurant, café, shop, studio) to
publish one profile and say who speaks for it. Any index, assistant or
directory can read it; any platform or agency can publish it. Lokadex is one
reader, and Lokand one publisher.

Status: draft v1. Readers MUST ignore fields they don't know. v1 only ever
loosens what a reader accepts.

## Why

Every directory and AI assistant now runs its own claim flow: sign in, find
the listing, prove it's yours by phone, email, a DNS token or a document
check, then retype the same name, hours, photos and links. An owner with
five surfaces does it five times and keeps five copies in sync, and an
agency managing them for the owner has to be invited into each one.

This spec makes the website domain the single source:

- **One profile**, served by the place's own site, in schema.org JSON-LD
  that search engines and assistants already parse.
- **One control proof**, on the domain, that names who publishes it. No
  account, no review queue; anyone can re-check it, and the owner revokes it
  by deleting it.
- **Change pings and a feed**, so readers stay fresh without crawling.

## Documents

| Where | What |
|---|---|
| `<site>/place.json` (any URL the pointer names) | The **profile**: schema.org JSON-LD (see [Profile](#profile)). |
| `<site>/.well-known/lokadex.json` | The **site pointer**: `{ "v": 1, "publisher": "<https origin>", "place": { "id": "<id>", "profile": "<url>" } }`, or `{ "v": 1, "listing": "remove" }`. |
| `_lokadex.<domain>` DNS TXT | The **control record**: `v=lokadex1; publisher=<https origin>; place=<id>`, or `v=lokadex1; listing=remove`. |
| `<publisher>/.well-known/lokadex.json` | The **publisher document**: `{ "v": 1, "keys": [<Ed25519 JWK with kid>] }`. Owning the domain is the publisher's identity. |

`<domain>` is the place's website host, lowercased, without a leading
`www.`. Every document is optional; a profile alone is still readable.

## Control proofs

A place's website domain says which publisher speaks for it. Either proof
is enough, and both are things only whoever controls the domain can do:

- **site**: the domain serves `/.well-known/lokadex.json` itself (HTTP 200,
  no redirect) naming the publisher and the publisher's id for the place.
- **dns**: a TXT record at `_lokadex.<domain>` names the publisher, and the
  place id or no `place` at all (every place that publisher lists with this
  website, e.g. a chain on one domain).

A `listing=remove` on either surface asks readers to drop the domain's
places, and wins over any proof. Nobody approves it.

Readers then match the publisher's profile to their own record of the place
by its website domain: when the place's known website is that domain and the
domain names the publisher back, that is decisive. Without a proof, readers
fall back to weaker evidence (same phone, same social profile, same name
within 100 m), and a profile that doesn't clear the bar stays its own
listing rather than overwriting anything. Lokadex's rules are
`packages/core/src/trust.ts`.

What a proof is not:

- It is not "verified". It shows control of a domain, not identity of a
  person. Lokadex labels attached data `published`, never `verified`.
- It is not exclusive. The owner can point at another publisher at any
  time; readers re-check on every fetch.

**Delegation.** An owner who keeps their own website but has an agency or
platform publish the profile adds one TXT record naming that publisher. To
switch, they change the record. A platform hosting the site (as Lokand does)
serves the site pointer and needs nothing from the owner.

Check any domain: `GET /v1/control?domain=<domain>&publisher=<origin>&place=<id>` on the Lokadex API,
or the `check_place_control` MCP tool.

## Profile

A schema.org `@graph` (or a single node) whose place node has a
`LocalBusiness` subtype. Readers treat it as untrusted: every field is
optional, sizes are bounded, unknown shapes are skipped.

| Field | schema.org | Notes |
|---|---|---|
| Name | `name` | Required. |
| Kind | `@type` | `Restaurant`, `CafeOrCoffeeShop`, `Bakery`, `BarOrPub`, … ; `additionalProperty` `category` for a finer kind. |
| About | `description` | Plain text, ≤ 2000 chars. |
| Website | `url` | Canonical site. |
| Phone | `telephone` | E.164 preferred. |
| Email | `email` | |
| Address | `address` (`PostalAddress`) | |
| Location | `geo` (`GeoCoordinates`) | |
| Hours | `openingHoursSpecification` | `additionalProperty` `timezone` (IANA). |
| Logo / avatar | `logo` | https URL or `ImageObject`. |
| Photos | `image` | Up to 20 https URLs or `ImageObject`s. |
| Links | `sameAs` | Social and other profiles, up to 20. |
| Cuisine | `servesCuisine`; `additionalProperty` `cuisines` | |
| Price level | `priceRange` | e.g. `₺₺`, `$$`. |
| Currency | `currenciesAccepted` | ISO 4217. |
| Menus | `hasMenu` → `Menu` → `hasMenuSection` → `MenuItem` | Prices in `offers` (several = variations), `suitableForDiet`, `offers.availability` `SoldOut`; `additionalProperty` `allergens`, `contains`, `dietaryTags`. |
| Id | `identifier` | The publisher's id for the place; matches the pointer and control record. |

## Pings and feed

- A publisher POSTs `{ "id", "url" }` (or `{ "id" }` when the place went dark)
  to a reader's ping endpoint, signed `lokadex-signature: kid=<kid>,t=<unix>,sig=<base64url Ed25519 over "<t>.<body>">`
  with `lokadex-publisher: <origin>`. Readers verify against the publisher
  document and allow 300 s of clock skew.
- A publisher may offer a keyed feed of its live places, each with its
  profile URL and a content version, so readers can reconcile.

## Mapping to existing business profiles

None of these accept the profile directly today; they are closed products
with their own claim flows. The mapping shows the profile already carries
everything they show, so a publisher or agency can fill them from one
source, and an owner's assistant can read it instead of asking again.

| Profile | ChatGPT Business Hub | Google Business Profile | Google Search profile |
|---|---|---|---|
| Name, kind | Name, category | Name, category | Name |
| About | About | Description | Bio |
| Address, location | Location | Address, map pin | — |
| Phone, email, website | Contact | Phone, website | Website |
| Hours | Hours | Hours | — |
| Logo, photos | Photos | Logo, photos | Avatar |
| Links | — | Social profiles | Linked accounts, links |
| Menus | — | Menu | — |

And their claim methods, next to the control proof:

| Surface | How an owner proves control |
|---|---|
| ChatGPT Business Hub (beta, Nov 2026) | Business phone, business email, DNS TXT `openai-business-claim`, or Shopify; then a Persona ID check. US local listings only. |
| Google Business Profile | Phone, email, video or postcard, per business. |
| Google Search profile (`profile.google.com/claim`) | Signing in to linked social accounts, sometimes a selfie with ID. For creators and brands with a knowledge panel, not local places. |
| This spec | A site pointer or a `_lokadex` TXT on the website domain. |

The DNS route is shared: an owner, or the platform hosting their domain,
who can add `_lokadex` can add a vendor's verification TXT the same way.
Identity checks (Persona, video) stay with the owner; this spec never
replaces them or proves who a person is.

## Security

- Readers never execute profile content, escape it on output, and cap every
  fetch (Lokadex: 16 KB pointers, 4 s timeouts, no redirects for proofs).
- Proofs are fetched only for public DNS names over https.
- Control is re-checked on every profile fetch, so a lapsed domain or a
  removed record stops counting.
