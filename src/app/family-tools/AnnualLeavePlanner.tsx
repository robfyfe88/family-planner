"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Settings } from 'lucide-react';

/** ───────────────────────── Types ───────────────────────── */
type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // Sun..Sat

interface ParentConfig {
  name: string;
  shortLabel: string; // 1–2 chars shown on calendar
  offDays: Weekday[]; // weekly days off (no leave needed)
  allowance: number; // total leave days available
  getsBankHolidays: boolean; // if true, bank holidays count as "off"
}

interface Caregiver {
  id: string;
  name: string;
  shortLabel: string; // 1–2 chars
  color: string; // hex for badge
}

type Region = "england-and-wales" | "scotland" | "northern-ireland";

type OverrideCode = "A" | "B" | "both" | `C:${string}` | "clear";

interface PlanInput {
  parentA: ParentConfig;
  parentB?: ParentConfig | null;
  schoolClosedDates: string[]; // "YYYY-MM-DD"
  jointDays: number;
  skipWeekends: boolean;
  overrides?: Record<string, OverrideCode>; // per-date
  bankHolidaySet: Set<string>; // from selected region
  prioritizeSeasons?: boolean;
}

type Coverage =
  | { type: "none" }
  | { type: "off"; who: "A" | "B" | "both" }
  | { type: "leave"; who: "A" | "B" | "both" }
  | { type: "care"; caregiverId: string };

interface DayPlan {
  date: string;
  weekday: string;
  coverage: Coverage;
}

function isCareCoverage(c: Coverage): c is Extract<Coverage, { type: "care" }> {
  return c.type === "care";
}

/** ─────────────────────── Date helpers ───────────────────── */
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

/** ──────────────────────── Utils & UI ─────────────────────── */
const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

const palette = ["#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EF4444", "#06B6D4", "#84CC16"];

function buildMonthMatrix(monthAnchor: Date) {
  const first = startOfMonth(monthAnchor);
  const gridStart = addDays(first, -first.getDay()); // Sunday-start grid
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) cells.push(addDays(gridStart, i));
  return { cells };
}

