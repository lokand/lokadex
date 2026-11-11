// Trust rules — the whole moderation system. Deterministic, the same for
// every publisher, and run with no human in the loop: a publisher's record
// attaches to a known place only on enough independent evidence, and
// conflicting sources resolve by fixed precedence. Nothing is overwritten,
// so every decision can be reversed by better evidence later.

export type Evidence = {
  // The place's open-data website domain names this publisher and place back,
  // by its /.well-known/lokadex.json or a `_lokadex` DNS TXT record (a
  // control proof, `@lokadex/spec` control.ts).
  bidirectionalDomain?: boolean;
  samePhone?: boolean;
  sameSocial?: boolean;
  distanceM?: number;
  nameSimilarity?: number;
  // The publisher attests real use at the location (e.g. diner traffic).
  inUse?: boolean;
};

const DECISIVE = 1;
const STRONG = 0.6;
const MEDIUM = 0.4;

export const ATTACH_THRESHOLD = 1;
export const NEARBY_M = 100;
export const SAME_NAME = 0.85;

export function evidenceScore(e: Evidence): number {
  if (e.bidirectionalDomain) return DECISIVE;
  let s = 0;
  if (e.samePhone) s += STRONG;
  if (e.sameSocial) s += STRONG;
  if ((e.distanceM ?? Infinity) <= NEARBY_M && (e.nameSimilarity ?? 0) >= SAME_NAME) s += MEDIUM;
  if (e.inUse) s += MEDIUM;
  return Math.min(s, DECISIVE);
}

export function shouldAttach(e: Evidence): boolean {
  return evidenceScore(e) >= ATTACH_THRESHOLD;
}

export type SourceClaim = {
  source: string;
  // 0..1, measured per publisher; open data is 1 for its own fields.
  reputation: number;
  evidence: number;
  bidirectional: boolean;
  fetchedAt: number;
};

// Which source speaks for a place: a site the place itself points to, then
// the strongest evidence weighted by publisher reputation, then the freshest.
export function compareClaims(a: SourceClaim, b: SourceClaim): number {
  if (a.bidirectional !== b.bidirectional) return a.bidirectional ? -1 : 1;
  const wa = a.evidence * a.reputation;
  const wb = b.evidence * b.reputation;
  if (wa !== wb) return wb - wa;
  return b.fetchedAt - a.fetchedAt;
}

export function authoritative<T extends SourceClaim>(claims: T[]): T | null {
  return [...claims].sort(compareClaims)[0] ?? null;
}

export type TrustLabel = "listed" | "published";

export function trustLabel(hasAttachedPublisher: boolean): TrustLabel {
  return hasAttachedPublisher ? "published" : "listed";
}
