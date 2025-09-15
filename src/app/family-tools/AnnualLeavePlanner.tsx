"use client";

import * as React from "react";
import { useMemo, useTransition } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BrushCleaning, CalendarCog, Plus, Settings } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";

import {
  updateAnnualSettings,
  upsertParentPrefs,
  toggleClosure as toggleClosureAction,
  setOverride as setOverrideAction,
  autoPlanAndSave,
  clearAutoPlan,
  updateMemberBasics,
  createHolidayEvent,
  clearAllSchoolClosures,
  updateHolidayEvent,
  deleteHolidayEvent,
} from "../app/annual/actions";

/* ---------- types (aligned with server) ---------- */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type Region = "england-and-wales" | "scotland" | "northern-ireland";
export type OverrideCode =
  | "A" | "B" | "both"
  | `C:${string}`
  | "off:A" | "off:B" | "off:both"
  | "clear";

type CoverageDTO =
  | { type: "none" }
  | { type: "off"; who: "A" | "B" | "both" }
  | { type: "leave"; who: "A" | "B" | "both" }
  | { type: "care"; caregiverId: string };

type DayPlanDTO = { date: string; weekday: string; coverage: CoverageDTO };

type ParentConfigDTO = {
  memberId: string;
  name: string;
  shortLabel: string | null;
  color: string | null;
  offDays: Weekday[];
  allowance: number;
  getsBankHolidays: boolean;
};

type CaregiverDTO = {
  id: string;
  name: string;
  shortLabel: string | null;
  color: string | null;
};

type HolidayEventDTO = {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  color: string | null;
  notes: string | null;
  allDay: boolean;
};

type AnnualData = {
  settings: { region: Region; skipWeekends: boolean; jointDays: number; prioritizeSeasons: boolean };
  parents: ParentConfigDTO[];
  caregivers: CaregiverDTO[];
  closures: string[];
  plan: DayPlanDTO[];
  holidayEvents: HolidayEventDTO[];
};

type EventDraft = {
  title: string;
  startDateISO: string;
  endDateISO: string;
  color?: string | null;
  notes?: string | null;
  allDay: boolean;
};

/* ---------- utils ---------- */
const weekdayName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const palette = ["#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EF4444", "#06B6D4", "#84CC16"];

function ymd(d: Date): string {
  const tz = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  return tz.toISOString().slice(0, 10);
}
function parseISO(iso: string) { return new Date(`${iso}T00:00:00.000Z`); }
function addDays(d: Date, n: number) { const nd = new Date(d); nd.setDate(nd.getDate() + n); return nd; }
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function sameMonth(a: Date, b: Date) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth(); }

function buildMonthMatrix(monthAnchor: Date) {
  const first = startOfMonth(monthAnchor);
  const gridStart = addDays(first, -first.getDay());
  const cells: Date[] = []; for (let i = 0; i < 42; i++) cells.push(addDays(gridStart, i));
  return { cells };
}
function buildMonthDays(monthAnchor: Date) {
  const first = startOfMonth(monthAnchor); const last = endOfMonth(monthAnchor);
  const days: Date[] = []; for (let d = new Date(first); d.getTime() <= last.getTime(); d = addDays(d, 1)) days.push(new Date(d));
  return days;
}

async function fetchBankHolidays(): Promise<{
  "england-and-wales": Set<string>;
  scotland: Set<string>;
  "northern-ireland": Set<string>;
}> {
  const res = await fetch("https://www.gov.uk/bank-holidays.json");
  const json = await res.json();
  const makeSet = (arr: any[]) =>
    new Set<string>((arr || []).map((e: any) => (typeof e?.date === "string" ? e.date : null)).filter(Boolean) as string[]);
  return {
    "england-and-wales": makeSet(json["england-and-wales"]?.events || []),
    scotland: makeSet(json["scotland"]?.events || []),
    "northern-ireland": makeSet(json["northern-ireland"]?.events || []),
  };
}