/** ───────────────────── Core planner logic ─────────────────── */
function planAnnualLeave(input: PlanInput) {
  const A: ParentConfig = { ...input.parentA };
  const B: ParentConfig | null = input.parentB ? { ...input.parentB } : null;

  const overrides = input.overrides ?? {};
  const offSetA = new Set<Weekday>(A.offDays);
  const offSetB = new Set<Weekday>(B?.offDays ?? []);
  const hasB = !!B;

  const dates = input.schoolClosedDates
    .map(parseDate)
    .filter((d): d is Date => !!d)
    .filter((d) => (input.skipWeekends ? !isWeekend(d) : true))
    .sort((a, b) => a.getTime() - b.getTime());

  const plan: DayPlan[] = dates.map((d) => {
    const w = d.getDay() as Weekday;
    const isBH = input.bankHolidaySet.has(ymd(d));

    const aOff = offSetA.has(w) || (isBH && A.getsBankHolidays);
    const bOff = hasB ? offSetB.has(w) || (isBH && (B as ParentConfig).getsBankHolidays) : false;

    let coverage: Coverage =
      aOff && bOff
        ? { type: "off", who: "both" }
        : aOff
        ? { type: "off", who: "A" }
        : bOff
        ? { type: "off", who: "B" }
        : { type: "none" };

    return { date: ymd(d), weekday: weekdayName[w], coverage };
  });

  // Overrides
  for (const p of plan) {
    const ov = overrides[p.date];
    if (!ov || p.coverage.type === "off") continue;

    if (ov === "both" && hasB && A.allowance > 0 && (B as ParentConfig).allowance > 0) {
      p.coverage = { type: "leave", who: "both" };
      A.allowance--;
      (B as ParentConfig).allowance--;
    } else if (ov === "A" && A.allowance > 0) {
      p.coverage = { type: "leave", who: "A" };
      A.allowance--;
    } else if (ov === "B" && hasB && (B as ParentConfig).allowance > 0) {
      p.coverage = { type: "leave", who: "B" };
      (B as ParentConfig).allowance--;
    } else if (ov?.startsWith("C:")) {
      p.coverage = { type: "care", caregiverId: ov.slice(2) };
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
      p.coverage = who === "both" ? { type: "leave", who: "both" } : { type: "leave", who };
    }
  };

  const blockLen = (b: Date[]) => b.length;
  const withinSeason = (block: Date[], name: "christmas" | "summer") => {
    const windows = seasonWindows.filter((w) => w.name === name);
    return block.some((d) => windows.some((w) => windowContains(d, w.start, w.end)));
  };

  // Joint days
  let jointRemaining = hasB ? input.jointDays : 0;
  if (hasB && jointRemaining > 0) {
    const trySeason = (season: "christmas" | "summer") => {
      let blocks = makeBlocks()
        .filter((b) => withinSeason(b, season))
        .sort((a, b) => a[0].getTime() - b[0].getTime());
      for (const b of blocks) {
        const L = blockLen(b);
        if (L <= jointRemaining && A.allowance >= L && (B as ParentConfig).allowance >= L) {
          assignBlockAll(b, "both");
          A.allowance -= L;
          (B as ParentConfig).allowance -= L;
          jointRemaining -= L;
        }
        if (!jointRemaining) break;
      }
    };
    trySeason("christmas");
    if (jointRemaining) trySeason("summer");
  }

  // Single-parent assignment
  let blocks = makeBlocks().sort((a, b) => a[0].getTime() - b[0].getTime());
  for (const block of blocks) {
    let L = blockLen(block);
    if (L === 0) continue;

    const canA = A.allowance >= L;
    const canB = hasB ? (B as ParentConfig).allowance >= L : false;

    if (canA && !canB) {
      assignBlockAll(block, "A");
      A.allowance -= L;
      continue;
    }
    if (!canA && canB) {
      assignBlockAll(block, "B");
      (B as ParentConfig).allowance -= L;
      continue;
    }
    if (canA && canB) {
      if (A.allowance >= (B as ParentConfig).allowance) {
        assignBlockAll(block, "A");
        A.allowance -= L;
      } else {
        assignBlockAll(block, "B");
        (B as ParentConfig).allowance -= L;
      }
      continue;
    }

    if (A.allowance === 0 && (!hasB || (B as ParentConfig).allowance === 0)) continue;

    const primary: "A" | "B" = !hasB ? "A" : A.allowance >= (B as ParentConfig).allowance ? "A" : "B";
    const firstTake = primary === "A" ? Math.min(L, A.allowance) : Math.min(L, (B as ParentConfig).allowance);

    if (firstTake > 0) {
      assignBlockAll(block.slice(0, firstTake), primary);
      if (primary === "A") A.allowance -= firstTake;
      else (B as ParentConfig).allowance -= firstTake;
      L -= firstTake;
    }

    if (hasB && L > 0) {
      const secondary: "A" | "B" = primary === "A" ? "B" : "A";
      const secondTake =
        secondary === "A" ? Math.min(L, A.allowance) : Math.min(L, (B as ParentConfig).allowance);
      if (secondTake > 0) {
        assignBlockAll(block.slice(firstTake, firstTake + secondTake), secondary);
        if (secondary === "A") A.allowance -= secondTake;
        else (B as ParentConfig).allowance -= secondTake;
        L -= secondTake;
      }
    }
  }

  const usedA = plan.filter(
    (p) => p.coverage.type === "leave" && (p.coverage.who === "A" || p.coverage.who === "both")
  ).length;

  const usedB = hasB
    ? plan.filter(
        (p) => p.coverage.type === "leave" && (p.coverage.who === "B" || p.coverage.who === "both")
      ).length
    : 0;

  const remainingA = input.parentA.allowance - usedA;
  const remainingB = hasB ? (input.parentB as ParentConfig).allowance - usedB : 0;
  const stillUncovered = plan.filter((p) => p.coverage.type === "none").length;

  return { plan, usedA, usedB, remainingA, remainingB, stillUncovered };
}

/** ─────────────────── Persistence & Bank hols ───────────────── */
const STORE_KEY = "annualLeavePlanner:v3";

