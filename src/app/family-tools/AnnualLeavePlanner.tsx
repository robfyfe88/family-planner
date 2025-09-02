"use client";

import * as React from "react";
import { useMemo, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BrushCleaning, CalendarCog, Settings } from "lucide-react";

import {
  updateAnnualSettings,
  upsertParentPrefs,
  toggleClosure as toggleClosureAction,
  setOverride as setOverrideAction,
  autoPlanAndSave,
  clearAutoPlan,
} from "../app/annual/actions";

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type Region = "england-and-wales" | "scotland" | "northern-ireland";
export type OverrideCode = "A" | "B" | "both" | `C:${string}` | "clear";

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

type AnnualData = {
  settings: { region: Region; skipWeekends: boolean; jointDays: number; prioritizeSeasons: boolean };
  parents: ParentConfigDTO[]; 
  caregivers: CaregiverDTO[];
  closures: string[];      
  plan: DayPlanDTO[];      
};

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
function isWeekend(d: Date) { const g = d.getDay(); return g === 0 || g === 6; }
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

export default function AnnualLeavePlanner({ initial }: { initial: AnnualData }) {
  const [isPending, start] = useTransition();

  const [settings, setSettings] = React.useState(initial.settings);
  const [parentA, setParentA] = React.useState<ParentConfigDTO | null>(initial.parents[0] ?? null);
  const [parentB, setParentB] = React.useState<ParentConfigDTO | null>(initial.parents[1] ?? null);
  const [caregivers] = React.useState<CaregiverDTO[]>(initial.caregivers); 
  const [closures, setClosures] = React.useState<string[]>(initial.closures);
  const [appliedPlan, setAppliedPlan] = React.useState<DayPlanDTO[] | null>(initial.plan ?? null);

  const [anchor, setAnchor] = React.useState(() => new Date());
  const { cells } = useMemo(() => buildMonthMatrix(anchor), [anchor]);
  const monthDays = useMemo(() => buildMonthDays(anchor), [anchor]);
  const planByDate = useMemo(() => {
    const map = new Map<string, DayPlanDTO>();
    if (appliedPlan) for (const p of appliedPlan) map.set(p.date, p);
    return map;
  }, [appliedPlan]);
  const closureSet = useMemo(() => new Set(closures), [closures]);

  const [dragging, setDragging] = React.useState(false);
  const [dragStart, setDragStart] = React.useState<string | null>(null);
  const [dragEnd, setDragEnd] = React.useState<string | null>(null);
  const [dragIntentAdd, setDragIntentAdd] = React.useState<boolean>(true);

  const [bhSets, setBhSets] = React.useState<{
    "england-and-wales": Set<string>;
    scotland: Set<string>;
    "northern-ireland": Set<string>;
  }>({ "england-and-wales": new Set(), scotland: new Set(), "northern-ireland": new Set() });
  const bankHolidaySet = useMemo(() => bhSets[settings.region], [bhSets, settings.region]);
  React.useEffect(() => { (async () => { try { setBhSets(await fetchBankHolidays()); } catch {} })(); }, []);

  const persistSettings = (patch: Partial<typeof settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    start(async () => { await updateAnnualSettings(next); });
  };

  const persistParentPrefs = (which: "A" | "B", patch: Partial<Pick<ParentConfigDTO, "offDays" | "allowance" | "getsBankHolidays">>) => {
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

  const setOverride = (dateISO: string, code: OverrideCode) => {
    if (code !== "clear" && !closureSet.has(dateISO)) {
      setClosures((prev) => [...prev, dateISO].sort());
      start(async () => { await toggleClosureAction(dateISO); }); 
    }
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

  const onPointerDownCell = (id: string, e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") e.preventDefault();
    setDragging(true);
    setDragStart(id);
    setDragEnd(id);
    setDragIntentAdd(!closureSet.has(id));
  };
  const onPointerEnterCell = (id: string) => { if (dragging) setDragEnd(id); };
  const commitDrag = () => {
    if (!dragging || !dragStart || !dragEnd) { setDragging(false); return; }
    const startD = parseISO(dragStart); const endD = parseISO(dragEnd);
    const lo = startD.getTime() <= endD.getTime() ? startD : endD;
    const hi = startD.getTime() <= endD.getTime() ? endD : startD;

    const ids: string[] = [];
    for (let d = new Date(lo); d.getTime() <= hi.getTime(); d = addDays(d, 1)) ids.push(ymd(d));

    const before = new Set(closures);
    setClosures((prev) => {
      const s = new Set(prev);
      for (const id of ids) (dragIntentAdd ? s.add(id) : s.delete(id));
      return Array.from(s).sort();
    });

    start(async () => {
      const toFlip = ids.filter((id) => (dragIntentAdd ? !before.has(id) : before.has(id)));
      await Promise.all(toFlip.map((id) => toggleClosureAction(id)));
    });

    setDragging(false); setDragStart(null); setDragEnd(null);
  };

  const isToday = (d: Date) => ymd(d) === ymd(new Date());
  const withinMonth = (d: Date) => sameMonth(d, anchor);
  const isInDragRange = (id: string) => {
    if (!dragging || !dragStart || !dragEnd) return false;
    const s = parseISO(dragStart), e = parseISO(dragEnd);
    const lo = s.getTime() <= e.getTime() ? s : e; const hi = s.getTime() <= e.getTime() ? e : s;
    const d = parseISO(id); return d.getTime() >= lo.getTime() && d.getTime() <= hi.getTime();
  };

  const stats = useMemo(() => {
    if (!appliedPlan) {
      const closedOnWeekdays = closures
        .map(parseISO)
        .filter((d) => !settings.skipWeekends || !isWeekend(d)).length;
      return {
        usedA: 0,
        usedB: 0,
        remainingA: parentA?.allowance ?? 0,
        remainingB: parentB?.allowance ?? 0,
        stillUncovered: closedOnWeekdays,
      };
    }
    const usedA = appliedPlan.filter((p) => p.coverage.type === "leave" && (p.coverage.who === "A" || p.coverage.who === "both")).length;
    const usedB = appliedPlan.filter((p) => p.coverage.type === "leave" && (p.coverage.who === "B" || p.coverage.who === "both")).length;
    const stillUncovered = appliedPlan.filter((p) => p.coverage.type === "none").length;
    return {
      usedA,
      usedB,
      remainingA: Math.max(0, (parentA?.allowance ?? 0) - usedA),
      remainingB: Math.max(0, (parentB?.allowance ?? 0) - usedB),
      stillUncovered,
    };
  }, [appliedPlan, closures, settings.skipWeekends, parentA?.allowance, parentB?.allowance]);

  return (
    <div className="space-y-6">
      <h2 className="text-xl sm:text-2xl font-semibold">Annual Leave Planner</h2>

      <section className="card space-y-4">
        <div className="grid md:grid-cols-2 gap-6">
          {parentA && (
            <ParentCard
              label="Parent A"
              cfg={parentA}
              color={palette[0]}
              onChange={(patch) => persistParentPrefs("A", patch)}
              showBankToggle
            />
          )}
          {parentB ? (
            <ParentCard
              label="Parent B"
              cfg={parentB}
              color={palette[1]}
              onChange={(patch) => persistParentPrefs("B", patch)}
              showBankToggle
            />
          ) : (
            <div className="p-3 border rounded-2xl flex items-center justify-center text-sm opacity-70">
              Second parent not set (invite another parent from Members)
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium">Additional caregivers (for overrides)</div>
          <div className="text-xs opacity-70">Manage caregivers in Members. They don’t use leave but can cover days via overrides.</div>
          <ul className="flex flex-col gap-2">
            {caregivers.length === 0 && <li className="text-sm opacity-70">No caregivers added.</li>}
            {caregivers.map((c, i) => (
              <li key={c.id} className="flex items-center gap-2">
                <span
                  className="inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-xs"
                  style={{ backgroundColor: c.color ?? palette[(i + 2) % palette.length] }}
                  title="Badge colour"
                >
                  {c.shortLabel || "C"}
                </span>
                <span className="text-sm">{c.name}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div className="flex flex-col gap-1">
            <Label className="text-sm">Joint days (both off together)</Label>
            <Input
              type="text"
              inputMode="numeric"
              className="no-spinners"
              value={settings.jointDays}
              min={0}
              onChange={(e) => {
                const v = parseInt(e.target.value || "0", 10);
                if (Number.isFinite(v)) persistSettings({ jointDays: Math.max(0, v) });
              }}
              onFocus={(e) => e.currentTarget.select()}
              onMouseUp={(e) => e.preventDefault()}
              disabled={!parentB}
              title={!parentB ? "Requires two parents" : ""}
            />
            <span className="text-xs opacity-70">Christmas & Summer prioritised.</span>
          </div>

          <label className="flex items-center gap-2">
            <Checkbox
              id="skip-weekends"
              checked={settings.skipWeekends}
              onCheckedChange={(v) => persistSettings({ skipWeekends: !!v })}
            />
            <span className="text-sm">Skip weekends</span>
          </label>

          <div className="flex flex-col gap-1">
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

          <div className="flex gap-2 w-full md:justify-end">
            <Button onClick={applyPlan} disabled={isPending} className="whitespace-nowrap">
              <CalendarCog className="mr-2 h-4 w-4" />
              Auto-Plan
            </Button>
            <Button variant="outline" onClick={clearPlan} disabled={isPending} className="whitespace-nowrap">
              <BrushCleaning className="mr-2 h-4 w-4" />
              Clear plan
            </Button>
          </div>
        </div>
      </section>

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

        <div className="block md:hidden">
          <MobileMonthList
            days={monthDays}
            parentA={parentA}
            parentB={parentB}
            caregivers={caregivers}
            closureSet={closureSet}
            planByDate={planByDate}
            bankHolidaySet={bankHolidaySet}
            setOverride={setOverride}
            toggleClosure={(d) => toggleClosure(ymd(d))}
            isToday={(d) => ymd(d) === ymd(new Date())}
          />
        </div>

        <div className="hidden md:block">
          <div className="grid grid-cols-7 text-[11px] sm:text-xs opacity-70 mb-1">
            {weekdayName.map((w) => (<div key={w} className="px-2 py-1">{w}</div>))}
          </div>

          <div className="grid grid-cols-7 gap-px bg-[var(--border-color)] rounded-xl overflow-hidden select-none touch-none">
            {cells.map((d) => {
              const id = ymd(d);
              const isBH = bankHolidaySet.has(id);
              const plan = planByDate.get(id);
              const highlight = isInDragRange(id);
              const within = withinMonth(d);

              const w = d.getDay() as Weekday;
              const offAByRule = !!parentA && (parentA.offDays.includes(w) || (isBH && parentA.getsBankHolidays));
              const offBByRule = !!parentB && (parentB.offDays.includes(w) || (isBH && parentB.getsBankHolidays));
              const cov = plan?.coverage;

              const chips: React.ReactNode[] = [];
              if (cov?.type === "leave") {
                if ((cov.who === "A" || cov.who === "both") && parentA) chips.push(<Chip key="A" label={parentA.shortLabel || "A"} color={palette[0]} />);
                if ((cov.who === "B" || cov.who === "both") && parentB) chips.push(<Chip key="B" label={parentB.shortLabel || "B"} color={palette[1]} />);
              } else if (cov?.type === "care") {
                const cg = caregivers.find((c) => c.id === cov.caregiverId);
                if (cg) chips.push(<Chip key={cg.id} label={cg.shortLabel || "C"} color={cg.color ?? palette[3]} />);
              } else if (cov?.type === "off") {
                if (cov.who === "A" || cov.who === "both") chips.push(<Chip key="Aoff" label={parentA?.shortLabel || "A"} color="#94a3b8" muted />);
                if (cov.who === "B" || cov.who === "both") chips.push(<Chip key="Boff" label={parentB?.shortLabel || "B"} color="#94a3b8" muted />);
              } else {
                if (offAByRule) chips.push(<Chip key="Ahint" label={parentA?.shortLabel || "A"} color="#94a3b8" muted />);
                if (offBByRule) chips.push(<Chip key="Bhint" label={parentB?.shortLabel || "B"} color="#94a3b8" muted />);
              }

              const closed = closureSet.has(id);

              return (
                <div
                  key={id}
                  data-date={id}
                  onPointerDown={(e) => onPointerDownCell(id, e)}
                  onPointerEnter={() => onPointerEnterCell(id)}
                  onPointerUp={(e) => { e.preventDefault(); commitDrag(); }}
                  className={`h-20 sm:h-24 md:h-28 text-left p-2 relative cursor-pointer bg-white
                    ${within ? "" : "bg-gray-50 opacity-60"}
                    ${closed ? "bg-[rgba(167,216,222,0.15)]" : ""}
                    ${isToday(d) ? "ring-1 ring-[var(--accent-2)]" : ""}
                    ${highlight ? "outline outline-2 outline-[var(--accent-2)]" : ""}`}
                  title={`${id}${closed ? " • school closed" : ""}${isBH ? " • bank holiday" : ""}`}
                  style={{
                    boxShadow: isBH ? "inset 0 0 0 2px rgba(59,130,246,0.6)" : undefined,
                    borderTop: plan?.coverage.type === "none" && closed ? "3px solid rgba(239,68,68,0.6)" : undefined,
                  }}
                  onDoubleClick={() => toggleClosure(id)}
                >
                  <div className="text-xs mb-1 flex items-center justify-between">
                    <span className={`px-1.5 py-0.5 rounded ${within ? "" : "opacity-60"}`}>{d.getDate()}</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Override ${id}`}
                        >
                          <Settings />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        <DropdownMenuLabel>Override ({id})</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {parentA && <DropdownMenuItem onClick={() => setOverride(id, "A")}>{parentA.name} leave</DropdownMenuItem>}
                        {parentB && <DropdownMenuItem onClick={() => setOverride(id, "B")}>{parentB.name} leave</DropdownMenuItem>}
                        {parentA && parentB && <DropdownMenuItem onClick={() => setOverride(id, "both")}>Both leave</DropdownMenuItem>}
                        {caregivers.length > 0 && (
                          <>
                            <DropdownMenuSeparator />
                            {caregivers.map((c) => (
                              <DropdownMenuItem key={c.id} onClick={() => setOverride(id, `C:${c.id}`)}>
                                <span className="inline-block w-3 h-3 rounded mr-2" style={{ backgroundColor: c.color ?? "#94a3b8" }} />
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

                  <div className="flex flex-wrap gap-1">{chips}</div>

                  <div className="absolute left-2 bottom-2 flex gap-2 text-[10px]">
                    {closed && <span className="opacity-70">School closed</span>}
                    {isBH && <span className="opacity-70">Bank hol.</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-3 text-xs opacity-80">
          <span className="badge badge-yellow">School closed</span>
          <span className="badge badge-teal">Weekly day off / Bank hol. off</span>
          <span className="badge badge-pink">Allocated leave</span>
          <span className="px-2 py-0.5 rounded-full border border-red-400 text-red-600">Uncovered</span>
          <span className="ml-auto">{isPending ? "Saving…" : "Tap to toggle • ⚙ override"}</span>
        </div>
      </section>

      <section className="card">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Stat label={`${parentA?.name ?? "Parent A"} leave used`} value={`${stats.usedA} d`} />
          {parentB && <Stat label={`${parentB.name} leave used`} value={`${stats.usedB} d`} />}
          <Stat label={`${parentA?.name ?? "Parent A"} remaining`} value={`${stats.remainingA} d`} />
          {parentB && <Stat label={`${parentB.name} remaining`} value={`${stats.remainingB} d`} />}
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

function ParentCard({
  label,
  cfg,
  onChange,
  color,
  showBankToggle,
}: {
  label: string;
  cfg: ParentConfigDTO;
  onChange: (patch: Partial<Pick<ParentConfigDTO, "offDays" | "allowance" | "getsBankHolidays">>) => void;
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
            <Input className="w-full sm:w-56" value={cfg.name} readOnly />
          </div>
          <div className="flex flex-col gap-1 w-24">
            <Label className="text-sm">Label</Label>
            <Input value={cfg.shortLabel ?? ""} readOnly />
          </div>
        </div>

        <div className="flex items-end gap-3">
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 border rounded-2xl bg-[var(--card-bg)]">
      <div className="text-xs opacity-70">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
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
}) {
  const rows = days.map((d) => {
    const id = ymd(d);
    const isBH = bankHolidaySet.has(id);
    const cov = planByDate.get(id)?.coverage;

    const w = d.getDay() as Weekday;
    const offAByRule = !!parentA && (parentA.offDays.includes(w) || (isBH && parentA.getsBankHolidays));
    const offBByRule = !!parentB && (parentB.offDays.includes(w) || (isBH && parentB.getsBankHolidays));

    const chips: React.ReactNode[] = [];
    if (cov?.type === "leave") {
      if ((cov.who === "A" || cov.who === "both") && parentA) chips.push(<Chip key="A" label={parentA.shortLabel || "A"} color="#3B82F6" />);
      if ((cov.who === "B" || cov.who === "both") && parentB) chips.push(<Chip key="B" label={parentB.shortLabel || "B"} color="#10B981" />);
    } else if (cov?.type === "care") {
      const cg = caregivers.find((c) => c.id === cov.caregiverId);
      if (cg) chips.push(<Chip key={cg.id} label={cg.shortLabel || "C"} color={cg.color ?? "#8B5CF6"} />);
    } else if (cov?.type === "off") {
      if (cov.who === "A" || cov.who === "both") chips.push(<Chip key="Aoff" label={parentA?.shortLabel || "A"} color="#94a3b8" muted />);
      if (cov.who === "B" || cov.who === "both") chips.push(<Chip key="Boff" label={parentB?.shortLabel || "B"} color="#94a3b8" muted />);
    } else {
      if (offAByRule) chips.push(<Chip key="Ahint" label={parentA?.shortLabel || "A"} color="#94a3b8" muted />);
      if (offBByRule) chips.push(<Chip key="Bhint" label={parentB?.shortLabel || "B"} color="#94a3b8" muted />);
    }

    const closed = closureSet.has(id);
    const weekday = weekdayName[w];

    return (
      <div
        key={id}
        className={`flex items-start gap-3 p-3 border-b bg-white rounded-lg first:rounded-t-xl last:rounded-b-xl
          ${isToday(d) ? "ring-1 ring-[var(--accent-2)]" : ""}
          ${closed ? "bg-[rgba(167,216,222,0.15)]" : ""}`}
      >
        <div className="flex flex-col items-center min-w-[48px]">
          <div className="text-xs opacity-70">{weekday}</div>
          <div className="text-lg font-semibold">{d.getDate()}</div>
        </div>

        <div className="flex-1">
          <div className="flex flex-wrap gap-1">{chips}</div>
          <div className="mt-1 flex flex-wrap gap-3 text-[11px] opacity-80">
            {closed && <span>School closed</span>}
            {isBH && <span>Bank hol.</span>}
          </div>

          <div className="mt-2 flex items-center gap-2">
            <Button size="sm" variant={closed ? "default" : "outline"} className="h-8" onClick={() => toggleClosure(d)}>
              {closed ? "Unset closure" : "Set as closure"}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Override ${id}`}>
                  <Settings />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Override ({id})</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {parentA && <DropdownMenuItem onClick={() => setOverride(id, "A")}>{parentA.name} leave</DropdownMenuItem>}
                {parentB && <DropdownMenuItem onClick={() => setOverride(id, "B")}>{parentB.name} leave</DropdownMenuItem>}
                {parentA && parentB && <DropdownMenuItem onClick={() => setOverride(id, "both")}>Both leave</DropdownMenuItem>}
                {caregivers.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    {caregivers.map((c) => (
                      <DropdownMenuItem key={c.id} onClick={() => setOverride(id, `C:${c.id}`)}>
                        <span className="inline-block w-3 h-3 rounded mr-2" style={{ backgroundColor: c.color ?? "#94a3b8" }} />
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
        </div>
      </div>
    );
  });

  return (
    <div className="space-y-2">
      <div className="text-xs opacity-70 -mt-1 mb-1">Tap to set closures • use ⚙ for overrides</div>
      <div className="rounded-xl overflow-hidden border divide-y">
        {rows}
      </div>
    </div>
  );
}
