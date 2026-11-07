import type { DayKey, Hours } from "@lokadex/core";

// Reads a place profile — schema.org JSON-LD, as served at /place.json or
// embedded in a page — into the index's shape. Input is untrusted: every
// field is optional, sizes are bounded, unknown shapes are skipped, and it
// never throws on bad data.

export type ProfileOffering = {
  name: string;
  description: string | null;
  // Null when the item has no price ("price on request").
  price: number | null;
  variations: { name: string; price: number }[];
  currency: string | null;
  soldOut: boolean;
  diets: string[];
  allergens: string[];
  contains: string[];
  section: string | null;
};

export type ProfileMenu = { name: string; offerings: ProfileOffering[] };

export type PlaceProfile = {
  identifier: string | null;
  name: string;
  schemaType: string;
  url: string | null;
  description: string | null;
  telephone: string | null;
  lat: number | null;
  lng: number | null;
  address: {
    streetAddress?: string;
    addressLocality?: string;
    addressRegion?: string;
    postalCode?: string;
    addressCountry?: string;
  } | null;
  sameAs: string[];
  servesCuisine: string[];
  category: string | null;
  cuisines: string[];
  timezone: string | null;
  currency: string | null;
  hours: Hours | null;
  menus: ProfileMenu[];
};

const MAX_TEXT = 2000;
const MAX_MENUS = 20;
const MAX_OFFERINGS = 3000;

const PLACE_TYPES = new Set([
  "Restaurant", "CafeOrCoffeeShop", "Bakery", "BarOrPub", "Brewery", "FastFoodRestaurant",
  "IceCreamShop", "FoodEstablishment", "LocalBusiness", "Winery", "Distillery",
]);

const DIET_URLS: Record<string, string> = {
  VeganDiet: "vegan",
  VegetarianDiet: "vegetarian",
  HalalDiet: "halal",
  KosherDiet: "kosher",
  GlutenFreeDiet: "gluten_free",
  DiabeticDiet: "diabetic",
  LowLactoseDiet: "dairy_free",
};

const DAY_BY_NAME: Record<string, DayKey> = {
  monday: "mon", tuesday: "tue", wednesday: "wed", thursday: "thu",
  friday: "fri", saturday: "sat", sunday: "sun",
};

type Node = Record<string, unknown>;

const isNode = (v: unknown): v is Node => typeof v === "object" && v !== null && !Array.isArray(v);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);

