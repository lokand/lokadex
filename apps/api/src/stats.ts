import type { Env } from "./env";

// Public appearance counters. Anyone can inflate them by hammering search,
// which is why nothing in ranking reads them.
export type Channel = "rest" | "mcp";
export type Recorder = (task: Promise<unknown>) => void;

export const RANGES = { "7d": 7, "30d": 30, "90d": 90 } as const;
export type Range = keyof typeof RANGES;

const DAY_MS = 86_400_000;
const utcDay = (t: number) => new Date(t).toISOString().slice(0, 10);

// Recording must never fail or delay a response.
export function recorder(ctx: { waitUntil(p: Promise<unknown>): void }): Recorder {
  return (task) => ctx.waitUntil(task.catch(() => {}));
}

// One statement for a whole result page; search caps results at 10, well
// under D1's bound-parameter limit.
export async function countPlaces(env: Env, ids: string[], metric: "appearances" | "lookups", channel: Channel, now = Date.now()) {
  const unique = [...new Set(ids)].slice(0, 20);
  if (!unique.length) return;
  const day = utcDay(now);
  const [a, l] = metric === "appearances" ? [1, 0] : [0, 1];
  await env.CORE.prepare(
    `INSERT INTO place_stat_daily (place_id, day, channel, appearances, lookups) VALUES ${unique.map(() => "(?, ?, ?, ?, ?)").join(", ")}
     ON CONFLICT (place_id, day, channel) DO UPDATE SET
       appearances = appearances + excluded.appearances, lookups = lookups + excluded.lookups`,
  )
    .bind(...unique.flatMap((id) => [id, day, channel, a, l]))
    .run();
}

export async function placeExists(env: Env, id: string) {
  return !!(await env.PLACES_TR.prepare("SELECT 1 FROM place WHERE id = ?").bind(id).first());
}

// The publisher's own id for a place (`identifier` in its /place.json) maps
// through the place_source row that ingestion writes.
export async function placeIdForPublisher(env: Env, domain: string, externalId: string) {
  const row = await env.PLACES_TR.prepare("SELECT place_id FROM place_source WHERE source = ? AND source_id = ?")
    .bind(`publisher:${domain.toLowerCase()}`, externalId)
    .first<{ place_id: string }>();
  return row?.place_id ?? null;
}

type Counts = { appearances: number; lookups: number };

export async function placeStats(env: Env, placeId: string, range: Range, now = Date.now()) {
  const days = RANGES[range];
  const today = Math.floor(now / DAY_MS) * DAY_MS;
  const from = today - (days - 1) * DAY_MS;
  const prevFrom = from - days * DAY_MS;
  const { results } = await env.CORE.prepare(
    "SELECT day, channel, appearances, lookups FROM place_stat_daily WHERE place_id = ? AND day >= ? AND day <= ?",
  )
    .bind(placeId, utcDay(prevFrom), utcDay(today))
    .all<{ day: string; channel: string } & Counts>();

  const zero = (): Counts => ({ appearances: 0, lookups: 0 });
  const add = (into: Counts, r: Counts) => ((into.appearances += r.appearances), (into.lookups += r.lookups));
  const current = zero();
  const previous = zero();
  const byChannel: Record<Channel, Counts> = { rest: zero(), mcp: zero() };
  const daily = new Map<string, Counts>();
  for (let t = from; t <= today; t += DAY_MS) daily.set(utcDay(t), zero());

  const fromDay = utcDay(from);
  for (const r of results) {
    if (r.day < fromDay) {
      add(previous, r);
      continue;
    }
    add(current, r);
    if (r.channel === "rest" || r.channel === "mcp") add(byChannel[r.channel], r);
    const d = daily.get(r.day);
    if (d) add(d, r);
  }

  return {
    place_id: placeId,
    range,
    current: { from: fromDay, to: utcDay(today), ...current, by_channel: byChannel },
    previous: { from: utcDay(prevFrom), to: utcDay(from - DAY_MS), ...previous },
    daily: [...daily].map(([day, c]) => ({ day, ...c })),
    about:
      "appearances: times this place was returned in a Lokadex search result (REST or MCP). lookups: times its detail was fetched. UTC days; today is partial. Counts are public, unverified and never used for ranking.",
  };
}
