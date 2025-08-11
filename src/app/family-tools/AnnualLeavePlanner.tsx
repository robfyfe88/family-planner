"use client";
import React, { useMemo, useState, useEffect, useRef } from "react";

/** ---------- Types ---------- */
type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // Sun..Sat
interface ParentConfig {
  name: string;
  offDays: Weekday[]; // weekly days off (no leave needed)
  allowance: number;  // total leave days available
}
interface PlanInput {
  parentA: ParentConfig;
  parentB: ParentConfig;
  schoolClosedDates: string[]; // "YYYY-MM-DD"
  jointDays: number;
  skipWeekends: boolean;
  overrides?: Record<string, "A" | "B" | "both">; // forced leave
  prioritizeSeasons?: boolean;
}
type Coverage =
  | { type: "none" }
  | { type: "off"; parent: "A" | "B" | "both" }
  | { type: "leave"; parent: "A" | "B" | "both" };
interface DayPlan {
  date: string;
  weekday: string;
  coverage: Coverage;
}

/** ---------- Date helpers ---------- */
const weekdayName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function parseDate(s: string): Date | null {
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function ymd(d: Date): string {
  const tz = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  return tz.toISOString().slice(0, 10);
}
function addDays(d: Date, n: number): Date {
  const nd = new Date(d);
  nd.setDate(nd.getDate() + n);
  return nd;
}
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function sameMonth(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}
function isWeekend(d: Date) {
  const g = d.getDay();
  return g === 0 || g === 6;
}

/** ---------- Planner helpers ---------- */
function groupConsecutive(dates: Date[]): Date[][] {
  const res: Date[][] = [];
  const s = [...dates].sort((a, b) => a.getTime() - b.getTime());
  let cur: Date[] = [];
  for (let i = 0; i < s.length; i++) {
    if (i === 0) cur = [s[i]];
    else {
      const prev = s[i - 1];
      const diff = Math.round((s[i].getTime() - prev.getTime()) / 86400000);
      if (diff === 1) cur.push(s[i]);
      else {
        res.push(cur);
        cur = [s[i]];
      }
    }
  }
  if (cur.length) res.push(cur);
  return res;
}
function windowContains(date: Date, start: Date, end: Date) {
  return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
}
function getSeasonWindows(forYears: number[]) {
  const win: { name: "christmas" | "summer"; start: Date; end: Date }[] = [];
  for (const y of forYears) {
    win.push({ name: "summer", start: new Date(y, 5, 20), end: new Date(y, 8, 1) });
    win.push({ name: "christmas", start: new Date(y, 11, 15), end: new Date(y + 1, 0, 7) });
  }
  return win;
}

/** ---------- Core planner (block-first, minimal splits) ---------- */
function planAnnualLeave(input: PlanInput) {
  const A = { ...input.parentA };
  const B = { ...input.parentB };
  const overrides = input.overrides ?? {};
  const offSetA = new Set<Weekday>(A.offDays);
  const offSetB = new Set<Weekday>(B.offDays);

  const dates = input.schoolClosedDates
    .map(parseDate)
    .filter((d): d is Date => !!d)
    .filter((d) => (input.skipWeekends ? !isWeekend(d) : true))
    .sort((a, b) => a.getTime() - b.getTime());

  const plan: DayPlan[] = dates.map((d) => {
    const w = d.getDay() as Weekday;
    const aOff = offSetA.has(w);
    const bOff = offSetB.has(w);
    const coverage: Coverage =
      aOff && bOff ? { type: "off", parent: "both" }
      : aOff ? { type: "off", parent: "A" }
      : bOff ? { type: "off", parent: "B" }
      : { type: "none" };
    return { date: ymd(d), weekday: weekdayName[w], coverage };
  });

  // Apply overrides (consume allowance)
  for (const p of plan) {
    const ov = overrides[p.date];
    if (!ov || p.coverage.type === "off") continue;
    if (ov === "both" && A.allowance > 0 && B.allowance > 0) {
      p.coverage = { type: "leave", parent: "both" };
      A.allowance--; B.allowance--;
    } else if (ov === "A" && A.allowance > 0) {
      p.coverage = { type: "leave", parent: "A" };
      A.allowance--;
    } else if (ov === "B" && B.allowance > 0) {
      p.coverage = { type: "leave", parent: "B" };
      B.allowance--;
    }
  }

  const years = Array.from(new Set(dates.map((d) => d.getFullYear())));
  const seasonWindows = input.prioritizeSeasons ? getSeasonWindows(years) : [];
  const isUncovered = (p: DayPlan) => p.coverage.type === "none";

  const makeBlocks = () => {
    const uncoveredDates = plan.filter(isUncovered).map((p) => parseDate(p.date)!);
    return groupConsecutive(uncoveredDates);
  };
  const assignBlockAll = (block: Date[], who: "A" | "B" | "both") => {
    for (const d of block) {
      const id = ymd(d);
      const p = plan.find((x) => x.date === id)!;
      if (p.coverage.type !== "none") continue;
      p.coverage = who === "both" ? { type: "leave", parent: "both" }
        : who === "A" ? { type: "leave", parent: "A" }
        : { type: "leave", parent: "B" };
    }
  };
  const blockLen = (b: Date[]) => b.length;
  const withinSeason = (block: Date[], name: "christmas" | "summer") => {
    const windows = seasonWindows.filter((w) => w.name === name);
    return block.some((d) => windows.some((w) => windowContains(d, w.start, w.end)));
  };

  // Joint days by whole blocks, prefer Christmas then Summer
  let jointRemaining = input.jointDays;
  if (jointRemaining > 0) {
    const trySeason = (season: "christmas" | "summer") => {
      let blocks = makeBlocks()
        .filter((b) => withinSeason(b, season))
        .sort((a, b) => a[0].getTime() - b[0].getTime());
      for (const b of blocks) {
        const L = blockLen(b);
        if (L <= jointRemaining && A.allowance >= L && B.allowance >= L) {
          assignBlockAll(b, "both");
          A.allowance -= L; B.allowance -= L; jointRemaining -= L;
        }
        if (!jointRemaining) break;
      }
    };
    trySeason("christmas");
    if (jointRemaining) trySeason("summer");
  }

  // Single-parent assignment by blocks (minimise fragmentation; allow at most one split)
  let blocks = makeBlocks().sort((a, b) => a[0].getTime() - b[0].getTime());
  for (const block of blocks) {
    let L = blockLen(block);
    if (L === 0) continue;

    const canA = A.allowance >= L;
    const canB = B.allowance >= L;

    if (canA && !canB) { assignBlockAll(block, "A"); A.allowance -= L; continue; }
    if (!canA && canB) { assignBlockAll(block, "B"); B.allowance -= L; continue; }
    if (canA && canB) {
      if (A.allowance >= B.allowance) { assignBlockAll(block, "A"); A.allowance -= L; }
      else { assignBlockAll(block, "B"); B.allowance -= L; }
      continue;
    }

    if (A.allowance === 0 && B.allowance === 0) continue;

    const primary: "A" | "B" = A.allowance >= B.allowance ? "A" : "B";
    const firstTake = primary === "A" ? Math.min(L, A.allowance) : Math.min(L, B.allowance);
    if (firstTake > 0) {
      assignBlockAll(block.slice(0, firstTake), primary);
      if (primary === "A") A.allowance -= firstTake; else B.allowance -= firstTake;
      L -= firstTake;
    }
    if (L > 0) {
      const secondary: "A" | "B" = primary === "A" ? "B" : "A";
      const secondTake = secondary === "A" ? Math.min(L, A.allowance) : Math.min(L, B.allowance);
      if (secondTake > 0) {
        assignBlockAll(block.slice(firstTake, firstTake + secondTake), secondary);
        if (secondary === "A") A.allowance -= secondTake; else B.allowance -= secondTake;
        L -= secondTake;
      }
    }
  }

  const usedA = plan.filter((p) => p.coverage.type === "leave" && (p.coverage.parent === "A" || p.coverage.parent === "both")).length;
  const usedB = plan.filter((p) => p.coverage.type === "leave" && (p.coverage.parent === "B" || p.coverage.parent === "both")).length;
  const remainingA = input.parentA.allowance - usedA;
  const remainingB = input.parentB.allowance - usedB;
  const stillUncovered = plan.filter((p) => p.coverage.type === "none").length;

  return { plan, usedA, usedB, remainingA, remainingB, stillUncovered };
}

/** ---------- Calendar utils ---------- */
function buildMonthMatrix(monthAnchor: Date) {
  const first = startOfMonth(monthAnchor);
  const gridStart = addDays(first, -first.getDay()); // Sunday-start grid
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) cells.push(addDays(gridStart, i)); // 6 weeks
  return { cells };
}

