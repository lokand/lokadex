// Dietary tags as a bitmask so a place row can say "has vegan offerings"
// in one indexed integer. Tag names match Lokand's DIETARY_TAGS.
export const DIET_BITS = {
  vegan: 1,
  vegetarian: 2,
  halal: 4,
  kosher: 8,
  gluten_free: 16,
  dairy_free: 32,
  nut_free: 64,
  spicy: 128,
  organic: 256,
} as const;

export type DietTag = keyof typeof DIET_BITS;

export function dietMask(tags: Iterable<string>): number {
  let m = 0;
  for (const t of tags) m |= DIET_BITS[t as DietTag] ?? 0;
  return m;
}

export function dietTags(mask: number): DietTag[] {
  return (Object.keys(DIET_BITS) as DietTag[]).filter((t) => (mask & DIET_BITS[t]) !== 0);
}
