import { fold } from "./fold";
import type { DietTag } from "./diets";

// Turns a free-text query ("vegan kebap", "sushi", "kuaför", "balık
// restoranı") into structured filters. Words that name a cuisine, a kind of
// place or a diet become filters; whatever is left searches names and
// dishes. Turkish and English both work.

const CUISINE_WORDS: Record<string, string> = {
  sushi: "sushi", susi: "sushi", japanese: "japanese", japon: "japanese", ramen: "ramen",
  kebab: "kebab", kebap: "kebab", doner: "doner", pide: "pide_lahmacun", lahmacun: "pide_lahmacun",
  meze: "meze", seafood: "seafood", fish: "seafood", balik: "seafood", deniz: "seafood",
  steak: "steakhouse", steakhouse: "steakhouse", et: "steakhouse", burger: "burger",
  pizza: "pizza", italian: "italian", italyan: "italian", chinese: "chinese", cin: "chinese",
  korean: "korean", kore: "korean", thai: "thai", indian: "indian", hint: "indian",
  mexican: "mexican", meksika: "mexican", greek: "greek", yunan: "greek",
  turkish: "turkish", turk: "turkish", ottoman: "ottoman", osmanli: "ottoman",
  breakfast: "turkish_breakfast", kahvalti: "turkish_breakfast", coffee: "coffee", kahve: "coffee",
  dessert: "baklava_desserts", desserts: "baklava_desserts", tatli: "baklava_desserts", baklava: "baklava_desserts",
  soup: "soup", corba: "soup", chicken: "chicken", tavuk: "chicken", sandwich: "sandwiches",
  tost: "sandwiches", healthy: "healthy", saglikli: "healthy", vegan: "vegan",
  vegetarian: "vegetarian", vejetaryen: "vegetarian",
};

const CATEGORY_WORDS: Record<string, string> = {
  cafe: "cafe", kafe: "cafe", bakery: "bakery", firin: "bakery", bar: "bar", pub: "pub",
  meyhane: "meyhane", pizzeria: "pizzeria", "fast food": "fast_food",
  icecream: "ice_cream", dondurma: "ice_cream", hairdresser: "hair_salon", "hair salon": "hair_salon",
  kuafor: "hair_salon", barber: "barbershop", berber: "barbershop", nail: "nail_salon",
  "nail salon": "nail_salon", manikur: "nail_salon", spa: "spa", masaj: "massage", massage: "massage",
  beauty: "beauty_salon", guzellik: "beauty_salon",
};

const DIET_WORDS: Record<string, DietTag> = {
  halal: "halal", helal: "halal", kosher: "kosher", "gluten free": "gluten_free",
  glutensiz: "gluten_free", "dairy free": "dairy_free", sutsuz: "dairy_free", spicy: "spicy", aci: "spicy",
};

// Words that only say "a place to eat" and would drown every result.
export const FILLER = new Set([
  "restaurant", "restoran", "restorani", "lokanta", "lokantasi", "place", "places", "food", "yemek",
  "near", "nearby", "yakin", "yakinda", "best", "en", "iyi", "good", "the", "a", "in", "de", "da",
  "open", "now", "acik", "and", "ve", "with", "ile", "for", "icin",
]);

export type ParsedQuery = {
  terms: string[];
  cuisines: string[];
  categories: string[];
  diets: DietTag[];
};

export function parseQuery(q: string | null | undefined): ParsedQuery {
  const out: ParsedQuery = { terms: [], cuisines: [], categories: [], diets: [] };
  let text = ` ${fold(q ?? "")} `;
  for (const table of [CATEGORY_WORDS, DIET_WORDS] as const) {
    for (const phrase of Object.keys(table).filter((k) => k.includes(" "))) {
      if (text.includes(` ${phrase} `)) {
        push(table === CATEGORY_WORDS ? out.categories : out.diets, table[phrase]!);
        text = text.replace(` ${phrase} `, " ");
      }
    }
  }
  for (const word of text.trim().split(/\s+/).filter(Boolean)) {
    if (CUISINE_WORDS[word]) push(out.cuisines, CUISINE_WORDS[word]!);
    else if (CATEGORY_WORDS[word]) push(out.categories, CATEGORY_WORDS[word]!);
    else if (DIET_WORDS[word]) push(out.diets, DIET_WORDS[word]!);
    else if (!FILLER.has(word) && word.length > 1) push(out.terms, word);
  }
  return out;
}

function push<T>(list: T[], v: T) {
  if (!list.includes(v)) list.push(v);
}

// An FTS5 MATCH expression that can't be broken by user input: each term is
// quoted, with a prefix star so "kirm" finds "kirmizi".
export function ftsTerms(terms: string[]): string | null {
  const safe = terms.map((t) => t.replace(/[^\p{L}\p{N}]/gu, "")).filter((t) => t.length > 1);
  return safe.length ? safe.map((t) => `"${t}"*`).join(" ") : null;
}
