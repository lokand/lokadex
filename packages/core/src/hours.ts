export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export type DayHours = { open?: string; close?: string; closed?: boolean };
export type Hours = Partial<Record<DayKey, DayHours>>;

const DAYS: DayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export type OpenState =
  | { open: true; closesAt: string }
  | { open: false; opensAt?: string }
  // Not enough data to say: no hours for today, or no usable timezone.
  | { open: null };

function minutes(hhmm: string | undefined): number | null {
  if (!hhmm) return null;
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function localClock(at: Date, timeZone: string): { day: DayKey; minute: number } | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(at);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    const day = get("weekday").slice(0, 3).toLowerCase() as DayKey;
    if (!DAYS.includes(day)) return null;
    return { day, minute: Number(get("hour")) * 60 + Number(get("minute")) };
  } catch {
    return null;
  }
}

// Whether a place is open at `at` in its own timezone. A close time at or
// before the open time runs past midnight (18:00–02:00), so yesterday's hours
// can still be the ones that apply.
export function openState(hours: Hours | null | undefined, timeZone: string | null | undefined, at: Date): OpenState {
  if (!hours || !timeZone) return { open: null };
  const now = localClock(at, timeZone);
  if (!now) return { open: null };
  const todayIdx = DAYS.indexOf(now.day);
  const yesterday = hours[DAYS[(todayIdx + 6) % 7]!];
  const today = hours[now.day];

  const yOpen = minutes(yesterday?.open);
  const yClose = minutes(yesterday?.close);
  if (yesterday && !yesterday.closed && yOpen !== null && yClose !== null && yClose <= yOpen && now.minute < yClose) {
    return { open: true, closesAt: yesterday.close! };
  }

  if (!today) return { open: null };
  if (today.closed) return { open: false };
  const tOpen = minutes(today.open);
  const tClose = minutes(today.close);
  if (tOpen === null || tClose === null) return { open: null };
  const overnight = tClose <= tOpen;
  if (now.minute >= tOpen && (overnight || now.minute < tClose)) {
    return { open: true, closesAt: today.close! };
  }
  return now.minute < tOpen ? { open: false, opensAt: today.open! } : { open: false };
}