function text(v: unknown, max = MAX_TEXT): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
}

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number.parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function types(n: Node): string[] {
  return list(n["@type"]).filter((t): t is string => typeof t === "string").map((t) => t.replace(/^https?:\/\/schema\.org\//, ""));
}

function nodesOf(doc: unknown): Node[] {
  if (Array.isArray(doc)) return doc.flatMap(nodesOf);
  if (!isNode(doc)) return [];
  if (Array.isArray(doc["@graph"])) return (doc["@graph"] as unknown[]).flatMap(nodesOf);
  return [doc];
}

function props(n: Node): Map<string, unknown> {
  const m = new Map<string, unknown>();
  for (const p of list(n.additionalProperty)) {
    if (isNode(p) && typeof p.propertyID === "string") m.set(p.propertyID, p.value);
  }
  return m;
}

function strings(v: unknown, max = 50): string[] {
  return list(v)
    .map((x) => text(x, 120))
    .filter((x): x is string => !!x)
    .slice(0, max);
}

function hhmm(v: unknown): string | null {
  const m = typeof v === "string" ? /^(\d{1,2}):(\d{2})/.exec(v) : null;
  if (!m) return null;
  const h = Number(m[1]);
  return h <= 24 ? `${String(h % 24).padStart(2, "0")}:${m[2]}` : null;
}

function readHours(specs: unknown): Hours | null {
  const out: Hours = {};
  for (const s of list(specs)) {
    if (!isNode(s)) continue;
    const opens = hhmm(s.opens);
    const closes = hhmm(s.closes);
    for (const d of list(s.dayOfWeek)) {
      if (typeof d !== "string") continue;
      const day = DAY_BY_NAME[d.replace(/^https?:\/\/schema\.org\//, "").toLowerCase()];
      if (!day) continue;
      out[day] = opens && closes && opens !== closes ? { open: opens, close: closes } : { closed: true };
    }
  }
  return Object.keys(out).length ? out : null;
}

function readOffering(n: Node, section: string | null, fallbackCurrency: string | null): ProfileOffering | null {
  const name = text(n.name, 200);
  if (!name) return null;
  const offers = list(n.offers).filter(isNode);
  const priced = offers
    .map((o) => ({ name: text(o.name, 120), price: num(o.price), currency: text(o.priceCurrency, 3) }))
    .filter((o) => o.price !== null && o.price >= 0);
  const variations = priced.length > 1 ? priced.map((o) => ({ name: o.name ?? "", price: o.price! })) : [];
  const single = priced.length === 1 ? priced[0]!.price : null;
  const p = props(n);
  const diets = new Set<string>([
    ...strings(n.suitableForDiet)
      .map((u) => DIET_URLS[u.replace(/^https?:\/\/schema\.org\//, "")])
      .filter((d): d is string => !!d),
    ...strings(p.get("dietaryTags")),
  ]);
  return {
    name,
    description: text(n.description),
    price: variations.length ? Math.min(...variations.map((v) => v.price)) : single && single > 0 ? single : null,
    variations,
    currency: priced[0]?.currency ?? fallbackCurrency,
    soldOut: offers.some((o) => typeof o.availability === "string" && /SoldOut|OutOfStock/.test(o.availability)),
    diets: [...diets],
    allergens: strings(p.get("allergens")),
    contains: strings(p.get("contains")),
    section,
  };
}

function readMenu(n: Node, currency: string | null, budget: { left: number }): ProfileMenu {
  const offerings: ProfileOffering[] = [];
  const take = (items: unknown, section: string | null) => {
    for (const it of list(items)) {
      if (budget.left <= 0) return;
      if (!isNode(it) || !types(it).includes("MenuItem")) continue;
      const o = readOffering(it, section, currency);
      if (o) {
        offerings.push(o);
        budget.left--;
      }
    }
  };
  const walk = (sections: unknown, depth: number) => {
    if (depth > 4) return;
    for (const s of list(sections)) {
      if (!isNode(s)) continue;
      take(s.hasMenuItem, text(s.name, 120));
      walk(s.hasMenuSection, depth + 1);
    }
  };
  walk(n.hasMenuSection, 0);
  take(n.hasMenuItem, null);
  return { name: text(n.name, 200) ?? "Menu", offerings };
}

export function parsePlaceProfile(doc: unknown): PlaceProfile | null {
  const nodes = nodesOf(doc);
  const place = nodes.find((n) => types(n).some((t) => PLACE_TYPES.has(t)) && text(n.name));
  if (!place) return null;
  const byId = new Map(nodes.filter((n) => typeof n["@id"] === "string").map((n) => [n["@id"] as string, n]));
  const currency = text(place.currenciesAccepted, 3);
  const p = props(place);

  const menuNodes = list(place.hasMenu)
    .map((m) => (isNode(m) && typeof m["@id"] === "string" && !m["@type"] ? byId.get(m["@id"]) : m))
    .filter((m): m is Node => isNode(m) && types(m).includes("Menu"));
  for (const n of nodes) if (types(n).includes("Menu") && !menuNodes.includes(n)) menuNodes.push(n);
  const budget = { left: MAX_OFFERINGS };
  const menus = menuNodes.slice(0, MAX_MENUS).map((m) => readMenu(m, currency, budget));

  const geo = isNode(place.geo) ? place.geo : null;
  const lat = num(geo?.latitude);
  const lng = num(geo?.longitude);
  const validGeo = lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

  const addr = isNode(place.address) ? place.address : null;
  const address = addr
    ? Object.fromEntries(
        (["streetAddress", "addressLocality", "addressRegion", "postalCode", "addressCountry"] as const)
          .map((k) => [k, text(addr[k], 200)])
          .filter(([, v]) => v),
      )
    : typeof place.address === "string"
      ? { streetAddress: text(place.address, 300)! }
      : null;

  return {
    identifier: text(place.identifier, 128),
    name: text(place.name, 200)!,
    schemaType: types(place).find((t) => PLACE_TYPES.has(t)) ?? "LocalBusiness",
    url: text(place.url, 500),
    description: text(place.description),
    telephone: text(place.telephone, 40),
    lat: validGeo ? lat : null,
    lng: validGeo ? lng : null,
    address: address && Object.keys(address).length ? address : null,
    sameAs: strings(place.sameAs, 20).filter((u) => /^https?:\/\//.test(u)),
    servesCuisine: strings(place.servesCuisine, 12),
    category: text(p.get("category"), 40),
    cuisines: strings(p.get("cuisines"), 6),
    timezone: text(p.get("timezone"), 64),
    currency,
    hours: readHours(place.openingHoursSpecification),
    menus,
  };
}