/* ---------- component ---------- */
export default function AnnualLeavePlanner({ initial }: { initial: AnnualData }) {
  const [isPending, start] = useTransition();
  const { data: session } = useSession();
  const role = (session as any)?.role ?? null;
  const isCaregiver = role === "caregiver";

  const [settings, setSettings] = React.useState(initial.settings);
  const [parentA, setParentA] = React.useState<ParentConfigDTO | null>(initial.parents[0] ?? null);
  const [parentB, setParentB] = React.useState<ParentConfigDTO | null>(initial.parents[1] ?? null);
  const [closures, setClosures] = React.useState<string[]>(initial.closures);
  const [appliedPlan, setAppliedPlan] = React.useState<DayPlanDTO[] | null>(initial.plan ?? null);

  const [holidayEvents, setHolidayEvents] = React.useState<HolidayEventDTO[]>(initial.holidayEvents ?? []);
  const [addOpen, setAddOpen] = React.useState(false);
  const [eventDraft, setEventDraft] = React.useState<EventDraft | null>(null);
  const [editEventId, setEditEventId] = React.useState<string | null>(null);

  const [anchor, setAnchor] = React.useState(() => new Date());
  const { cells } = useMemo(() => buildMonthMatrix(anchor), [anchor]);
  const monthDays = useMemo(() => buildMonthDays(anchor), [anchor]);
  const planByDate = useMemo(() => {
    const map = new Map<string, DayPlanDTO>();
    if (appliedPlan) for (const p of appliedPlan) map.set(p.date, p);
    return map;
  }, [appliedPlan]);
  const closureSet = useMemo(() => new Set(closures), [closures]);

  const [bhSets, setBhSets] = React.useState<{
    "england-and-wales": Set<string>;
    scotland: Set<string>;
    "northern-ireland": Set<string>;
  }>({ "england-and-wales": new Set(), scotland: new Set(), "northern-ireland": new Set() });
  const bankHolidaySet = useMemo(() => bhSets[settings.region], [bhSets, settings.region]);
  React.useEffect(() => { (async () => { try { setBhSets(await fetchBankHolidays()); } catch { } })(); }, []);

  const persistSettings = (patch: Partial<typeof settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    start(async () => { await updateAnnualSettings(next); });
  };

  const persistParentPrefs = (
    which: "A" | "B",
    patch: Partial<Pick<ParentConfigDTO, "offDays" | "allowance" | "getsBankHolidays">>
  ) => {
    const current = which === "A" ? parentA : parentB;
    if (!current) return;
    const next = { ...current, ...patch };
    if (which === "A") setParentA(next);
    else setParentB(next);
    start(async () => {
      await upsertParentPrefs({
        memberId: next.memberId,
        offDays: next.offDays,
        allowance: next.allowance,
        getsBankHolidays: next.getsBankHolidays,
      });
    });
  };

  const toggleClosure = (id: string) => {
    const was = closureSet.has(id);
    setClosures((prev) => {
      const s = new Set(prev);
      was ? s.delete(id) : s.add(id);
      return Array.from(s).sort();
    });
    start(async () => { await toggleClosureAction(id); });
  };

  // overrides never toggle closures
  const setOverride = (dateISO: string, code: OverrideCode) => {
    setAppliedPlan((prev) => {
      const next = (prev ? [...prev] : []);
      const i = next.findIndex((p) => p.date === dateISO);
      const weekday = weekdayName[parseISO(dateISO).getUTCDay()];
      const toCoverage: CoverageDTO =
        code === "clear"
          ? { type: "none" }
          : code === "A" || code === "B" || code === "both"
            ? ({ type: "leave", who: code } as const)
            : code === "off:A"
              ? ({ type: "off", who: "A" } as const)
              : code === "off:B"
                ? ({ type: "off", who: "B" } as const)
                : code === "off:both"
                  ? ({ type: "off", who: "both" } as const)
                  : ({ type: "care", caregiverId: (code as `C:${string}`).slice(2) } as const);
      if (i >= 0) next[i] = { ...next[i], coverage: toCoverage };
      else next.push({ date: dateISO, weekday, coverage: toCoverage });
      return next;
    });

    start(async () => { await setOverrideAction(dateISO, code); });
  };

  const applyPlan = () => {
    start(async () => {
      const res = await autoPlanAndSave();
      setAppliedPlan(res.plan);
    });
  };

  const clearPlan = () => {
    setAppliedPlan(null);
    start(async () => { await clearAutoPlan(); });
  };

  const clearSchoolDays = () => {
    setClosures([]);
    start(async () => { await clearAllSchoolClosures(); });
  };

  const isToday = (d: Date) => ymd(d) === ymd(new Date());
  const withinMonth = (d: Date) => sameMonth(d, anchor);

  /* ---------- Stats ---------- */
  const stats = useMemo(() => {
    const totalA = parentA?.allowance ?? 0;
    const totalB = parentB?.allowance ?? 0;

    const usedA =
      appliedPlan?.filter(
        (p) => p.coverage.type === "leave" && (p.coverage.who === "A" || p.coverage.who === "both")
      ).length ?? 0;

    const usedB =
      appliedPlan?.filter(
        (p) => p.coverage.type === "leave" && (p.coverage.who === "B" || p.coverage.who === "both")
      ).length ?? 0;

    // unified uncovered logic (matches cells)
    const stillUncovered = closures.filter((id) => {
      const d = parseISO(id);
      const w = d.getUTCDay() as Weekday;
      if (settings.skipWeekends && (w === 0 || w === 6)) return false;

      const isBH = bankHolidaySet.has(id);
      const byRule =
        (!!parentA && (parentA.offDays.includes(w) || (isBH && parentA.getsBankHolidays))) ||
        (!!parentB && (parentB.offDays.includes(w) || (isBH && parentB.getsBankHolidays)));

      const cov = appliedPlan ? appliedPlan.find((p) => p.date === id)?.coverage : undefined;
      const hasCoverage = !!cov && cov.type !== "none";

      return !byRule && !hasCoverage;
    }).length;

    const caregiverDays = new Map<string, number>();
    if (appliedPlan) {
      for (const p of appliedPlan) {
        if (p.coverage.type === "care") {
          const id = p.coverage.caregiverId;
          caregiverDays.set(id, (caregiverDays.get(id) ?? 0) + 1);
        }
      }
    }

    const schoolOffCount = closures.length;

    return {
      usedA, usedB, totalA, totalB,
      caregiverDays, schoolOffCount, stillUncovered,
    };
  }, [appliedPlan, closures, parentA, parentB, settings.skipWeekends, bankHolidaySet]);

  /* ---------- Events map ---------- */
  const eventsByDate = React.useMemo(() => {
    const m = new Map<string, HolidayEventDTO[]>();
    for (const ev of holidayEvents) {
      let d = parseISO(ev.startDate);
      const end = parseISO(ev.endDate);
      while (d.getTime() <= end.getTime()) {
        const key = ymd(d);
        const arr = m.get(key) ?? [];
        arr.push(ev);
        m.set(key, arr);
        d = addDays(d, 1);
      }
    }
    for (const [k, arr] of m) arr.sort((a, b) => a.title.localeCompare(b.title));
    return m;
  }, [holidayEvents]);

  /* ---------- Add/Edit event helpers (missing before) ---------- */
  const openAddDialogFor = (dateISO: string) => {
    setEventDraft({
      title: "",
      startDateISO: dateISO,
      endDateISO: dateISO,
      color: "#c084fc",
      notes: "",
      allDay: true,
    });
    setEditEventId(null);
    setAddOpen(true);
  };

  const openEditDialogFor = (ev: HolidayEventDTO) => {
    setEventDraft({
      title: ev.title,
      startDateISO: ev.startDate,
      endDateISO: ev.endDate,
      color: ev.color ?? "#c084fc",
      notes: ev.notes ?? "",
      allDay: !!ev.allDay,
    });
    setEditEventId(ev.id);
    setAddOpen(true);
  };

  /* ---------- Guard: ignore clicks from inner controls ---------- */
  const shouldIgnoreCellClick = (e: React.MouseEvent) => {
    const el = e.target as HTMLElement | null;
    return !!el?.closest("[data-avoid-toggle]");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl sm:text-2xl font-semibold">Annual Leave Planner</h2>
        {!isCaregiver && (
          <Button variant="outline" onClick={() => openAddDialogFor(ymd(new Date()))}>
            <Plus className="h-4 w-4 mr-2" />
            Add holiday event
          </Button>
        )}
      </div>

      {/* Parents + Controls */}
      {!isCaregiver && (
        <section className="card space-y-4">
          <div className="grid md:grid-cols-2 gap-6">
            {parentA && (
              <ParentCard
                label="Parent A"
                cfg={parentA}
                color={palette[0]}
                onChange={(patch) => persistParentPrefs("A", patch)}
                onRename={(name) => setParentA((p) => (p ? { ...p, name } : p))}
                onRelabel={(shortLabel) => setParentA((p) => (p ? { ...p, shortLabel } : p))}
                showBankToggle
              />
            )}
            {parentB ? (
              <ParentCard
                label="Parent B"
                cfg={parentB}
                color={palette[1]}
                onChange={(patch) => persistParentPrefs("B", patch)}
                onRename={(name) => setParentB((p) => (p ? { ...p, name } : p))}
                onRelabel={(shortLabel) => setParentB((p) => (p ? { ...p, shortLabel } : p))}
                showBankToggle
              />
            ) : (
              <div className="p-3 border rounded-2xl flex items-center justify-center text-sm opacity-70">
                Second parent not set (invite another parent from Members)
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="flex flex-col gap-1 md:col-span-2">
              <Label className="text-sm">Bank holiday region</Label>
              <Select value={settings.region} onValueChange={(v: Region) => persistSettings({ region: v })}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select region" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="england-and-wales">England & Wales</SelectItem>
                  <SelectItem value="scotland">Scotland</SelectItem>
                  <SelectItem value="northern-ireland">Northern Ireland</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2 w-full md:justify-end md:col-span-2">
              <Button onClick={applyPlan} disabled={isPending} className="whitespace-nowrap">
                <CalendarCog className="mr-2 h-4 w-4" />
                Auto-Plan
              </Button>
              <Button variant="outline" onClick={clearPlan} disabled={isPending} className="whitespace-nowrap">
                <BrushCleaning className="mr-2 h-4 w-4" />
                Clear plan
              </Button>
              <Button variant="outline" onClick={clearSchoolDays} disabled={isPending} className="whitespace-nowrap">
                <BrushCleaning className="mr-2 h-4 w-4" />
                Clear school days
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* Stats */}
      <section className="card">
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
          <Stat label={`${parentA?.name ?? "Parent A"} leave (used/total)`} value={`${stats.usedA}/${stats.totalA}`} />
          {parentB && <Stat label={`${parentB.name} leave (used/total)`} value={`${stats.usedB}/${stats.totalB}`} />}
          {initial.caregivers.map((c) => (
            <Stat key={c.id} label={`${c.name} allocated`} value={`${stats.caregiverDays.get(c.id) ?? 0} d`} />
          ))}
          <Stat label="School days off" value={`${stats.schoolOffCount} d`} />
          <Stat label="Uncovered days" value={`${stats.stillUncovered} d`} />
        </div>

        {!appliedPlan && !isCaregiver && (
          <p className="text-xs opacity-70 mt-2">
            Press <strong>Auto-Plan</strong> to allocate leave.
          </p>
        )}
      </section>

      {/* Calendar */}
      <section className="card">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1))}>←</Button>
            <Button variant="outline" size="sm" onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1))}>→</Button>
          </div>
          <div className="text-lg font-medium text-center sm:text-left">
            {anchor.toLocaleString("default", { month: "long" })} {anchor.getFullYear()}
          </div>
          <MonthPicker anchor={anchor} onChange={(d) => setAnchor(new Date(d.getFullYear(), d.getMonth(), 1))} />
        </div>

        {/* Desktop grid */}
        <div className="grid grid-cols-7 gap-px bg-[var(--border-color)] p-1 overflow-hidden select-none touch-none  hidden md:grid">
          {cells.map((d) => {
            const id = ymd(d);
            const isBH = bankHolidaySet.has(id);
            const plan = planByDate.get(id);
            const within = withinMonth(d);
            const w = d.getDay() as Weekday;

            const offAByRule = !!parentA && (parentA.offDays.includes(w) || (isBH && parentA.getsBankHolidays));
            const offBByRule = !!parentB && (parentB.offDays.includes(w) || (isBH && parentB.getsBankHolidays));
            const coveredByRule = offAByRule || offBByRule;

            const cov = plan?.coverage;

            const chips: React.ReactNode[] = [];
            if (cov?.type === "leave") {
              if ((cov.who === "A" || cov.who === "both") && parentA) chips.push(<Chip key="A" label={parentA.shortLabel || "A"} color={palette[0]} />);
              if ((cov.who === "B" || cov.who === "both") && parentB) chips.push(<Chip key="B" label={parentB.shortLabel || "B"} color={palette[1]} />);
            } else if (cov?.type === "care") {
              const cg = initial.caregivers.find((c) => c.id === cov.caregiverId);
              if (cg) chips.push(<Chip key={cg.id} label={cg.shortLabel || "C"} color={cg.color ?? palette[3]} />);
            } else if (cov?.type === "off") {
              if (cov.who === "A" || cov.who === "both") chips.push(<Chip key="Aoff" label={parentA?.shortLabel || "A"} color="#94a3b8" muted />);
              if (cov.who === "B" || cov.who === "both") chips.push(<Chip key="Boff" label={parentB?.shortLabel || "B"} color="#94a3b8" muted />);
            } else {
              if (offAByRule) chips.push(<Chip key="Ahint" label={parentA?.shortLabel || "A"} color="#94a3b8" muted />);
              if (offBByRule) chips.push(<Chip key="Bhint" label={parentB?.shortLabel || "B"} color="#94a3b8" muted />);
            }

            const closed = closureSet.has(id);
            const eventsToday = eventsByDate.get(id) ?? [];

            // unified uncovered logic
            const isUncovered = closed && !coveredByRule && (!cov || cov.type === "none");

            return (
              <div
                key={id}
                data-date={id}
                onClick={(e) => { if (shouldIgnoreCellClick(e)) return; toggleClosure(id); }}
                className={`h-20 sm:h-24 md:h-28 text-left p-2 relative cursor-pointer bg-white
                  ${within ? "" : "bg-gray-50 opacity-60"}
                  ${closed ? "bg-[rgba(167,216,222,0.15)]" : ""}
                  ${isToday(d) ? "ring-1 ring-[var(--accent-2)]" : ""}`}
                title={`${id}${closed ? " • school closed" : ""}${isBH ? " • bank holiday" : ""}`}
                style={{
                  boxShadow: isBH ? "inset 0 0 0 2px rgba(59,130,246,0.6)" : undefined,
                  borderTop: isUncovered ? "3px solid rgba(239,68,68,0.6)" : undefined,
                }}
              >
                <div className="text-xs mb-1 flex items-center justify-between">
                  <span className={`px-1.5 py-0.5 rounded ${within ? "" : "opacity-60"}`}>{d.getDate()}</span>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        data-avoid-toggle
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Override ${id}`}
                      >
                        <Settings />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="w-64"
                      data-avoid-toggle
                      onClick={(e) => e.stopPropagation()}
                    >
                      <DropdownMenuLabel>Actions ({id})</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {parentA && <DropdownMenuItem data-avoid-toggle onClick={() => setOverride(id, "A")}>{parentA.name} leave</DropdownMenuItem>}
                      {parentB && <DropdownMenuItem data-avoid-toggle onClick={() => setOverride(id, "B")}>{parentB.name} leave</DropdownMenuItem>}
                      {parentA && parentB && <DropdownMenuItem data-avoid-toggle onClick={() => setOverride(id, "both")}>Both leave</DropdownMenuItem>}

                      <DropdownMenuSeparator />
                      {parentA && <DropdownMenuItem data-avoid-toggle onClick={() => setOverride(id, "off:A")}>Mark {parentA.name} off (no leave)</DropdownMenuItem>}
                      {parentB && <DropdownMenuItem data-avoid-toggle onClick={() => setOverride(id, "off:B")}>Mark {parentB.name} off (no leave)</DropdownMenuItem>}
                      {parentA && parentB && <DropdownMenuItem data-avoid-toggle onClick={() => setOverride(id, "off:both")}>Mark both off (no leave)</DropdownMenuItem>}

                      {/* Caregivers */}
                      {initial.caregivers.length > 0 && (
                        <>
                          <DropdownMenuSeparator />
                          {initial.caregivers.map((c) => (
                            <DropdownMenuItem data-avoid-toggle key={c.id} onClick={() => setOverride(id, `C:${c.id}`)}>
                              <span className="inline-block w-3 h-3 rounded mr-2" style={{ backgroundColor: c.color ?? "#94a3b8" }} />
                              {c.name}
                            </DropdownMenuItem>
                          ))}
                        </>
                      )}

                      {/* Holiday events on this date */}
                      {eventsToday.length > 0 && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuLabel>Holiday events</DropdownMenuLabel>
                          {eventsToday.map((ev) => (
                            <DropdownMenuItem
                              data-avoid-toggle
                              key={ev.id}
                              onClick={() => openEditDialogFor(ev)}
                            >
                              <span className="inline-block w-3 h-3 rounded mr-2" style={{ backgroundColor: ev.color ?? "#c084fc" }} />
                              Edit “{ev.title}”
                            </DropdownMenuItem>
                          ))}
                        </>
                      )}

                      <DropdownMenuSeparator />
                      {!isCaregiver && (
                        <DropdownMenuItem data-avoid-toggle onClick={() => openAddDialogFor(id)}>
                          <Plus className="h-4 w-4 mr-2" /> Add holiday event here
                        </DropdownMenuItem>
                      )}

                      <DropdownMenuSeparator />
                      <DropdownMenuItem data-avoid-toggle onClick={() => setOverride(id, "clear")}>Clear override</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="flex flex-wrap gap-1">{chips}</div>

                <div className="absolute left-2 right-2 bottom-2 text-[10px]">
                  <div className="flex items-center gap-2 whitespace-nowrap">
                    {closed && <span className="opacity-70">School closed</span>}
                    {isBH && <span className="opacity-70">Bank hol.</span>}
                  </div>
                  {eventsToday.length > 0 && (
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      {eventsToday.map((ev) => (
                        <EventPill
                          key={ev.id}
                          title={ev.title}
                          color={ev.color}
                          // @ts-ignore allow marker
                          data-avoid-toggle
                          onClick={(e) => { e.stopPropagation(); openEditDialogFor(ev); }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Mobile list */}
        <div className="block md:hidden">
          <MobileMonthList
            days={monthDays}
            parentA={parentA}
            parentB={parentB}
            caregivers={initial.caregivers}
            closureSet={closureSet}
            planByDate={planByDate}
            bankHolidaySet={bankHolidaySet}
            setOverride={setOverride}
            toggleClosure={(d) => toggleClosure(ymd(d))}
            isToday={(d) => ymd(d) === ymd(new Date())}
            openAddEvent={(dateISO) => openAddDialogFor(dateISO)}
            eventsByDate={eventsByDate}
            onEditEvent={openEditDialogFor}
            initial={initial}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-3 text-xs opacity-80">
          <span className="badge badge-yellow">School closed</span>
          <span className="badge badge-teal">Weekly day off / Bank hol. off</span>
          <span className="badge badge-pink">Allocated leave</span>
          <span className="px-2 py-0.5 rounded-full border border-red-400 text-red-600">Uncovered</span>
          <span className="ml-auto">
            {isPending ? "Saving…" : "Tap to toggle • ⚙ override"}
            {!isCaregiver && " • ＋ add event"}
          </span>
        </div>
      </section>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent
          className="
      fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
      w-[calc(100vw-2rem)] sm:w-auto
      max-w-[720px]
      max-h-[85vh] overflow-y-auto
      p-4 sm:p-6
      gap-4 sm:gap-6
      rounded-xl
    "
        >
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-base sm:text-lg">
              {editEventId ? "Edit holiday event" : "Add holiday event"}
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              {editEventId
                ? "Update the details for this event."
                : "Quickly add an all-day holiday/event to your household calendar."}
            </DialogDescription>
          </DialogHeader>

          {eventDraft && (
            <div className="space-y-4 sm:space-y-6">
              {/* Title + Color */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ev-title">Title</Label>
                  <Input
                    id="ev-title"
                    value={eventDraft.title}
                    onChange={(e) =>
                      setEventDraft({ ...eventDraft, title: e.target.value })
                    }
                    placeholder="e.g. Grandparents visit"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ev-color">Color</Label>
                  <Input
                    id="ev-color"
                    type="color"
                    value={eventDraft.color ?? "#c084fc"}
                    onChange={(e) =>
                      setEventDraft({ ...eventDraft, color: e.target.value })
                    }
                    className="h-10 p-1"
                  />
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ev-start">Start</Label>
                  <Input
                    id="ev-start"
                    type="date"
                    value={eventDraft.startDateISO}
                    onChange={(e) =>
                      setEventDraft({ ...eventDraft, startDateISO: e.target.value })
                    }
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ev-end">End</Label>
                  <Input
                    id="ev-end"
                    type="date"
                    value={eventDraft.endDateISO}
                    onChange={(e) =>
                      setEventDraft({ ...eventDraft, endDateISO: e.target.value })
                    }
                  />
                </div>
              </div>

              {/* All-day */}
              <label className="flex items-center gap-2">
                <Checkbox
                  id="allDay"
                  checked={!!eventDraft.allDay}
                  onCheckedChange={(v) =>
                    setEventDraft({ ...eventDraft, allDay: !!v })
                  }
                />
                <span className="text-sm">All day</span>
              </label>

              {/* Notes */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ev-notes">Notes</Label>
                <Textarea
                  id="ev-notes"
                  rows={3}
                  value={eventDraft.notes ?? ""}
                  onChange={(e) =>
                    setEventDraft({ ...eventDraft, notes: e.target.value })
                  }
                  placeholder="Optional details…"
                />
              </div>
            </div>
          )}

          <DialogFooter
            className="
        mt-2 sm:mt-4
        w-full
        flex flex-col-reverse sm:flex-row
        gap-2 sm:gap-3
        items-stretch sm:items-center
        justify-between
      "
          >
            {editEventId ? (
              <Button
                variant="default"
                className="bg-red-600 hover:bg-red-700 w-full sm:w-auto"
                onClick={() => {
                  const id = editEventId!;
                  start(async () => {
                    await deleteHolidayEvent(id);
                    setHolidayEvents((prev) => prev.filter((e) => e.id !== id));
                    setAddOpen(false);
                    setEditEventId(null);
                  });
                }}
              >
                Delete
              </Button>
            ) : (
              <span className="hidden sm:block" />
            )}

            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => setAddOpen(false)}
              >
                Cancel
              </Button>
              <Button
                className="w-full sm:w-auto"
                onClick={() => {
                  if (!eventDraft) return;
                  const payload = {
                    title: eventDraft.title.trim() || "Holiday",
                    startDateISO: eventDraft.startDateISO,
                    endDateISO: eventDraft.endDateISO || eventDraft.startDateISO,
                    color: eventDraft.color ?? "#c084fc",
                    notes: eventDraft.notes ?? null,
                    allDay: !!eventDraft.allDay,
                  };
                  start(async () => {
                    if (editEventId) {
                      const updated = await updateHolidayEvent(editEventId, payload);
                      setHolidayEvents((prev) =>
                        prev
                          .map((e) => (e.id === updated.id ? updated : e))
                          .sort((a, b) => (a.startDate < b.startDate ? -1 : 1))
                      );
                    } else {
                      const created = await createHolidayEvent(payload);
                      setHolidayEvents((prev) =>
                        [...prev, created].sort((a, b) =>
                          a.startDate < b.startDate ? -1 : 1
                        )
                      );
                    }
                    setAddOpen(false);
                    setEditEventId(null);
                  });
                }}
              >
                {editEventId ? "Save changes" : "Save event"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}

/* ---------- subcomponents ---------- */

function ParentCard({
  label,
  cfg,
  onChange,
  onRename,
  onRelabel,
  color,
  showBankToggle,
}: {
  label: string;
  cfg: ParentConfigDTO;
  onChange: (patch: Partial<Pick<ParentConfigDTO, "offDays" | "allowance" | "getsBankHolidays">>) => void;
  onRename: (name: string) => void;
  onRelabel: (shortLabel: string) => void;
  color: string;
  showBankToggle?: boolean;
}) {
  const toggleOff = (w: Weekday) => {
    const has = cfg.offDays.includes(w);
    const next = has ? cfg.offDays.filter((x) => x !== w) : [...cfg.offDays, w];
    onChange({ offDays: next.sort((a, b) => a - b) as Weekday[] });
  };

  return (
    <div className="p-3 border rounded-2xl">
      <div className="flex flex-wrap items-end gap-3 justify-between mb-3">
        <div className="flex items-end gap-3 flex-1 min-w-[280px]">
          <div className="inline-flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-xs" style={{ backgroundColor: color }} title={label}>
              {cfg.shortLabel || (label === "Parent A" ? "A" : "B")}
            </span>
            <Input
              className="w-full sm:w-56"
              value={cfg.name}
              onChange={(e) => onRename(e.target.value)}
              onBlur={(e) => {
                const v = e.target.value.trim();
                onRename(v);
                updateMemberBasics(cfg.memberId, { name: v });
              }}
            />
          </div>

          <div className="flex flex-col gap-1 w-24">
            <Label className="text-sm">Label</Label>
            <Input
              value={cfg.shortLabel ?? ""}
              onChange={(e) => onRelabel(e.target.value.toUpperCase().slice(0, 2))}
              onBlur={(e) => {
                const v = e.target.value.toUpperCase().slice(0, 2);
                onRelabel(v);
                updateMemberBasics(cfg.memberId, { shortLabel: v || null });
              }}
            />
          </div>
        </div>

        <div className="flex items/end gap-3">
          <div className="flex flex-col gap-1">
            <Label className="text-sm whitespace-nowrap">Annual leave (days)</Label>
            <Input
              type="text"
              inputMode="numeric"
              className="no-spinners"
              min={0}
              value={cfg.allowance}
              onChange={(e) => {
                const v = parseInt(e.target.value || "0", 10);
                if (Number.isFinite(v)) onChange({ allowance: Math.max(0, v) });
              }}
              onFocus={(e) => e.currentTarget.select()}
              onMouseUp={(e) => e.preventDefault()}
            />
          </div>

          {showBankToggle && (
            <label className="flex items-center gap-2 whitespace-nowrap">
              <Checkbox id={`${label}-bh`} checked={!!cfg.getsBankHolidays} onCheckedChange={(v) => onChange({ getsBankHolidays: !!v })} />
              <span className="text-sm">Gets bank holidays off</span>
            </label>
          )}
        </div>
      </div>

      <div className="space-y-1">
        <div className="text-sm opacity-80 mb-1">{label} weekly days off</div>
        <div className="flex flex-wrap gap-2">
          {weekdayName.map((name, idx) => {
            const active = cfg.offDays.includes(idx as Weekday);
            return (
              <Button key={name} type="button" variant={active ? "default" : "outline"} className="px-3 py-1.5 rounded-full" onClick={() => toggleOff(idx as Weekday)}>
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
  const [y, setY] = React.useState(anchor.getFullYear());
  const [m, setM] = React.useState(anchor.getMonth());
  React.useEffect(() => { setY(anchor.getFullYear()); setM(anchor.getMonth()); }, [anchor]);

  return (
    <div className="flex items-center gap-2">
      <Select value={String(m)} onValueChange={(v) => setM(parseInt(v, 10))}>
        <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
        <SelectContent>
          {Array.from({ length: 12 }).map((_, i) => (
            <SelectItem key={i} value={String(i)}>
              {new Date(2000, i, 1).toLocaleString("default", { month: "long" })}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        className="w-24" type="text" inputMode="numeric" value={y}
        onChange={(e) => { const v = parseInt(e.target.value, 10); if (!Number.isNaN(v)) setY(v); }}
        onFocus={(e) => e.currentTarget.select()} onMouseUp={(e) => e.preventDefault()}
      />
      <Button variant="outline" onClick={() => onChange(new Date(y, m, 1))}>Go</Button>
    </div>
  );
}

function Chip({ label, color, muted }: { label: string; color: string; muted?: boolean }) {
  const style = muted ? { backgroundColor: "#e5e7eb", color: "#374151" } : { backgroundColor: color, color: "white" };
  return (
    <span className="inline-flex items-center justify-center px-1.5 h-5 rounded-[6px] text-[11px] font-medium" style={style} title={label}>
      {label}
    </span>
  );
}

function EventPill({ title, color, onClick }: { title: string; color: string | null; onClick?: (e: React.MouseEvent) => void; }) {
  return (
    <button
      type="button"
      // @ts-ignore marker for parent click guard
      data-avoid-toggle
      onClick={onClick}
      className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded hover:bg-gray-100"
      title={title}
    >
      <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: color ?? "#c084fc" }} />
      <span className="max-w-[110px] truncate">{title}</span>
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 border rounded-2xl bg-[var(--card-bg)] min-h-[84px] flex flex-col justify-between">
      <div className="text-[12px] leading-4 opacity-70 truncate">{label}</div>
      <div className="text-lg font-semibold mt-1">{value}</div>
    </div>
  );
}

function MobileMonthList({
  days,
  parentA,
  parentB,
  caregivers,
  closureSet,
  planByDate,
  bankHolidaySet,
  setOverride,
  toggleClosure,
  isToday,
  openAddEvent,
  eventsByDate,
  onEditEvent,
  initial,
}: {
  days: Date[];
  parentA: ParentConfigDTO | null;
  parentB: ParentConfigDTO | null;
  caregivers: CaregiverDTO[];
  closureSet: Set<string>;
  planByDate: Map<string, DayPlanDTO>;
  bankHolidaySet: Set<string>;
  setOverride: (id: string, code: OverrideCode) => void;
  toggleClosure: (d: Date) => void;
  isToday: (d: Date) => boolean;
  openAddEvent: (dateISO: string) => void;
  eventsByDate: Map<string, HolidayEventDTO[]>;
  onEditEvent: (ev: HolidayEventDTO) => void;
  initial: { caregivers: CaregiverDTO[] };
}) {
  return (
    <div className="space-y-2">
      <div className="text-xs opacity-70 -mt-1 mb-1">
        Tap to set closures • use ⚙ for overrides • ＋ for events
      </div>

      <div className="space-y-3">
        {days.map((d) => {
          const id = ymd(d);
          const w = d.getDay() as Weekday;
          const weekday = weekdayName[w];

          const isBH = bankHolidaySet.has(id);
          const closed = closureSet.has(id);

          const cov = planByDate.get(id)?.coverage;

          // Rule-based “off” (matches desktop)
          const offAByRule =
            !!parentA && (parentA.offDays.includes(w) || (isBH && parentA.getsBankHolidays));
          const offBByRule =
            !!parentB && (parentB.offDays.includes(w) || (isBH && parentB.getsBankHolidays));
          const coveredByRule = offAByRule || offBByRule;

          // Uncovered logic (same as desktop)
          const isUncovered = closed && !coveredByRule && (!cov || cov.type === "none");

          // Chip row (who’s allocated)
          const chips: React.ReactNode[] = [];
          if (cov?.type === "leave") {
            if ((cov.who === "A" || cov.who === "both") && parentA)
              chips.push(
                <Chip key="A" label={parentA.shortLabel || "A"} color="#3B82F6" />
              );
            if ((cov.who === "B" || cov.who === "both") && parentB)
              chips.push(
                <Chip key="B" label={parentB.shortLabel || "B"} color="#10B981" />
              );
          } else if (cov?.type === "care") {
            const cg = caregivers.find((c) => c.id === cov.caregiverId);
            if (cg)
              chips.push(
                <Chip key={cg.id} label={cg.shortLabel || "C"} color={cg.color ?? "#8B5CF6"} />
              );
          } else if (cov?.type === "off") {
            if (cov.who === "A" || cov.who === "both")
              chips.push(
                <Chip key="Aoff" label={parentA?.shortLabel || "A"} color="#94a3b8" muted />
              );
            if (cov.who === "B" || cov.who === "both")
              chips.push(
                <Chip key="Boff" label={parentB?.shortLabel || "B"} color="#94a3b8" muted />
              );
          } else {
            // hint chips for rule-based days off
            if (offAByRule)
              chips.push(
                <Chip key="Ahint" label={parentA?.shortLabel || "A"} color="#94a3b8" muted />
              );
            if (offBByRule)
              chips.push(
                <Chip key="Bhint" label={parentB?.shortLabel || "B"} color="#94a3b8" muted />
              );
          }

          const eventsToday = eventsByDate.get(id) ?? [];

          return (
            <div
              key={id}
              className={`
                relative grid grid-cols-[56px_1fr] gap-3 p-3 rounded-xl border bg-white shadow-sm
                ${isUncovered ? "border-red-300" : "border-gray-200"}
                ${isToday(d) ? "ring-1 ring-[var(--accent-2)]" : ""}
                min-h-28
              `}
            >
              {/* Bigger cog in the top-right */}
              <div className="absolute top-2 right-2 z-100">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-10 w-10" // bigger
                      aria-label={`Override ${id}`}
                    >
                      <Settings className="h-5 w-5 z-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 z-100">
                    <DropdownMenuLabel>Actions ({id})</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {parentA && (
                      <DropdownMenuItem onClick={() => setOverride(id, "A")}>
                        {parentA.name} leave
                      </DropdownMenuItem>
                    )}
                    {parentB && (
                      <DropdownMenuItem onClick={() => setOverride(id, "B")}>
                        {parentB.name} leave
                      </DropdownMenuItem>
                    )}
                    {parentA && parentB && (
                      <DropdownMenuItem onClick={() => setOverride(id, "both")}>
                        Both leave
                      </DropdownMenuItem>
                    )}

                    <DropdownMenuSeparator />
                    {parentA && (
                      <DropdownMenuItem onClick={() => setOverride(id, "off:A")}>
                        Mark {parentA.name} off (no leave)
                      </DropdownMenuItem>
                    )}
                    {parentB && (
                      <DropdownMenuItem onClick={() => setOverride(id, "off:B")}>
                        Mark {parentB.name} off (no leave)
                      </DropdownMenuItem>
                    )}
                    {parentA && parentB && (
                      <DropdownMenuItem onClick={() => setOverride(id, "off:both")}>
                        Mark both off (no leave)
                      </DropdownMenuItem>
                    )}

                    {initial.caregivers.length > 0 && (
                      <>
                        <DropdownMenuSeparator />
                        {initial.caregivers.map((c) => (
                          <DropdownMenuItem
                            key={c.id}
                            onClick={() => setOverride(id, `C:${c.id}`)}
                          >
                            <span
                              className="inline-block w-3 h-3 rounded mr-2"
                              style={{ backgroundColor: c.color ?? "#94a3b8" }}
                            />
                            {c.name}
                          </DropdownMenuItem>
                        ))}
                      </>
                    )}

                    {eventsToday.length > 0 && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel>Holiday events</DropdownMenuLabel>
                        {eventsToday.map((ev) => (
                          <DropdownMenuItem key={ev.id} onClick={() => onEditEvent(ev)}>
                            <span
                              className="inline-block w-3 h-3 rounded mr-2"
                              style={{ backgroundColor: ev.color ?? "#c084fc" }}
                            />
                            Edit “{ev.title}”
                          </DropdownMenuItem>
                        ))}
                      </>
                    )}

                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => openAddEvent(id)}>
                      <Plus className="h-4 w-4 mr-2" /> Add holiday event here
                    </DropdownMenuItem>

                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setOverride(id, "clear")}>
                      Clear override
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Date column */}
              <div className="flex flex-col items-center pt-1">
                <div className="text-xs opacity-70">{weekday}</div>
                <div
                  className={`mt-0.5 inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold
                    ${isToday(d) ? "bg-[var(--accent-2)] text-white" : "bg-gray-100 text-gray-900"}
                  `}
                >
                  {d.getDate()}
                </div>
              </div>

              {/* Content column */}
              <div className="flex flex-col min-w-0">
                {/* Chips (who’s covering) */}
                <div className="flex flex-wrap gap-1">{chips}</div>

                {/* Badges row */}
                <div className="mt-1 min-h-4 flex flex-wrap items-center gap-2 text-[11px] opacity-80">
                  {closed && <span className="badge badge-yellow">School closed</span>}
                  {isBH && <span className="badge badge-teal">Bank hol.</span>}
                  {isUncovered && (
                    <span className="px-2 py-0.5 rounded-full border border-red-400 text-red-600">
                      Uncovered
                    </span>
                  )}
                </div>

                {/* Events row */}
                {eventsToday.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-2">
                    {eventsToday.map((ev) => (
                      <EventPill
                        key={ev.id}
                        title={ev.title}
                        color={ev.color}
                        onClick={() => onEditEvent(ev)}
                      />
                    ))}
                  </div>
                )}

                {/* Actions row */}
                <div className="mt-2">
                  <Button
                    size="sm"
                    variant={closed ? "default" : "outline"}
                    className="h-9 w-1/3"
                    onClick={() => toggleClosure(d)}
                  >
                    {closed ? "Unset closure" : "Set as closure"}
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


