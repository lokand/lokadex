import {
  boundingBox,
  dietMask,
  dietTags,
  distanceMeters,
  fold,
  FILLER,
  ftsTerms,
  MAX_RADIUS_M,
  METROS,
  metroAt,
  openState,
  parseQuery,
  rankScore,
  tokens,
  type Hours,
} from "@lokadex/core";
import type { Env } from "./env";

export const ATTRIBUTION =
  "Lokadex, a Lokand project. Place data: Foursquare Open Source Places (Apache-2.0) and publishers.";

export type SearchParams = {
  q?: string;
  near?: string;
  lat?: number;
  lng?: number;
  radiusM?: number;
  openNow?: boolean;
  limit?: number;
  now?: Date;
};

export class SearchError extends Error {
  constructor(public code: "no_location" | "unknown_area" | "out_of_coverage" | "too_broad", message: string) {
    super(message);
  }
}

type Center = { name: string | null; lat: number; lng: number; radiusM: number };

type PlaceRow = {
  rowid: number;
  id: string;
  name: string;
  lat: number;
  lng: number;
  street: string | null;
  locality: string | null;
  category: string | null;
  cuisines: string | null;
  diets: number;
  phone: string | null;
  website: string | null;
  hours: string | null;
  timezone: string | null;
  label: string;
  best_source: string | null;
  updated_at: number;
};

const COLS =
  "p.rowid, p.id, p.name, p.lat, p.lng, p.street, p.locality, p.category, p.cuisines, p.diets, p.phone, p.website, p.hours, p.timezone, p.label, p.best_source, p.updated_at";

// FTS gives candidates; an area only counts when the text names all of it
// ("istanbul" must not land on "İstanbul Havalimanı").
async function findArea(env: Env, text: string): Promise<Center | null> {
  const words = tokens(text);
  const match = ftsTerms(words);
  if (!match) return null;
  const { results } = await env.CORE.prepare(
    `SELECT a.name, a.name_folded, a.lat, a.lng, a.radius_m FROM area_fts f JOIN area a ON a.rowid = f.rowid
     WHERE area_fts MATCH ? ORDER BY bm25(area_fts), a.radius_m DESC LIMIT 10`,
  )
    .bind(match)
    .all<{ name: string; name_folded: string; lat: number; lng: number; radius_m: number }>();
  const row = results.find((a) => {
    const parts = a.name_folded.split(/\s+/);
    return parts.length <= words.length && parts.every((part) => words.some((w) => part.startsWith(w)));
  });
  return row ? { name: row.name, lat: row.lat, lng: row.lng, radiusM: row.radius_m } : null;
}

const isMetroName = (text: string) => METROS.some((m) => fold(m.name) === fold(text) || m.id === fold(text));

async function resolveCenter(env: Env, p: SearchParams, leftover: string[]): Promise<{ center: Center; terms: string[] }> {
  if (typeof p.lat === "number" && typeof p.lng === "number") {
    return { center: { name: null, lat: p.lat, lng: p.lng, radiusM: 1500 }, terms: leftover };
  }
  if (p.near?.trim()) {
    if (isMetroName(p.near)) throw new SearchError("too_broad", `"${p.near}" is a whole city. Name a district or neighbourhood, like Kadıköy or Beşiktaş, or pass lat/lng.`);
    const area = await findArea(env, p.near);
    if (!area) throw new SearchError("unknown_area", `Couldn't find "${p.near}". Try a district like Kadıköy or Beşiktaş, or pass lat/lng.`);
    return { center: area, terms: leftover };
  }
  // "sushi kadıköy": a query word that names an area becomes the location.
  const rest = leftover.filter((w) => !isMetroName(w));
  for (const word of rest) {
    const area = await findArea(env, word);
    if (area && area.name && fold(area.name) === word) return { center: area, terms: rest.filter((w) => w !== word) };
  }
  throw new SearchError("no_location", rest.length < leftover.length ? "İstanbul is a whole city. Name a district or neighbourhood, like Kadıköy or Beşiktaş." : "Say where: pass `near` (e.g. Kadıköy) or `lat` and `lng`.");
}

