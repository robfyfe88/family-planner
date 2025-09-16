export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type RecurrenceKind = "none" | "weekly" | "biweekly" | "every_n_weeks";

export function parseDateOnly(input: string | Date): Date {
  const d = typeof input === "string" ? new Date(input) : input;
  if (isNaN(d.getTime())) throw new Error("Invalid date");
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function ymd(d: Date): string {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
    .toISOString()
    .slice(0, 10);
}

export function addDays(d: Date, n: number): Date {
  const nd = new Date(d);
  nd.setDate(nd.getDate() + n);
  return nd;
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

export function clampRange(a: Date, b: Date) {
  return a <= b ? { lo: a, hi: b } : { lo: b, hi: a };
}

export function expandActivityDates(
  startISO: string,
  endISO: string,
  kind: RecurrenceKind,
  daysOfWeek: Weekday[],
  intervalWeeks?: number,
  windowLo?: Date,
  windowHi?: Date
): string[] {
  const s = parseDateOnly(startISO);
  const e = parseDateOnly(endISO);
  const { lo, hi } = clampRange(s, e);
  const wLo = windowLo ?? lo;
  const wHi = windowHi ?? hi;
  if (hi < wLo || lo > wHi) return [];

  const out: string[] = [];
  const push = (d: Date) => {
    if (d >= wLo && d <= wHi) out.push(ymd(d));
  };

  const addWeeklyLike = (gapWeeks: number) => {
    const anchorWeekStart = addDays(s, -s.getDay()); // Sunday-based
    for (let ws = new Date(anchorWeekStart); ws <= hi; ws = addDays(ws, 7 * gapWeeks)) {
      for (const wd of daysOfWeek) {
        const occ = addDays(ws, wd);
        if (occ >= lo && occ <= hi) push(occ);
      }
    }
  };

  switch (kind) {
    case "none":
      for (let d = new Date(lo); d <= hi; d = addDays(d, 1)) push(d);
      break;
    case "weekly":
      addWeeklyLike(1);
      break;
    case "biweekly":
      addWeeklyLike(2);
      break;
    case "every_n_weeks":
      addWeeklyLike(Math.max(1, intervalWeeks ?? 1));
      break;
  }
  return out;
}

export function countByMonth(
  startISO: string,
  endISO: string,
  kind: RecurrenceKind,
  daysOfWeek: Weekday[],
  intervalWeeks?: number
): Map<string, number> {
  const s = parseDateOnly(startISO);
  const e = parseDateOnly(endISO);
  const { lo, hi } = clampRange(s, e);

  const res = new Map<string, number>();
  for (
    let cursor = startOfMonth(lo);
    cursor <= hi;
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
  ) {
    const monthLo = startOfMonth(cursor);
    const monthHi = endOfMonth(cursor);
    const occs = expandActivityDates(startISO, endISO, kind, daysOfWeek, intervalWeeks, monthLo, monthHi);
    if (occs.length) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
      res.set(key, occs.length);
    }
  }
  return res;
}