/** ---------- Storage helpers ---------- */
const STORE_KEY = "annualLeavePlanner:v1";
type PersistShape = {
  parentA: ParentConfig;
  parentB: ParentConfig;
  closures: string[];
  jointDays: number;
  skipWeekends: boolean;
  anchorISO: string;
  overrides: Record<string, "A" | "B" | "both">;
};

/** ---------- Component ---------- */
export default function AnnualLeavePlanner() {
  // Parents
  const [parentA, setParentA] = useState<ParentConfig>({ name: "Parent 1", offDays: [3, 0], allowance: 20 }); // Wed, Sun
  const [parentB, setParentB] = useState<ParentConfig>({ name: "Parent 2", offDays: [6, 0], allowance: 25 }); // Sat, Sun
  const [jointDays, setJointDays] = useState<number>(5);
  const [skipWeekends, setSkipWeekends] = useState<boolean>(true);

  // School closures
  const [closures, setClosures] = useState<string[]>([
    "2025-02-17","2025-02-18","2025-02-19","2025-02-20","2025-02-21",
    "2025-04-07","2025-04-08","2025-04-09","2025-04-10","2025-04-11",
  ]);
  const closureSet = useMemo(() => new Set(closures), [closures]);

  // Overrides (forced leave)
  const [overrides, setOverrides] = useState<Record<string, "A" | "B" | "both">>({});

  // Calendar month anchor
  const [anchor, setAnchor] = useState<Date>(new Date());
  const { cells } = useMemo(() => buildMonthMatrix(anchor), [anchor]);

  // Applied plan (only after pressing Auto-Plan)
  const [appliedPlan, setAppliedPlan] = useState<DayPlan[] | null>(null);

  // Drag-to-select closures (pointer-friendly)
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState<string | null>(null);
  const [dragEnd, setDragEnd] = useState<string | null>(null);
  const [dragIntentAdd, setDragIntentAdd] = useState<boolean>(true);
  const gridRef = useRef<HTMLDivElement | null>(null);

  // Day menu (override)
  const [menuDate, setMenuDate] = useState<string | null>(null);

  // Derived plan-by-date map
  const planByDate = useMemo(() => {
    const map = new Map<string, DayPlan>();
    if (appliedPlan) for (const p of appliedPlan) map.set(p.date, p);
    return map;
  }, [appliedPlan]);

  // Persist & restore
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as PersistShape;
      setParentA(parsed.parentA);
      setParentB(parsed.parentB);
      setClosures(parsed.closures || []);
      setJointDays(parsed.jointDays ?? 5);
      setSkipWeekends(parsed.skipWeekends ?? true);
      setAnchor(parsed.anchorISO ? new Date(parsed.anchorISO) : new Date());
      setOverrides(parsed.overrides || {});
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const payload: PersistShape = {
      parentA, parentB, closures, jointDays, skipWeekends,
      anchorISO: anchor.toISOString(), overrides,
    };
    try { localStorage.setItem(STORE_KEY, JSON.stringify(payload)); } catch {}
  }, [parentA, parentB, closures, jointDays, skipWeekends, anchor, overrides]);

  // Handlers
  const toggleClosure = (d: Date) => {
    const id = ymd(d);
    setClosures((prev) => {
      const set = new Set(prev);
      if (set.has(id)) set.delete(id); else set.add(id);
      return Array.from(set).sort();
    });
  };

  // Pointer-based drag selection
  const onPointerDownCell = (id: string, e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") e.preventDefault(); // stop touch scrolling while starting drag
    setDragging(true);
    setDragStart(id);
    setDragEnd(id);
    setDragIntentAdd(!closureSet.has(id));
  };
  const onPointerEnterCell = (id: string) => {
    if (!dragging) return;
    setDragEnd(id);
  };
  const commitDrag = () => {
    if (!dragging || !dragStart || !dragEnd) { setDragging(false); return; }
    const start = parseDate(dragStart)!;
    const end = parseDate(dragEnd)!;
    const lo = start.getTime() <= end.getTime() ? start : end;
    const hi = start.getTime() <= end.getTime() ? end : start;

    const ids: string[] = [];
    for (let d = new Date(lo); d.getTime() <= hi.getTime(); d = addDays(d, 1)) ids.push(ymd(d));

    setClosures((prev) => {
      const set = new Set(prev);
      for (const id of ids) { if (dragIntentAdd) set.add(id); else set.delete(id); }
      return Array.from(set).sort();
    });
    setDragging(false);
    setDragStart(null);
    setDragEnd(null);
  };

  useEffect(() => {
    const onUp = () => commitDrag();
    const onCancel = () => commitDrag();
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging, dragStart, dragEnd, dragIntentAdd]);

  // Apply auto-planning (manual)
  const applyPlan = () => {
    const res = planAnnualLeave({
      parentA, parentB, schoolClosedDates: closures, jointDays, skipWeekends, overrides, prioritizeSeasons: true,
    });
    setAppliedPlan(res.plan);
  };
  const clearPlan = () => setAppliedPlan(null);

  // Auto re-apply plan when inputs change (only after user applied once)
  const autoReapply = appliedPlan !== null;
  useEffect(() => {
    if (!autoReapply) return;
    const res = planAnnualLeave({
      parentA, parentB, schoolClosedDates: closures, jointDays, skipWeekends, overrides, prioritizeSeasons: true,
    });
    setAppliedPlan((prev) => {
      const next = res.plan;
      if (!prev || prev.length !== next.length) return next;
      for (let i = 0; i < prev.length; i++) {
        const a = prev[i], b = next[i];
        if (a.date !== b.date) return next;
        if (a.coverage.type !== b.coverage.type) return next;
        if ((a.coverage.type === "off" || a.coverage.type === "leave")
          && a.coverage.parent !== (b as any).coverage.parent) return next;
      }
      return prev;
    });
  }, [autoReapply, parentA, parentB, closures, jointDays, skipWeekends, overrides]);

  // Stats
  const stats = useMemo(() => {
    if (!appliedPlan) {
      const closedOnWeekdays = closures
        .map(parseDate).filter((d): d is Date => !!d)
        .filter((d) => !skipWeekends || !isWeekend(d)).length;
      return {
        usedA: 0, usedB: 0, remainingA: parentA.allowance, remainingB: parentB.allowance,
        stillUncovered: closedOnWeekdays, plan: [] as DayPlan[],
      };
    }
    const usedA = appliedPlan.filter((p) => p.coverage.type === "leave" && (p.coverage.parent === "A" || p.coverage.parent === "both")).length;
    const usedB = appliedPlan.filter((p) => p.coverage.type === "leave" && (p.coverage.parent === "B" || p.coverage.parent === "both")).length;
    const stillUncovered = appliedPlan.filter((p) => p.coverage.type === "none").length;
    return {
      usedA,
      usedB,
      remainingA: Math.max(0, parentA.allowance - usedA),
      remainingB: Math.max(0, parentB.allowance - usedB),
      stillUncovered,
      plan: appliedPlan,
    };
  }, [appliedPlan, closures, parentA.allowance, parentB.allowance, skipWeekends]);

  // Exporters (unchanged)
  const exportCSV = () => {
    const rows: string[] = ["Date,Weekday,School Closed,Coverage"];
    const base = appliedPlan ?? planAnnualLeave({
      parentA, parentB, schoolClosedDates: closures, jointDays, skipWeekends, overrides, prioritizeSeasons: true,
    }).plan;

    const setClosed = new Set(closures);
    for (const p of base) {
      const closed = setClosed.has(p.date) ? "Yes" : "No";
      let cov = "Uncovered";
      if (p.coverage.type === "off") cov = p.coverage.parent === "both" ? "Both off (no leave)" : p.coverage.parent === "A" ? `${parentA.name} off` : `${parentB.name} off`;
      if (p.coverage.type === "leave") cov = p.coverage.parent === "both" ? "Both on leave" : p.coverage.parent === "A" ? `${parentA.name} leave` : `${parentB.name} leave`;
      rows.push([p.date, p.weekday, closed, cov].map((s) => `"${s}"`).join(","));
    }
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "annual-leave-plan.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const exportICS = () => {
    const base = appliedPlan ?? planAnnualLeave({
      parentA, parentB, schoolClosedDates: closures, jointDays, skipWeekends, overrides, prioritizeSeasons: true,
    }).plan;
    const lines: string[] = [
      "BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Family Planner//EN","CALSCALE:GREGORIAN",
    ];
    const dtstamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

    const mkEvent = (id: string, date: string, summary: string) => {
      const [y, m, d] = date.split("-").map(Number);
      const dtstart = `${y}${String(m).padStart(2, "0")}${String(d).padStart(2, "0")}`;
      const dtendDate = addDays(new Date(y, m - 1, d), 1);
      const dtend = `${dtendDate.getFullYear()}${String(dtendDate.getMonth() + 1).padStart(2, "0")}${String(dtendDate.getDate()).padStart(2, "0")}`;
      lines.push("BEGIN:VEVENT", `UID:${id}@family-planner`, `DTSTAMP:${dtstamp}`,
        `DTSTART;VALUE=DATE:${dtstart}`, `DTEND;VALUE=DATE:${dtend}`, `SUMMARY:${summary}`, "END:VEVENT");
    };

    for (const p of base) {
      if (p.coverage.type === "leave") {
        if (p.coverage.parent === "both") {
          mkEvent(`A-${p.date}`, p.date, `${parentA.name} - Annual Leave`);
          mkEvent(`B-${p.date}`, p.date, `${parentB.name} - Annual Leave`);
        } else if (p.coverage.parent === "A") {
          mkEvent(`A-${p.date}`, p.date, `${parentA.name} - Annual Leave`);
        } else {
          mkEvent(`B-${p.date}`, p.date, `${parentB.name} - Annual Leave`);
        }
      }
      if (closureSet.has(p.date)) mkEvent(`S-${p.date}`, p.date, `School Closed`);
    }

    lines.push("END:VCALENDAR");
    const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "annual-leave-plan.ics"; a.click();
    URL.revokeObjectURL(url);
  };

  // UI helpers
  const isToday = (d: Date) => ymd(d) === ymd(new Date());
  const withinMonth = (d: Date) => sameMonth(d, anchor);

  // Selection highlight range
  const isInDragRange = (id: string) => {
    if (!dragging || !dragStart || !dragEnd) return false;
    const s = parseDate(dragStart)!;
    const e = parseDate(dragEnd)!;
    const lo = s.getTime() <= e.getTime() ? s : e;
    const hi = s.getTime() <= e.getTime() ? e : s;
    const d = parseDate(id)!;
    return d.getTime() >= lo.getTime() && d.getTime() <= hi.getTime();
  };

  // Day menu actions
  const setOverride = (date: string, who: "A" | "B" | "both" | "clear") => {
    setOverrides((o) => {
      const n = { ...o };
      if (who === "clear") delete n[date];
      else n[date] = who;
      return n;
    });
    setMenuDate(null);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl sm:text-2xl font-semibold">Annual Leave Planner</h2>

      {/* Controls */}
      <section className="card">
        <div className="grid md:grid-cols-2 gap-6">
          <ParentCard label="Parent A" cfg={parentA} onChange={setParentA} />
          <ParentCard label="Parent B" cfg={parentB} onChange={setParentB} />
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <label className="flex flex-col gap-1">
            <span className="text-sm">Joint days (both off together)</span>
            <input
              type="number"
              className="px-3 py-2 rounded-lg border"
              value={jointDays}
              min={0}
              onChange={(e) => setJointDays(parseInt(e.target.value || "0", 10))}
            />
            <span className="text-xs opacity-70">Christmas & Summer are prioritised.</span>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={skipWeekends}
              onChange={(e) => setSkipWeekends(e.target.checked)}
            />
            <span className="text-sm">Skip weekends</span>
          </label>

          {/* Primary actions */}
          <div className="flex gap-2 w-full md:justify-end">
            <button
              onClick={applyPlan}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg
                bg-[var(--accent-2)] text-white shadow-sm
                hover:opacity-90 active:translate-y-px
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-2)]
                whitespace-nowrap"
              title="Auto-allocate leave"
            >
              <span aria-hidden className="shrink-0 leading-none">✨</span>
              <span className="leading-none">Auto-Plan</span>
            </button>

            <button
              onClick={clearPlan}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg
                border border-[var(--border-color)] bg-white text-[var(--foreground)]/80
                hover:bg-gray-50 active:translate-y-px whitespace-nowrap"
              title="Clear the applied plan"
            >
              <span aria-hidden className="shrink-0 leading-none">🧹</span>
              <span className="leading-none">Clear plan</span>
            </button>
          </div>

          {/* Exports */}
          <div className="flex gap-2 w-full md:justify-end">
            <button
              onClick={exportCSV}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg
                border border-[var(--border-color)] bg-white
                hover:bg-gray-50 active:translate-y-px whitespace-nowrap"
              title="Download CSV"
            >
              <span className="leading-none">Export CSV</span>
            </button>

            <button
              onClick={exportICS}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg
                border border-[var(--border-color)] bg-white
                hover:bg-gray-50 active:translate-y-px whitespace-nowrap"
              title="Download .ics"
            >
              <span className="leading-none">Export ICS</span>
            </button>
          </div>
        </div>
      </section>

      {/* Calendar-like grid */}
      <section className="card">
        {/* Month header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <button
              className="px-3 py-1.5 rounded-full border"
              onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1))}
            >
              ←
            </button>
            <button
              className="px-3 py-1.5 rounded-full border"
              onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1))}
            >
              →
            </button>
          </div>
          <div className="text-lg font-medium text-center sm:text-left">
            {anchor.toLocaleString("default", { month: "long" })} {anchor.getFullYear()}
          </div>
          <div className="flex items-center gap-3 sm:self-auto self-start">
            <MonthPicker anchor={anchor} onChange={setAnchor} />
          </div>
        </div>

        {/* Weekday header */}
        <div className="grid grid-cols-7 text-[11px] sm:text-xs opacity-70 mb-1">
          {weekdayName.map((w) => (
            <div key={w} className="px-2 py-1">{w}</div>
          ))}
        </div>

        {/* Grid */}
        <div
          ref={gridRef}
          className="grid grid-cols-7 gap-px bg-[var(--border-color)] rounded-xl overflow-hidden select-none touch-none"
        >
          {cells.map((d) => {
            const id = ymd(d);
            const closed = closureSet.has(id);
            const plan = planByDate.get(id);
            const off = plan?.coverage.type === "off" ? plan.coverage.parent : null;
            const leave = plan?.coverage.type === "leave" ? plan.coverage.parent : null;
            const uncovered = plan?.coverage.type === "none";
            const highlight = isInDragRange(id);

            return (
              <div
                key={id}
                data-date={id}
                onPointerDown={(e) => onPointerDownCell(id, e)}
                onPointerEnter={() => onPointerEnterCell(id)}
                onPointerUp={commitDrag}
                onClick={() => { if (!dragging) toggleClosure(d); }}
                className={`h-20 sm:h-24 md:h-28 text-left p-2 relative bg-white cursor-pointer
                  ${withinMonth(d) ? "" : "bg-gray-50 opacity-60"}
                  ${closed ? "bg-[rgba(167,216,222,0.15)]" : ""}
                  ${isToday(d) ? "ring-1 ring-[var(--accent-2)]" : ""}
                  ${highlight ? "outline outline-2 outline-[var(--accent-2)]" : ""}
                `}
                title={`${id}${closed ? " • school closed" : ""}`}
              >
                {/* top bar: date + gear */}
                <div className="text-xs mb-1 flex items-center justify-between">
                  <span className={`px-1.5 py-0.5 rounded ${withinMonth(d) ? "" : "opacity-60"}`}>
                    {d.getDate()}
                  </span>
                  <button
                    type="button"
                    aria-label={`Override ${id}`}
                    className="opacity-70 hover:opacity-100 text-lg leading-none px-1.5 py-0.5 rounded hover:bg-gray-100"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); setMenuDate(id); }}
                  >
                    ⚙️
                  </button>
                </div>

                {/* Pills */}
                <div className="space-y-1 text-[11px]">
                  {closed && <div className="inline-block badge badge-yellow">School closed</div>}
                  {off === "both" && <div className="inline-block badge badge-teal">Both off</div>}
                  {off === "A" && <div className="inline-block badge badge-teal">{parentA.name} off</div>}
                  {off === "B" && <div className="inline-block badge badge-teal">{parentB.name} off</div>}

                  {leave === "both" && <div className="inline-block badge badge-pink">Both on leave</div>}
                  {leave === "A" && <div className="inline-block badge badge-pink">{parentA.name} leave</div>}
                  {leave === "B" && <div className="inline-block badge badge-pink">{parentB.name} leave</div>}

                  {uncovered && closed && (
                    <div className="inline-block px-2 py-0.5 rounded-full border border-red-400 text-red-600">
                      Uncovered
                    </div>
                  )}
                </div>

                {/* Day menu (popover) */}
                {menuDate === id && (
                  <div
                    className="absolute z-10 right-2 top-6 p-2 border rounded-lg bg-white shadow"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="text-xs mb-2">Override ({id})</div>
                    <div className="flex flex-col gap-1">
                      <button className="px-2 py-1 rounded border" onClick={() => setOverride(id, "A")}>
                        Force {parentA.name} leave
                      </button>
                      <button className="px-2 py-1 rounded border" onClick={() => setOverride(id, "B")}>
                        Force {parentB.name} leave
                      </button>
                      <button className="px-2 py-1 rounded border" onClick={() => setOverride(id, "both")}>
                        Force both leave
                      </button>
                      <button className="px-2 py-1 rounded border" onClick={() => setOverride(id, "clear")}>
                        Clear override
                      </button>
                      <button className="px-2 py-1 rounded border" onClick={() => setMenuDate(null)}>
                        Close
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 mt-3 text-xs opacity-80">
          <span className="badge badge-yellow">School closed</span>
          <span className="badge badge-teal">Weekly day off</span>
          <span className="badge badge-pink">Allocated leave</span>
          <span className="px-2 py-0.5 rounded-full border border-red-400 text-red-600">Uncovered</span>
          <span className="ml-auto">Tap to toggle • drag to select • ⚙ override</span>
        </div>
      </section>

      {/* Totals */}
      <section className="card">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Stat label={`${parentA.name} leave used`} value={`${stats.usedA} d`} />
          <Stat label={`${parentB.name} leave used`} value={`${stats.usedB} d`} />
          <Stat label={`${parentA.name} remaining`} value={`${stats.remainingA} d`} />
          <Stat label={`${parentB.name} remaining`} value={`${stats.remainingB} d`} />
          <Stat label={`Uncovered days`} value={`${stats.stillUncovered} d`} />
        </div>
        {!appliedPlan && (
          <p className="text-xs opacity-70 mt-2">
            Press <strong>Auto-Plan</strong> to allocate leave (Christmas & Summer first, block-wise).
          </p>
        )}
      </section>
    </div>
  );
}

/** ---------- Subcomponents ---------- */
function ParentCard({
  label, cfg, onChange,
}: { label: string; cfg: ParentConfig; onChange: (c: ParentConfig) => void; }) {
  const toggleOff = (w: Weekday) => {
    const set = new Set(cfg.offDays);
    set.has(w) ? set.delete(w) : set.add(w);
    onChange({ ...cfg, offDays: Array.from(set).sort((a, b) => a - b) as Weekday[] });
  };
  return (
    <div className="p-3 border rounded-2xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
        <input
          className="border rounded-xl px-3 py-2 w-full sm:w-56"
          value={cfg.name}
          onChange={(e) => onChange({ ...cfg, name: e.target.value })}
          placeholder={`${label} name`}
        />
        <label className="flex flex-col gap-1">
          <span className="text-sm">Annual leave allowance (days)</span>
          <input
            type="number"
            className="px-3 py-2 rounded-lg border"
            min={0}
            value={cfg.allowance}
            onChange={(e) => onChange({ ...cfg, allowance: parseInt(e.target.value || "0", 10) })}
          />
        </label>
      </div>

      <div className="space-y-1">
        <div className="text-sm opacity-80 mb-1">{label} weekly days off</div>
        <div className="flex flex-wrap gap-2">
          {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((name, idx) => (
            <button
              key={name}
              type="button"
              onClick={() => toggleOff(idx as Weekday)}
              className={`px-3 py-1.5 rounded-full border ${cfg.offDays.includes(idx as Weekday) ? "bg-[var(--accent-2)] text-white" : "bg-white"}`}
            >
              {name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function MonthPicker({
  anchor, onChange,
}: { anchor: Date; onChange: (d: Date) => void; }) {
  const [y, setY] = useState(anchor.getFullYear());
  const [m, setM] = useState(anchor.getMonth());

  useEffect(() => {
    setY(anchor.getFullYear());
    setM(anchor.getMonth());
  }, [anchor]);

  const apply = () => onChange(new Date(y, m, 1));

  return (
    <div className="flex items-center gap-2">
      <select className="px-2 py-1 border rounded" value={m} onChange={(e) => setM(parseInt(e.target.value, 10))}>
        {Array.from({ length: 12 }).map((_, i) => (
          <option key={i} value={i}>
            {new Date(2000, i, 1).toLocaleString("default", { month: "long" })}
          </option>
        ))}
      </select>
      <input
        className="px-2 py-1 border rounded w-20"
        type="number"
        value={y}
        onChange={(e) => setY(parseInt(e.target.value || "0", 10))}
      />
      <button className="px-3 py-1.5 rounded-full border" onClick={apply}>Go</button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 border rounded-2xl bg-[var(--card-bg)]">
      <div className="text-xs opacity-70">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