export async function searchPlaces(env: Env, p: SearchParams) {
  const now = p.now ?? new Date();
  const parsed = parseQuery(p.q);
  const { center, terms } = await resolveCenter(env, p, parsed.terms);
  const metro = metroAt(center.lat, center.lng);
  if (!metro) throw new SearchError("out_of_coverage", "Lokadex covers İstanbul so far; more cities are coming.");
  const db = env.PLACES_TR;
  const radiusM = Math.min(Math.max(100, p.radiusM ?? Math.max(center.radiusM, 800)), MAX_RADIUS_M);
  const box = boundingBox(center, radiusM);
  const limit = Math.min(Math.max(1, p.limit ?? 5), 10);

  const where = ["p.status = 'active'", "p.lat BETWEEN ? AND ?", "p.lng BETWEEN ? AND ?"];
  const binds: unknown[] = [box.latLo, box.latHi, box.lngLo, box.lngHi];
  if (parsed.categories.length) {
    where.push(`p.category IN (${parsed.categories.map(() => "?").join(", ")})`);
    binds.push(...parsed.categories);
  }
  // Open data has no diet flags, only cuisine tags like "halal".
  const dietWhere = parsed.diets.map(() => "((p.diets & ?) != 0 OR (' ' || p.cuisines || ' ') LIKE ? OR p.name_folded LIKE ?)");
  const dietBinds = parsed.diets.flatMap((d) => [dietMask([d]), `% ${d} %`, `%${fold(d === "halal" ? "helal" : d.replace("_", " "))}%`]);
  where.push(...dietWhere);
  binds.push(...dietBinds);

  // Words the parser turned into facets ("lahmacun", "helal") still match
  // names, since open data rarely tags them.
  const words = tokens(p.q ?? "").filter((w) => !FILLER.has(w) && (terms.includes(w) || !parsed.terms.includes(w)));
  const facetWords = words.filter((w) => !terms.includes(w));
  const match: string[] = [];
  const nameTerms = ftsTerms(terms);
  const facet = parsed.cuisines.map((c) => `cuisines:"${c}"`);
  if (facetWords.length && parsed.cuisines.length) {
    facet.push(`name_folded:(${facetWords.map((w) => ftsTerms([w])).filter(Boolean).join(" OR ")})`);
  }
  if (facet.length) match.push(`(${facet.join(" OR ")})`);
  if (nameTerms) match.push(`name_folded:(${nameTerms})`);

  let rows: (PlaceRow & { rel: number })[];
  if (match.length) {
    const res = await db
      .prepare(
        `SELECT ${COLS}, bm25(place_fts) AS rel FROM place_fts f JOIN place p ON p.rowid = f.rowid
         WHERE place_fts MATCH ? AND ${where.join(" AND ")} ORDER BY rel LIMIT 300`,
      )
      .bind(match.join(" AND "), ...binds)
      .all<PlaceRow & { rel: number }>();
    rows = res.results;
    // Dishes count too: places whose menu has the words, from publishers.
    const dishTerms = ftsTerms(words);
    if (dishTerms) {
      const dishes = await db
        .prepare(
          `SELECT ${COLS}, bm25(offering_fts) AS rel FROM offering_fts f JOIN offering o ON o.rowid = f.rowid
           JOIN place p ON p.id = o.place_id WHERE offering_fts MATCH ? AND ${where.join(" AND ")} ORDER BY rel LIMIT 200`,
        )
        .bind(dishTerms, ...binds)
        .all<PlaceRow & { rel: number }>();
      const seen = new Set(rows.map((r) => r.id));
      for (const r of dishes.results) if (!seen.has(r.id)) (seen.add(r.id), rows.push(r));
    }
  } else {
    const res = await db
      .prepare(`SELECT ${COLS}, 0 AS rel FROM place p WHERE ${where.join(" AND ")} LIMIT 500`)
      .bind(...binds)
      .all<PlaceRow & { rel: number }>();
    rows = res.results;
  }

  const scored = rows
    .map((r) => {
      const distanceM = Math.round(distanceMeters(center, r));
      const hours = r.hours ? (JSON.parse(r.hours) as Hours) : null;
      const open = openState(hours, r.timezone ?? metro.timezone, now);
      const completeness = [r.phone, r.website, r.hours, r.label === "published" ? 1 : null].filter(Boolean).length / 4;
      // bm25 means little on short names and tags; a name hit is what counts.
      const name = ` ${fold(r.name)} `;
      const relevance = !match.length ? 0.5 : words.some((w) => name.includes(` ${w}`)) ? 1 : 0.8;
      return {
        r,
        distanceM,
        open,
        score:
          rankScore({ relevance, distanceM, radiusM, completeness, reputation: 1, ageDays: (now.getTime() - r.updated_at) / 86_400_000 }) +
          (open.open === true ? 0.05 : 0),
      };
    })
    .filter((s) => s.distanceM <= radiusM && !(p.openNow && s.open.open === false))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return {
    query: { q: p.q ?? null, near: center.name, lat: center.lat, lng: center.lng, radius_m: radiusM, open_now: !!p.openNow },
    results: scored.map(({ r, distanceM, open }) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      cuisines: r.cuisines ? r.cuisines.split(" ") : [],
      diets: dietTags(r.diets),
      distance_m: distanceM,
      address: [r.street, r.locality].filter(Boolean).join(", ") || null,
      lat: r.lat,
      lng: r.lng,
      phone: r.phone ? `+${r.phone}` : null,
      website: r.website,
      open_now: open.open,
      ...(open.open === true ? { closes_at: open.closesAt } : {}),
      label: r.label,
    })),
    note: scored.length === 0 ? "Nothing matched. Try a wider radius or fewer words." : undefined,
    attribution: ATTRIBUTION,
  };
}

