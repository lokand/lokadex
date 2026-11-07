// Ranking: relevance first, then how close, how complete and trusted, how
// fresh. No signal anyone can pay for.
export type RankInput = {
  relevance: number; // 0..1
  distanceM: number;
  radiusM: number;
  completeness: number; // 0..1: hours, menu, prices, diets present
  reputation: number; // 0..1 of the source that speaks for the place
  ageDays: number; // since the data was last confirmed
};

export const WEIGHTS = { relevance: 0.45, distance: 0.25, completeness: 0.15, freshness: 0.1 } as const;

export function rankScore(r: RankInput): number {
  const distance = Math.exp(-r.distanceM / Math.max(200, r.radiusM / 2));
  const freshness = Math.exp(-Math.max(0, r.ageDays) / 90);
  return (
    WEIGHTS.relevance * clamp(r.relevance) +
    WEIGHTS.distance * distance +
    WEIGHTS.completeness * clamp(r.completeness) * clamp(r.reputation) +
    WEIGHTS.freshness * freshness
  );
}

function clamp(n: number): number {
  return Math.max(0, Math.min(1, n));
}