type PersistShape = {
  parentA: ParentConfig;
  parentB: ParentConfig | null;
  hasSecondParent: boolean;
  caregivers: Caregiver[];
  closures: string[];
  jointDays: number;
  skipWeekends: boolean;
  anchorISO: string;
  overrides: Record<string, OverrideCode>;
  region: Region;
};

async function fetchBankHolidays(): Promise<{
  "england-and-wales": Set<string>;
  scotland: Set<string>;
  "northern-ireland": Set<string>;
}> {
  const res = await fetch("https://www.gov.uk/bank-holidays.json");
  const json = await res.json();
  const makeSet = (arr: any[]) =>
    new Set<string>(
      (arr || [])
        .map((e: any) => (typeof e?.date === "string" ? e.date : null))
        .filter(Boolean) as string[]
    );
  return {
    "england-and-wales": makeSet(json["england-and-wales"]?.events || []),
    scotland: makeSet(json["scotland"]?.events || []),
    "northern-ireland": makeSet(json["northern-ireland"]?.events || []),
  };
}

/** ─────────────────────── Component ────────────────────────── */
export default function AnnualLeavePlanner() {
  // Parents
  const [hasSecondParent, setHasSecondParent] = useState<boolean>(false);
  const [parentA, setParentA] = useState<ParentConfig>({
    name: "Parent 1",
    shortLabel: "P1",
    offDays: [0],
    allowance: 20,
    getsBankHolidays: false,
  });
  const [parentB, setParentB] = useState<ParentConfig>({
    name: "Parent 2",
    shortLabel: "P2",
    offDays: [0],
    allowance: 20,
    getsBankHolidays: false,
  });

  // Caregivers
  const [caregivers, setCaregivers] = useState<Caregiver[]>([]);

  // Closures & overrides
  const [closures, setClosures] = useState<string[]>([]);
  const closureSet = useMemo(() => new Set(closures), [closures]);
  const [overrides, setOverrides] = useState<Record<string, OverrideCode>>({});

  // Joint days & weekends
  const [jointDays, setJointDays] = useState<number>(5);
  const [skipWeekends, setSkipWeekends] = useState<boolean>(true);

  // Bank holidays
  const [region, setRegion] = useState<Region>("england-and-wales");
  const [bhSets, setBhSets] = useState<{
    "england-and-wales": Set<string>;
    scotland: Set<string>;
    "northern-ireland": Set<string>;
  }>({
    "england-and-wales": new Set(),
    scotland: new Set(),
    "northern-ireland": new Set(),
  });
  const bankHolidaySet = useMemo(() => bhSets[region], [bhSets, region]);

  // Calendar
  const [anchor, setAnchor] = useState<Date>(new Date());
  const { cells } = useMemo(() => buildMonthMatrix(anchor), [anchor]);

  // Applied plan
  const [appliedPlan, setAppliedPlan] = useState<DayPlan[] | null>(null);

  // Drag select
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState<string | null>(null);
  const [dragEnd, setDragEnd] = useState<string | null>(null);
  const [dragIntentAdd, setDragIntentAdd] = useState<boolean>(true);

  // Derived
  const planByDate = useMemo(() => {
    const map = new Map<string, DayPlan>();
    if (appliedPlan) for (const p of appliedPlan) map.set(p.date, p);
    return map;
  }, [appliedPlan]);

  /** Restore */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as PersistShape;

      setParentA(parsed.parentA);
      setParentB(
        parsed.parentB ?? {
          name: "Parent 2",
          shortLabel: "P2",
          offDays: [0],
          allowance: 20,
          getsBankHolidays: false,
        }
      );
      setHasSecondParent(parsed.hasSecondParent ?? false);
      setCaregivers(parsed.caregivers ?? []);
      setClosures(parsed.closures ?? []);
      setOverrides(parsed.overrides ?? {});
      setJointDays(parsed.jointDays ?? 5);
      setSkipWeekends(parsed.skipWeekends ?? true);
      setAnchor(parsed.anchorISO ? new Date(parsed.anchorISO) : new Date());
      setRegion(parsed.region ?? "england-and-wales");
    } catch {}
  }, []);

  /** Persist */
  useEffect(() => {
    const payload: PersistShape = {
      parentA,
      parentB: hasSecondParent ? parentB : null,
      hasSecondParent,
      caregivers,
      closures,
      jointDays,
      skipWeekends,
      anchorISO: anchor.toISOString(),
      overrides,
      region,
    };
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(payload));
    } catch {}
  }, [
    parentA,
    parentB,
    hasSecondParent,
    caregivers,
    closures,
    jointDays,
    skipWeekends,
    anchor,
    overrides,
    region,
  ]);

  /** Fetch bank holidays */
  useEffect(() => {
    (async () => {
      try {
        const sets = await fetchBankHolidays();
        setBhSets(sets);
      } catch (e) {
        console.warn("Failed to fetch bank holidays", e);
      }
    })();
  }, []);

  /** Handlers */
  const toggleClosure = (d: Date) => {
    const id = ymd(d);
    setClosures((prev) => {
      const set = new Set(prev);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return Array.from(set).sort();
    });
  };

  const onPointerDownCell = (id: string, e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") e.preventDefault();
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
    if (!dragging || !dragStart || !dragEnd) {
      setDragging(false);
      return;
    }
    const start = parseDate(dragStart)!;
    const end = parseDate(dragEnd)!;
    const lo = start.getTime() <= end.getTime() ? start : end;
    const hi = start.getTime() <= end.getTime() ? end : start;

    const ids: string[] = [];
    for (let d = new Date(lo); d.getTime() <= hi.getTime(); d = addDays(d, 1)) ids.push(ymd(d));

    setClosures((prev) => {
      const set = new Set(prev);
      for (const id of ids) (dragIntentAdd ? set.add(id) : set.delete(id));
      return Array.from(set).sort();
    });
    setDragging(false);
    setDragStart(null);
    setDragEnd(null);
  };

  const addCaregiver = () => {
    const i = caregivers.length;
    setCaregivers((prev) => [
      ...prev,
      {
        id: uid(),
        name: `Caregiver ${i + 1}`,
        shortLabel: `C${i + 1}`,
        color: palette[i % palette.length],
      },
    ]);
  };
  const updateCaregiver = (id: string, patch: Partial<Caregiver>) =>
    setCaregivers((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const removeCaregiver = (id: string) => setCaregivers((prev) => prev.filter((c) => c.id !== id));

  const setOverride = (date: string, code: OverrideCode) => {
    setOverrides((o) => {
      const n = { ...o };
      if (code === "clear") delete n[date];
      else n[date] = code;
      return n;
    });
  };

  /** Plan application */
  const applyPlan = () => {
    const res = planAnnualLeave({
      parentA,
      parentB: hasSecondParent ? parentB : null,
      schoolClosedDates: closures,
      jointDays,
      skipWeekends,
      overrides,
      bankHolidaySet,
      prioritizeSeasons: true,
    });
    setAppliedPlan(res.plan);
  };
  const clearPlan = () => setAppliedPlan(null);

  /** Auto-reapply on inputs after first run */
  useEffect(() => {
    if (!appliedPlan) return;
    const res = planAnnualLeave({
      parentA,
      parentB: hasSecondParent ? parentB : null,
      schoolClosedDates: closures,
      jointDays,
      skipWeekends,
      overrides,
      bankHolidaySet,
      prioritizeSeasons: true,
    });
    setAppliedPlan(res.plan);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentA, parentB, hasSecondParent, closures, jointDays, skipWeekends, overrides, bankHolidaySet]);

  /** Stats for footer */
  const stats = useMemo(() => {
    if (!appliedPlan) {
      const closedOnWeekdays = closures
        .map(parseDate)
        .filter((d): d is Date => !!d)
        .filter((d) => !skipWeekends || !isWeekend(d)).length;
      return {
        usedA: 0,
        usedB: 0,
        remainingA: parentA.allowance,
        remainingB: hasSecondParent ? parentB.allowance : 0,
        stillUncovered: closedOnWeekdays,
      };
    }
    const usedA = appliedPlan.filter(
      (p) => p.coverage.type === "leave" && (p.coverage.who === "A" || p.coverage.who === "both")
    ).length;
    const usedB = hasSecondParent
      ? appliedPlan.filter(
          (p) => p.coverage.type === "leave" && (p.coverage.who === "B" || p.coverage.who === "both")
        ).length
      : 0;
    const stillUncovered = appliedPlan.filter((p) => p.coverage.type === "none").length;

    return {
      usedA,
      usedB,
      remainingA: Math.max(0, parentA.allowance - usedA),
      remainingB: hasSecondParent ? Math.max(0, parentB.allowance - usedB) : 0,
      stillUncovered,
    };
  }, [appliedPlan, closures, parentA.allowance, hasSecondParent, parentB.allowance, skipWeekends]);

  /** UI helpers */
  const isToday = (d: Date) => ymd(d) === ymd(new Date());
  const withinMonth = (d: Date) => sameMonth(d, anchor);
  const isInDragRange = (id: string) => {
    if (!dragging || !dragStart || !dragEnd) return false;
    const s = parseDate(dragStart)!;
    const e = parseDate(dragEnd)!;
    const lo = s.getTime() <= e.getTime() ? s : e;
    const hi = s.getTime() <= e.getTime() ? e : s;
    const d = parseDate(id)!;
    return d.getTime() >= lo.getTime() && d.getTime() <= hi.getTime();
  };

  /** Render */
  return (
    <div className="space-y-6">
      <h2 className="text-xl sm:text-2xl font-semibold">Annual Leave Planner</h2>

      {/* Controls */}
      <section className="card space-y-4">
        {/* Parents row */}
        <div className="grid md:grid-cols-2 gap-6">
          <ParentCard label="Parent A" cfg={parentA} color={palette[0]} onChange={setParentA} showBankToggle />
          {hasSecondParent ? (
            <div className="relative">
              <ParentCard label="Parent B" cfg={parentB} color={palette[1]} onChange={setParentB} showBankToggle />
              <div className="mt-2">
                <Button variant="outline" className="text-red-600" onClick={() => setHasSecondParent(false)}>
                  Remove second parent
                </Button>
              </div>
            </div>
          ) : (
            <div className="p-3 border rounded-2xl flex items-center justify-center">
              <Button variant="outline" onClick={() => setHasSecondParent(true)}>
                + Add second parent
              </Button>
            </div>
          )}
        </div>

        {/* Caregivers */}
        <div className="space-y-2">
          <div className="text-sm font-medium">Additional caregivers (for overrides)</div>
          <div className="text-xs opacity-70">
            Grandparents, aunties/uncles, etc. They don’t use leave but can cover days via overrides.
          </div>
          <div className="flex flex-col gap-3">
            {caregivers.map((c) => (
              <div key={c.id} className="flex flex-wrap items-end gap-3">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-xs"
                    style={{ backgroundColor: c.color }}
                    title="Badge colour"
                  >
                    {c.shortLabel || "C"}
                  </span>
                  <Input
                    className="w-56"
                    value={c.name}
                    onChange={(e) => updateCaregiver(c.id, { name: e.target.value })}
                    placeholder="Caregiver name"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-sm">Short label</Label>
                  <Input
                    className="w-24"
                    value={c.shortLabel}
                    onChange={(e) => updateCaregiver(c.id, { shortLabel: e.target.value.slice(0, 2).toUpperCase() })}
                    placeholder="C1"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-sm">Colour</Label>
                  <Input
                    className="w-28"
                    type="color"
                    value={c.color}
                    onChange={(e) => updateCaregiver(c.id, { color: e.target.value })}
                  />
                </div>
                <Button variant="outline" className="ml-auto" onClick={() => removeCaregiver(c.id)}>
                  Remove
                </Button>
              </div>
            ))}
            <Button variant="outline" className="w-full sm:w-auto" onClick={addCaregiver}>
              + Add caregiver
            </Button>
          </div>
        </div>

        {/* Options row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div className="flex flex-col gap-1">
            <Label className="text-sm">Joint days (both off together)</Label>
            <Input
              type="number"
              inputMode="numeric"
              className="no-spinners"
              value={jointDays}
              min={0}
              onChange={(e) => setJointDays(parseInt(e.target.value || "0", 10))}
              disabled={!hasSecondParent}
              title={!hasSecondParent ? "Add a second parent to use joint days" : ""}
              onFocus={(e) => e.currentTarget.select()}
              onMouseUp={(e) => e.preventDefault()}
            />
            <span className="text-xs opacity-70">Christmas & Summer prioritised.</span>
          </div>

          <label className="flex items-center gap-2">
            <Checkbox
              id="skip-weekends"
              checked={skipWeekends}
              onCheckedChange={(v) => setSkipWeekends(!!v)}
            />
            <span className="text-sm">Skip weekends</span>
          </label>

          <div className="flex flex-col gap-1">
            <Label className="text-sm">Bank holiday region</Label>
            <Select value={region} onValueChange={(v: Region) => setRegion(v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select region" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="england-and-wales">England & Wales</SelectItem>
                <SelectItem value="scotland">Scotland</SelectItem>
                <SelectItem value="northern-ireland">Northern Ireland</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2 w-full md:justify-end">
            <Button onClick={applyPlan} className="whitespace-nowrap">
              ✨ Auto-Plan
            </Button>
            <Button variant="outline" onClick={clearPlan} className="whitespace-nowrap">
              🧹 Clear plan
            </Button>
          </div>
        </div>
      </section>

      {/* Calendar */}
      <section className="card">
        {/* Month header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1))}
            >
              ←
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1))}
            >
              →
            </Button>
          </div>
          <div className="text-lg font-medium text-center sm:text-left">
            {anchor.toLocaleString("default", { month: "long" })} {anchor.getFullYear()}
          </div>
          <MonthPicker anchor={anchor} onChange={setAnchor} />
        </div>

        {/* Weekday header */}
        <div className="grid grid-cols-7 text-[11px] sm:text-xs opacity-70 mb-1">
          {weekdayName.map((w) => (
            <div key={w} className="px-2 py-1">
              {w}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-7 gap-px bg-[var(--border-color)] rounded-xl overflow-hidden select-none touch-none">
          {cells.map((d) => {
            const id = ymd(d);
            const isBH = bankHolidaySet.has(id);
            const plan = planByDate.get(id);

            const highlight = isInDragRange(id);
            const within = withinMonth(d);

            // rule-based off hints
            const w = d.getDay() as Weekday;
            const offAByRule = parentA.offDays.includes(w) || (isBH && parentA.getsBankHolidays);
            const offBByRule =
              hasSecondParent && (parentB.offDays.includes(w) || (isBH && parentB.getsBankHolidays));

            const cov = plan?.coverage;

            // badges for this cell
            const chips: React.ReactNode[] = [];
            if (cov?.type === "leave") {
              if (cov.who === "A" || cov.who === "both") chips.push(<Chip key="A" label={parentA.shortLabel || "A"} color={palette[0]} />);
              if (hasSecondParent && (cov.who === "B" || cov.who === "both"))
                chips.push(<Chip key="B" label={parentB.shortLabel || "B"} color={palette[1]} />);
            } else if (cov?.type === "care") {
              const cg = caregivers.find((c) => c.id === cov.caregiverId);
              if (cg) chips.push(<Chip key={cg.id} label={cg.shortLabel || "C"} color={cg.color} />);
            } else if (cov?.type === "off") {
              if (cov.who === "A" || cov.who === "both") chips.push(<Chip key="Aoff" label={parentA.shortLabel || "A"} color="#94a3b8" muted />);
              if (hasSecondParent && (cov.who === "B" || cov.who === "both"))
                chips.push(<Chip key="Boff" label={parentB.shortLabel || "B"} color="#94a3b8" muted />);
            } else {
              // No plan for this date: show off hints if applicable
              if (offAByRule) chips.push(<Chip key="Ahint" label={parentA.shortLabel || "A"} color="#94a3b8" muted />);
              if (hasSecondParent && offBByRule)
                chips.push(<Chip key="Bhint" label={parentB.shortLabel || "B"} color="#94a3b8" muted />);
            }

            const closed = closureSet.has(id);

            return (
              <div
                key={id}
                data-date={id}
                onPointerDown={(e) => onPointerDownCell(id, e)}
                onPointerEnter={() => onPointerEnterCell(id)}
                onPointerUp={(e) => {
                  e.preventDefault();
                  commitDrag();
                }}
                className={`h-20 sm:h-24 md:h-28 text-left p-2 relative cursor-pointer bg-white
                  ${within ? "" : "bg-gray-50 opacity-60"}
                  ${closed ? "bg-[rgba(167,216,222,0.15)]" : ""}
                  ${isToday(d) ? "ring-1 ring-[var(--accent-2)]" : ""}
                  ${highlight ? "outline outline-2 outline-[var(--accent-2)]" : ""}
                `}
                title={`${id}${closed ? " • school closed" : ""}${isBH ? " • bank holiday" : ""}`}
                style={{
                  // bank holiday border
                  boxShadow: isBH ? "inset 0 0 0 2px rgba(59,130,246,0.6)" : undefined,
                  // visually warn uncovered closure (when plan exists)
                  borderTop: plan?.coverage.type === "none" && closed ? "3px solid rgba(239,68,68,0.6)" : undefined,
                }}
                onDoubleClick={() => toggleClosure(d)}
              >
                {/* date + menu */}
                <div className="text-xs mb-1 flex items-center justify-between">
                  <span className={`px-1.5 py-0.5 rounded ${within ? "" : "opacity-60"}`}>{d.getDate()}</span>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onPointerDown={(e) => e.stopPropagation()} // prevent drag start
                        onClick={(e) => e.stopPropagation()} // keep click local
                        aria-label={`Override ${id}`}
                      >
                        <Settings />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuLabel>Override ({id})</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setOverride(id, "A")}>{parentA.name} leave</DropdownMenuItem>
                      {hasSecondParent && (
                        <DropdownMenuItem onClick={() => setOverride(id, "B")}>{parentB.name} leave</DropdownMenuItem>
                      )}
                      {hasSecondParent && (
                        <DropdownMenuItem onClick={() => setOverride(id, "both")}>Both leave</DropdownMenuItem>
                      )}
                      {caregivers.length > 0 && (
                        <>
                          <DropdownMenuSeparator />
                          {caregivers.map((c) => (
                            <DropdownMenuItem key={c.id} onClick={() => setOverride(id, `C:${c.id}`)}>
                              <span className="inline-block w-3 h-3 rounded mr-2" style={{ backgroundColor: c.color }} />
                              {c.name}
                            </DropdownMenuItem>
                          ))}
                        </>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setOverride(id, "clear")}>Clear override</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* chips */}
                <div className="flex flex-wrap gap-1">{chips}</div>

                {/* markers */}
                <div className="absolute left-2 bottom-2 flex gap-2 text-[10px]">
                  {closed && <span className="opacity-70">School closed</span>}
                  {isBH && <span className="opacity-70">Bank hol.</span>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 mt-3 text-xs opacity-80">
          <span className="badge badge-yellow">School closed</span>
          <span className="badge badge-teal">Weekly day off / Bank hol. off</span>
          <span className="badge badge-pink">Allocated leave</span>
          <span className="px-2 py-0.5 rounded-full border border-red-400 text-red-600">Uncovered</span>
          <span className="ml-auto">Tap to toggle • drag to select • ⚙ override</span>
        </div>
      </section>

      {/* Totals */}
      <section className="card">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Stat label={`${parentA.name} leave used`} value={`${stats.usedA} d`} />
          {hasSecondParent && <Stat label={`${parentB.name} leave used`} value={`${stats.usedB} d`} />}
          <Stat label={`${parentA.name} remaining`} value={`${stats.remainingA} d`} />
          {hasSecondParent && <Stat label={`${parentB.name} remaining`} value={`${stats.remainingB} d`} />}
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

/** ───────────────────── Subcomponents ─────────────────────── */
function ParentCard({
  label,
  cfg,
  onChange,
  color,
  showBankToggle,
}: {
  label: string;
  cfg: ParentConfig;
  onChange: (c: ParentConfig) => void;
  color: string;
  showBankToggle?: boolean;
}) {
  const toggleOff = (w: Weekday) => {
    const set = new Set(cfg.offDays);
    set.has(w) ? set.delete(w) : set.add(w);
    onChange({ ...cfg, offDays: Array.from(set).sort((a, b) => a - b) as Weekday[] });
  };

  return (
    <div className="p-3 border rounded-2xl">
      <div className="flex flex-wrap items-end gap-3 justify-between mb-3">
        <div className="flex items-end gap-3 flex-1 min-w-[280px]">
          <div className="inline-flex items-center gap-2">
            <span
              className="inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-xs"
              style={{ backgroundColor: color }}
              title={label}
            >
              {cfg.shortLabel || (label === "Parent A" ? "A" : "B")}
            </span>
            <Input
              className="w-full sm:w-56"
              value={cfg.name}
              onChange={(e) => onChange({ ...cfg, name: e.target.value })}
              placeholder={`${label} name`}
            />
          </div>
          <div className="flex flex-col gap-1 w-24">
            <Label className="text-sm">Label</Label>
            <Input
              value={cfg.shortLabel}
              onChange={(e) => onChange({ ...cfg, shortLabel: e.target.value.slice(0, 2).toUpperCase() })}
              placeholder={label === "Parent A" ? "A" : "B"}
            />
          </div>
        </div>

        <div className="flex items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label className="text-sm whitespace-nowrap">Annual leave (days)</Label>
            <Input
              type="number"
              inputMode="numeric"
              className="no-spinners"
              min={0}
              value={cfg.allowance}
              onChange={(e) => onChange({ ...cfg, allowance: parseInt(e.target.value || "0", 10) })}
              onFocus={(e) => e.currentTarget.select()}
              onMouseUp={(e) => e.preventDefault()}
            />
          </div>

          {showBankToggle && (
            <label className="flex items-center gap-2 whitespace-nowrap">
              <Checkbox
                id={`${label}-bh`}
                checked={!!cfg.getsBankHolidays}
                onCheckedChange={(v) => onChange({ ...cfg, getsBankHolidays: !!v })}
              />
              <span className="text-sm">Gets bank holidays off</span>
            </label>
          )}
        </div>
      </div>

      <div className="space-y-1">
        <div className="text-sm opacity-80 mb-1">{label} weekly days off</div>
        <div className="flex flex-wrap gap-2">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((name, idx) => {
            const active = cfg.offDays.includes(idx as Weekday);
            return (
              <Button
                key={name}
                type="button"
                variant={active ? "default" : "outline"}
                className="px-3 py-1.5 rounded-full"
                onClick={() => toggleOff(idx as Weekday)}
              >
                {name}
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MonthPicker({ anchor, onChange }: { anchor: Date; onChange: (d: Date) => void }) {
  const [y, setY] = useState(anchor.getFullYear());
  const [m, setM] = useState(anchor.getMonth());

  useEffect(() => {
    setY(anchor.getFullYear());
    setM(anchor.getMonth());
  }, [anchor]);

  return (
    <div className="flex items-center gap-2">
      <Select value={String(m)} onValueChange={(v) => setM(parseInt(v, 10))}>
        <SelectTrigger className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Array.from({ length: 12 }).map((_, i) => (
            <SelectItem key={i} value={String(i)}>
              {new Date(2000, i, 1).toLocaleString("default", { month: "long" })}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        className="w-24"
        type="number"
        inputMode="numeric"
        value={y}
        onChange={(e) => {
          const v = parseInt(e.target.value, 10);
          if (!Number.isNaN(v)) setY(v);
        }}
        onFocus={(e) => e.currentTarget.select()}
        onMouseUp={(e) => e.preventDefault()}
      />
    </div>
  );
}

function Chip({ label, color, muted }: { label: string; color: string; muted?: boolean }) {
  const style = muted
    ? { backgroundColor: "#e5e7eb", color: "#374151" }
    : { backgroundColor: color, color: "white" };
  return (
    <span
      className="inline-flex items-center justify-center px-1.5 h-5 rounded-[6px] text-[11px] font-medium"
      style={style}
      title={label}
    >
      {label}
    </span>
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