export async function getPlace(env: Env, id: string, now = new Date()) {
  const db = env.PLACES_TR;
  const p = await db.prepare("SELECT * FROM place WHERE id = ? AND status = 'active'").bind(id).first<Record<string, unknown>>();
  if (!p) return null;
  const [offerings, sources] = await Promise.all([
    db.prepare(
      "SELECT menu, section, name, description, price, currency, variations, diets, allergens, contains, sold_out FROM offering WHERE place_id = ? LIMIT 300",
    )
      .bind(id)
      .all<Record<string, unknown>>(),
    db.prepare("SELECT source, attached, profile_url, fetched_at FROM place_source WHERE place_id = ?").bind(id).all<Record<string, unknown>>(),
  ]);
  const hours = p.hours ? (JSON.parse(p.hours as string) as Hours) : null;
  const open = openState(hours, (p.timezone as string) ?? null, now);
  const json = (v: unknown) => (typeof v === "string" ? JSON.parse(v) : null);
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    cuisines: p.cuisines ? (p.cuisines as string).split(" ") : [],
    address: { street: p.street, locality: p.locality, region: p.region, postal_code: p.postal_code, country: p.country },
    lat: p.lat,
    lng: p.lng,
    phone: p.phone ? `+${p.phone}` : null,
    website: p.website,
    hours,
    timezone: p.timezone,
    open_now: open.open,
    label: p.label,
    offerings: offerings.results.map((o) => ({
      menu: o.menu,
      section: o.section,
      name: o.name,
      description: o.description,
      price: o.price,
      currency: o.currency,
      variations: json(o.variations),
      diets: dietTags(o.diets as number),
      allergens: json(o.allergens) ?? [],
      contains: json(o.contains) ?? [],
      sold_out: !!o.sold_out,
    })),
    sources: sources.results.map((s) => ({ source: s.source, attached: !!s.attached, fetched_at: new Date(s.fetched_at as number).toISOString() })),
    attribution: ATTRIBUTION,
  };
}
