// Search text folding. Turkish casing first (İ→i, I→ı), then ı→i and
// diacritics stripped, so "KADIKÖY", "Kadıköy" and "kadikoy" all meet.
// Apostrophe suffixes go too: "Kadıköy'de" → "kadikoy".
export function fold(text: string): string {
  return text
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/['’‘`]\p{L}*/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function tokens(text: string): string[] {
  const f = fold(text);
  return f ? f.split(" ") : [];
}

// Words that say what a place is rather than which one it is. Two places
// called "X Restaurant" and "X Lokantası" are the same name.
const GENERIC = new Set([
  "restaurant", "restoran", "restorant", "lokanta", "lokantasi", "cafe", "kafe",
  "coffee", "kahve", "kahvesi", "bar", "pub", "bistro", "meyhane", "meyhanesi",
  "the", "and", "ve", "evi", "salonu", "kitchen", "mutfak", "mutfagi", "co",
]);

export function coreName(name: string): string {
  const t = tokens(name);
  const core = t.filter((w) => !GENERIC.has(w));
  return (core.length ? core : t).join(" ");
}

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  const t = s.replace(/ /g, "");
  for (let i = 0; i < t.length - 1; i++) {
    const g = t.slice(i, i + 2);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

// Dice coefficient over character bigrams of the core names: 1 for the same
// name, ~0.8+ for small spelling differences, low for different places.
export function nameSimilarity(a: string, b: string): number {
  const x = coreName(a);
  const y = coreName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const bx = bigrams(x);
  const by = bigrams(y);
  let overlap = 0;
  let total = 0;
  for (const [g, n] of bx) {
    overlap += Math.min(n, by.get(g) ?? 0);
    total += n;
  }
  for (const n of by.values()) total += n;
  return total ? (2 * overlap) / total : 0;
}

// E.164-ish digits only, so "+90 (216) 000 00 00" and "02160000000" compare.
export function normalizePhone(raw: string, defaultCountryCode = "90"): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7) return null;
  if (raw.trim().startsWith("+")) return digits;
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith("0")) return defaultCountryCode + digits.slice(1);
  return digits.length > 10 ? digits : defaultCountryCode + digits;
}
