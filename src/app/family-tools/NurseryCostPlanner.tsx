"use client";
import React, { useMemo, useState } from "react";

/** ---------------- Types ---------------- */
type TimeStr = `${number}:${number}`;
type DayKey = "Mon" | "Tue" | "Wed" | "Thu" | "Fri";
type YearMode = "FULL_YEAR" | "TERM_TIME";

interface Rates { am: number; pm: number; day: number; hourly: number; }
interface Sessions {
  amStart: TimeStr; amEnd: TimeStr;
  pmStart: TimeStr; pmEnd: TimeStr;
  fullDayHours: number; hourlyRoundingMinutes: number; sessionTriggerMinutes: number;
}
interface DayPlan { start?: TimeStr; end?: TimeStr; }
type WeekPlan = Record<DayKey, DayPlan>;
interface ChildProfile {
  id: string; name: string; ageYears: number; week: WeekPlan;
  tfcMonthlyCap: number; rates: Rates; sessions: Sessions;
}

/** ---------------- Helpers ---------------- */
const dayKeys: DayKey[] = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const emptyWeek: WeekPlan = { Mon: {}, Tue: {}, Wed: {}, Thu: {}, Fri: {} };

function parseTimeToMinutes(t?: TimeStr): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}
function minutesBetween(start?: TimeStr, end?: TimeStr): number {
  const s = parseTimeToMinutes(start);
  const e = parseTimeToMinutes(end);
  if (s == null || e == null) return 0;
  if (e <= s) return 0;
  return e - s;
}
function overlapMinutes(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  const start = Math.max(aStart, bStart);
  const end = Math.min(aEnd, bEnd);
  return Math.max(0, end - start);
}
function roundUpMinutes(mins: number, increment: number): number {
  if (increment <= 1) return mins;
  return Math.ceil(mins / increment) * increment;
}
function gbp(n: number): string {
  return n.toLocaleString("en-GB", { style: "currency", currency: "GBP" });
}
function uid() {
  return (typeof crypto !== "undefined" && "randomUUID" in crypto)
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

function calcWeekForChild(
  week: WeekPlan, rates: Rates, sessions: Sessions
): {
  perDay: { day: DayKey; hours: number; pricingApplied: string; cost: number }[];
  weeklyTotal: number; attendedMinutes: number;
} {
  const amS = parseTimeToMinutes(sessions.amStart)!;
  const amE = parseTimeToMinutes(sessions.amEnd)!;
  const pmS = parseTimeToMinutes(sessions.pmStart)!;
  const pmE = parseTimeToMinutes(sessions.pmEnd)!;

  let attendedMinutes = 0;

  const perDay = dayKeys.map((day) => {
    const plan = week[day] || {};
    const mins = minutesBetween(plan.start, plan.end);
    const hrs = mins / 60;
    attendedMinutes += mins;

    if (mins <= 0) return { day, hours: 0, pricingApplied: "—", cost: 0 };

    const s = parseTimeToMinutes(plan.start)!;
    const e = parseTimeToMinutes(plan.end)!;

    let amOverlap = overlapMinutes(s, e, amS, amE);
    let pmOverlap = overlapMinutes(s, e, pmS, pmE);

    if (amOverlap < sessions.sessionTriggerMinutes) amOverlap = 0;
    if (pmOverlap < sessions.sessionTriggerMinutes) pmOverlap = 0;

    const hourlyCostFor = (minutes: number) => {
      const rounded = roundUpMinutes(minutes, sessions.hourlyRoundingMinutes);
      return (rounded / 60) * rates.hourly;
    };

    const candHourly = { label: "Hourly", cost: Math.round(hourlyCostFor(mins) * 100) / 100 };

    let sessionsOnlyCost = 0;
    const parts: string[] = [];
    if (amOverlap > 0) { sessionsOnlyCost += rates.am; parts.push("AM"); }
    if (pmOverlap > 0) { sessionsOnlyCost += rates.pm; parts.push("PM"); }
    const candSessionsOnly = {
      label: parts.length ? `${parts.join("+")} session${parts.length > 1 ? "s" : ""}` : "Hourly",
      cost: parts.length ? Math.round(sessionsOnlyCost * 100) / 100 : Math.round(hourlyCostFor(mins) * 100) / 100,
    };

    let candAmPlusHourly = { label: "AM session + hourly", cost: Number.POSITIVE_INFINITY };
    if (amOverlap > 0) {
      const extraBeforeAM = s < amS ? amS - s : 0;
      const extraAfterAM = e > amE ? e - Math.max(s, amE) : 0;
      candAmPlusHourly = {
        label: "AM session + hourly",
        cost: Math.round((rates.am + hourlyCostFor(extraBeforeAM + extraAfterAM)) * 100) / 100
      };
    }

    let candPmPlusHourly = { label: "PM session + hourly", cost: Number.POSITIVE_INFINITY };
    if (pmOverlap > 0) {
      const extraBeforePM = s < pmS ? pmS - s : 0;
      const extraAfterPM = e > pmE ? e - Math.max(s, pmE) : 0;
      candPmPlusHourly = {
        label: "PM session + hourly",
        cost: Math.round((rates.pm + hourlyCostFor(extraBeforePM + extraAfterPM)) * 100) / 100
      };
    }

    let candBothSessionsPlusEdges = { label: "AM+PM sessions", cost: Number.POSITIVE_INFINITY };
    const dayRateEligible = (amOverlap > 0 && pmOverlap > 0) || hrs >= sessions.fullDayHours;
    if (amOverlap > 0 && pmOverlap > 0) {
      const extraBeforeAM = s < amS ? amS - s : 0;
      const extraAfterPM = e > pmE ? e - Math.max(s, pmE) : 0;
      candBothSessionsPlusEdges = {
        label: "AM+PM sessions",
        cost: Math.round((rates.am + rates.pm + hourlyCostFor(extraBeforeAM + extraAfterPM)) * 100) / 100
      };
    }
    const candDayRate = { label: "Day rate", cost: dayRateEligible ? Math.round(rates.day * 100) / 100 : Number.POSITIVE_INFINITY };

    const candidates = [candHourly, candSessionsOnly, candAmPlusHourly, candPmPlusHourly, candBothSessionsPlusEdges, candDayRate];
    const best = candidates.reduce((min, c) => (c.cost < min.cost ? c : min), { label: "Hourly", cost: Number.POSITIVE_INFINITY });

    return { day, hours: Math.round(hrs * 100) / 100, pricingApplied: best.label, cost: best.cost };
  });

  const weeklyTotal = Math.round(perDay.reduce((s, d) => s + d.cost, 0) * 100) / 100;
  return { perDay, weeklyTotal, attendedMinutes };
}

/** ---------------- Persistence helpers ---------------- */
const NURSERY_STORE_KEY = "nurseryPlanner:v1";

function safeNum(n: any, fallback = 0) {
  const v = typeof n === "number" ? n : parseFloat(n ?? "0");
  return Number.isFinite(v) ? v : fallback;
}

function reviveChild(
  raw: Partial<ChildProfile>,
  defaults: { rates: Rates; sessions: Sessions }
): ChildProfile {
  // week
  const weekRaw = (raw?.week ?? {}) as Partial<Record<DayKey, Partial<DayPlan>>>;
  const week: WeekPlan = { Mon: {}, Tue: {}, Wed: {}, Thu: {}, Fri: {} };
  for (const d of dayKeys) {
    const r = weekRaw[d] ?? {};
    week[d] = {
      start: typeof r.start === "string" && /^\d{2}:\d{2}$/.test(r.start) ? (r.start as TimeStr) : undefined,
      end:   typeof r.end   === "string" && /^\d{2}:\d{2}$/.test(r.end)   ? (r.end as TimeStr)   : undefined,
    };
  }

  // rates
  const ratesRaw = (raw?.rates ?? {}) as Partial<Rates>;
  const rates: Rates = {
    am:     safeNum(ratesRaw.am,     defaults.rates.am),
    pm:     safeNum(ratesRaw.pm,     defaults.rates.pm),
    day:    safeNum(ratesRaw.day,    defaults.rates.day),
    hourly: safeNum(ratesRaw.hourly, defaults.rates.hourly),
  };

  // sessions
  const s = (raw?.sessions ?? {}) as Partial<Sessions>;
  const sessions: Sessions = {
    amStart: typeof s.amStart === "string" && /^\d{2}:\d{2}$/.test(s.amStart) ? (s.amStart as TimeStr) : defaults.sessions.amStart,
    amEnd:   typeof s.amEnd   === "string" && /^\d{2}:\d{2}$/.test(s.amEnd)   ? (s.amEnd   as TimeStr) : defaults.sessions.amEnd,
    pmStart: typeof s.pmStart === "string" && /^\d{2}:\d{2}$/.test(s.pmStart) ? (s.pmStart as TimeStr) : defaults.sessions.pmStart,
    pmEnd:   typeof s.pmEnd   === "string" && /^\d{2}:\d{2}$/.test(s.pmEnd)   ? (s.pmEnd   as TimeStr) : defaults.sessions.pmEnd,
    fullDayHours:          safeNum(s.fullDayHours,          defaults.sessions.fullDayHours),
    hourlyRoundingMinutes: safeNum(s.hourlyRoundingMinutes, defaults.sessions.hourlyRoundingMinutes),
    sessionTriggerMinutes: safeNum(s.sessionTriggerMinutes, defaults.sessions.sessionTriggerMinutes),
  };

  return {
    id: typeof raw.id === "string" ? raw.id : uid(),
    name: typeof raw.name === "string" ? raw.name : "Child 1",
    ageYears: safeNum(raw.ageYears, 3),
    tfcMonthlyCap: safeNum(raw.tfcMonthlyCap, 166.67),
    week,
    rates,
    sessions,
  };
}

/** ---------------- Page ---------------- */
export default function NurseryPlannerPage() {
  // global mode
  const [yearMode, setYearMode] = useState<YearMode>("FULL_YEAR");
  const [termWeeks, setTermWeeks] = useState<number>(38);

  // children
  const defaultRates: Rates = { am: 28, pm: 28, day: 55, hourly: 7.5 };
  const defaultSessions: Sessions = {
    amStart: "08:00", amEnd: "12:30", pmStart: "13:00", pmEnd: "18:00",
    fullDayHours: 8.5, hourlyRoundingMinutes: 15, sessionTriggerMinutes: 60,
  };

  const [loaded, setLoaded] = useState(false);
  const [children, setChildren] = useState<ChildProfile[]>([]);
  const [activeChildId, setActiveChildId] = useState<string>("");

  // restore on mount
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(NURSERY_STORE_KEY);
      const parsed = raw ? JSON.parse(raw) as {
        v?: number; yearMode?: YearMode; termWeeks?: number;
        activeChildId?: string; children?: Partial<ChildProfile>[];
      } : null;

      const restoredChildren =
        (parsed?.children ?? []).map((c) =>
          reviveChild(c, { rates: defaultRates, sessions: defaultSessions })
        );

      if (restoredChildren.length > 0) {
        setChildren(restoredChildren);
        setActiveChildId(
          restoredChildren.some(c => c.id === parsed?.activeChildId)
            ? (parsed!.activeChildId as string)
            : restoredChildren[0].id
        );
      } else {
        // first run → create a starter child
        const firstId = uid();
        setChildren([{
          id: firstId,
          name: "Child 1",
          ageYears: 3,
          week: structuredClone(emptyWeek),
          tfcMonthlyCap: 166.67,
          rates: { ...defaultRates },
          sessions: { ...defaultSessions },
        }]);
        setActiveChildId(firstId);
      }

      setYearMode(parsed?.yearMode === "TERM_TIME" ? "TERM_TIME" : "FULL_YEAR");
      setTermWeeks(safeNum(parsed?.termWeeks, 38));
    } catch (e) {
      console.warn("Nursery restore failed:", e);
    } finally {
      setLoaded(true);
    }
  }, []);

  // keep activeChildId valid if children change
  React.useEffect(() => {
    if (!loaded || children.length === 0) return;
    if (!children.some(c => c.id === activeChildId)) {
      setActiveChildId(children[0].id);
    }
  }, [loaded, children, activeChildId]);

  // actions
  const addChild = () => {
    const id = uid();
    setChildren(prev => [
      ...prev,
      {
        id,
        name: `Child ${prev.length + 1}`,
        ageYears: 3,
        week: structuredClone(emptyWeek),
        tfcMonthlyCap: 166.67,
        rates: { ...defaultRates },
        sessions: { ...defaultSessions },
      },
    ]);
    setActiveChildId(id);
  };

  const removeChild = (id: string) => {
    setChildren(prev => {
      const next = prev.filter(c => c.id !== id);
      if (activeChildId === id) setActiveChildId(next[0]?.id ?? "");
      return next;
    });
  };

  const updateChild = (id: string, patch: Partial<ChildProfile>) =>
    setChildren(prev => prev.map(c => (c.id === id ? { ...c, ...patch } : c)));

  // conversion factors
  const factors = useMemo(() => {
    const weeksPerYear = yearMode === "FULL_YEAR" ? 50 : termWeeks;
    const monthlyDivisor = yearMode === "TERM_TIME" ? 11 : 12;
    const monthlyFactor = weeksPerYear / monthlyDivisor;
    return { weeksPerYear, monthlyDivisor, monthlyFactor };
  }, [yearMode, termWeeks]);

  // results
  const results = useMemo(() => {
    const perChild = children.map((child) => {
      const weekCalc = calcWeekForChild(child.week, child.rates, child.sessions);
      const fundedHoursPerWeek = child.ageYears >= 3 ? (yearMode === "FULL_YEAR" ? 22.8 : 30) : 0;

      const attendedHours = weekCalc.attendedMinutes / 60;
      const weeklyCost = weekCalc.weeklyTotal;

      const fundedHoursApplied = Math.min(attendedHours, fundedHoursPerWeek);
      const avgEffectiveRate = attendedHours > 0 ? weeklyCost / attendedHours : 0;
      const creditRatePerHour = Math.min(child.rates.hourly, avgEffectiveRate);

      let weeklyFundingCredit = Math.round(fundedHoursApplied * creditRatePerHour * 100) / 100;
      weeklyFundingCredit = Math.min(weeklyFundingCredit, weeklyCost);

      const weeklyAfterFunding = Math.max(0, Math.round((weeklyCost - weeklyFundingCredit) * 100) / 100);
      const monthlyInvoice = Math.round(weeklyAfterFunding * factors.monthlyFactor * 100) / 100;

      const tfcTopUp = Math.min(monthlyInvoice * 0.2, child.tfcMonthlyCap);
      const parentNet = Math.max(0, monthlyInvoice - tfcTopUp);

      return {
        id: child.id,
        name: child.name,
        perDay: weekCalc.perDay,
        weeklyTotalBeforeFunding: weeklyCost,
        attendedHours: Math.round(attendedHours * 100) / 100,
        fundedHoursPerWeek,
        weeklyFundingCredit,
        weeklyAfterFunding,
        monthlyInvoice,
        tfcTopUp: Math.round(tfcTopUp * 100) / 100,
        parentNet: Math.round(parentNet * 100) / 100,
      };
    });

    const familyMonthlyInvoice = Math.round(perChild.reduce((s, c) => s + c.monthlyInvoice, 0) * 100) / 100;
    const familyTfcTopUp = Math.round(perChild.reduce((s, c) => s + c.tfcTopUp, 0) * 100) / 100;
    const familyParentNet = Math.round(perChild.reduce((s, c) => s + c.parentNet, 0) * 100) / 100;

    return { perChild, familyMonthlyInvoice, familyTfcTopUp, familyParentNet };
  }, [children, factors, yearMode]);

  // safe active child for render
  const activeChild = children.find((c) => c.id === activeChildId) ?? children[0];
  const activeCalc =
    results.perChild.find((c) => c.id === activeChildId) ??
    (activeChild ? results.perChild.find((c) => c.id === activeChild.id) : undefined);

  // persist (debounced a tad)
  React.useEffect(() => {
    if (!loaded) return;
    const id = window.setTimeout(() => {
      try {
        const payload = { v: 1, yearMode, termWeeks, activeChildId, children };
        localStorage.setItem(NURSERY_STORE_KEY, JSON.stringify(payload));
      } catch (e) {
        console.warn("Nursery persist failed:", e);
      }
    }, 100);
    return () => window.clearTimeout(id);
  }, [loaded, yearMode, termWeeks, activeChildId, children]);

  // tiny loader to avoid flicker
  if (!loaded) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        <div className="h-6 w-48 bg-gray-100 rounded" />
        <div className="h-40 bg-gray-50 rounded-xl border" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-6 space-y-6">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold">Nursery Cost Planner</h1>
          <p className="text-xs sm:text-sm opacity-80 pt-4">
            Per-child rates & sessions, accurate funding, and monthly totals — switch between Full Year and Term Time.
          </p>
        </div>
        <div className="sm:self-auto self-start">
          <YearModeToggle yearMode={yearMode} setYearMode={setYearMode} />
        </div>
      </header>

      {/* Term weeks */}
      {yearMode === "TERM_TIME" && (
        <div className="card flex flex-col sm:flex-row sm:items-end gap-4">
          <NumberField
            label="Term weeks per year"
            value={termWeeks}
            step={1}
            onChange={setTermWeeks}
            hint="Typical Scotland: ~38 weeks"
          />
          <span className="badge badge-yellow self-start sm:self-auto">Term time</span>
        </div>
      )}

      {/* Tabs header */}
      <section className="lgcard">
        <div className="flex items-center gap-2 border-b pb-2">
          <div className="flex-1 -mx-2 px-2 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            <div className="inline-flex gap-2">
              {children.map((child) => (
                <button
                  key={child.id}
                  onClick={() => setActiveChildId(child.id)}
                  className={`shrink-0 px-3 sm:px-4 py-2 rounded-full border text-sm
                    ${activeChild?.id === child.id ? "bg-white font-semibold shadow-sm" : "bg-gray-100 hover:bg-gray-50"}`}
                >
                  {child.name}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={addChild}
            className="shrink-0 px-3 sm:px-4 py-2 rounded-full border hover:bg-[var(--accent-3)] hover:bg-opacity-20"
          >
            + Add child
          </button>
        </div>

        {/* Active child content */}
        {children.length > 0 && activeChild ? (
          <div className="space-y-6 pt-4">
            {/* Child meta controls */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex flex-wrap items-end gap-3">
                <input
                  className="border rounded-xl px-3 py-2 w-full sm:w-56"
                  value={activeChild.name}
                  onChange={(e) => updateChild(activeChild.id, { name: e.target.value })}
                  placeholder="Child name"
                />
                <NumberField
                  label="Age (years)"
                  value={activeChild.ageYears}
                  step={1}
                  onChange={(v) => updateChild(activeChild.id, { ageYears: v })}
                  hint="Funding at 3+"
                />
                <NumberField
                  label="TFC cap (£/mo)"
                  value={activeChild.tfcMonthlyCap}
                  step={0.01}
                  onChange={(v) => updateChild(activeChild.id, { tfcMonthlyCap: v })}
                />
              </div>
              {children.length > 1 && (
                <button
                  onClick={() => removeChild(activeChild.id)}
                  className="self-start lg:self-auto px-3 py-2 rounded-full border text-red-600 hover:bg-red-50"
                  aria-label={`Remove ${activeChild.name}`}
                >
                  Remove
                </button>
              )}
            </div>

            {/* Rates */}
            <section className="card">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base sm:text-lg font-medium">Rates for {activeChild.name}</h2>
                <span className="badge badge-teal">Provider</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
                <NumberField label="AM rate (£)" value={activeChild.rates.am}
                  onChange={(v) => updateChild(activeChild.id, { rates: { ...activeChild.rates, am: v } })} />
                <NumberField label="PM rate (£)" value={activeChild.rates.pm}
                  onChange={(v) => updateChild(activeChild.id, { rates: { ...activeChild.rates, pm: v } })} />
                <NumberField label="Day rate (£)" value={activeChild.rates.day}
                  onChange={(v) => updateChild(activeChild.id, { rates: { ...activeChild.rates, day: v } })} />
                <NumberField label="Hourly rate (£)" value={activeChild.rates.hourly}
                  onChange={(v) => updateChild(activeChild.id, { rates: { ...activeChild.rates, hourly: v } })} />
                <NumberField label="Full-day threshold (hrs)" step={0.25} value={activeChild.sessions.fullDayHours}
                  onChange={(v) => updateChild(activeChild.id, { sessions: { ...activeChild.sessions, fullDayHours: v } })} />
              </div>
            </section>

            {/* Sessions */}
            <section className="card">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base sm:text-lg font-medium">Sessions</h2>
                <span className="badge badge-pink">Timetable</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-7 gap-4">
                <TimeField label="AM start" value={activeChild.sessions.amStart}
                  onChange={(v) => updateChild(activeChild.id, { sessions: { ...activeChild.sessions, amStart: v } })} />
                <TimeField label="AM end" value={activeChild.sessions.amEnd}
                  onChange={(v) => updateChild(activeChild.id, { sessions: { ...activeChild.sessions, amEnd: v } })} />
                <TimeField label="PM start" value={activeChild.sessions.pmStart}
                  onChange={(v) => updateChild(activeChild.id, { sessions: { ...activeChild.sessions, pmStart: v } })} />
                <TimeField label="PM end" value={activeChild.sessions.pmEnd}
                  onChange={(v) => updateChild(activeChild.id, { sessions: { ...activeChild.sessions, pmEnd: v } })} />
                <NumberField label="Hourly rounding (mins)" step={1} value={activeChild.sessions.hourlyRoundingMinutes}
                  onChange={(v) => updateChild(activeChild.id, { sessions: { ...activeChild.sessions, hourlyRoundingMinutes: v } })} />
                <NumberField label="Session trigger (mins)" step={5} value={activeChild.sessions.sessionTriggerMinutes}
                  onChange={(v) => updateChild(activeChild.id, { sessions: { ...activeChild.sessions, sessionTriggerMinutes: v } })}
                  hint="Min overlap to count a session" />
                <div className="self-end text-xs sm:text-sm opacity-70">Hourly is rounded up.</div>
              </div>
            </section>

            {/* Weekly timetable */}
            <section className="card">
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium">Timetable</div>
                <button
                  className="text-sm px-3 py-1.5 rounded-full border hover:bg-gray-50"
                  onClick={() => {
                    const mon = activeChild.week.Mon;
                    if (!mon?.start || !mon?.end) return;
                    updateChild(activeChild.id, {
                      week: { Mon: { ...mon }, Tue: { ...mon }, Wed: { ...mon }, Thu: { ...mon }, Fri: { ...mon } },
                    });
                  }}
                >
                  Copy to all
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {dayKeys.map((d) => (
                  <div key={d} className="p-3 border rounded-xl space-y-2">
                    <div className="font-semibold">{d}</div>
                    <TimeField
                      label="Start"
                      value={activeChild.week[d].start || ""}
                      onChange={(v) =>
                        updateChild(activeChild.id, { week: { ...activeChild.week, [d]: { ...activeChild.week[d], start: v } } })
                      }
                    />
                    <TimeField
                      label="End"
                      value={activeChild.week[d].end || ""}
                      onChange={(v) =>
                        updateChild(activeChild.id, { week: { ...activeChild.week, [d]: { ...activeChild.week[d], end: v } } })
                      }
                    />
                    <button
                      className="text-xs text-red-600 underline"
                      onClick={() => updateChild(activeChild.id, { week: { ...activeChild.week, [d]: {} } })}
                    >
                      Clear
                    </button>
                  </div>
                ))}
              </div>
            </section>

            {/* Per-child results */}
            {activeCalc && (
              <section className="card">
                <div className="overflow-auto">
                  <table className=" w-full text-xs sm:text-sm">
                    <thead>
                      <tr>
                        <th className="w-[50px]">Day</th>
                        <th className="text-right w-[50px]">Hours</th>
                        <th className="w-[50px]">Pricing</th>
                        <th className="text-right w-[50px]">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeCalc.perDay.map((r) => (
                        <tr key={r.day}>
                          <td>{r.day}</td>
                          <td className="text-right">{r.hours.toFixed(2)}</td>
                          <td>{r.pricingApplied ?? "—"}</td>
                          <td className="text-right">{gbp(r.cost ?? 0)}</td>
                        </tr>
                      ))}
                      <tr>
                        <td colSpan={3} className="font-semibold">Weekly total (before funding)</td>
                        <td className="text-right font-semibold">{gbp(activeCalc.weeklyTotalBeforeFunding)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="grid sm:grid-cols-4 gap-4 pt-3">
                  <Stat label="Attended hours (weekly)" value={`${activeCalc.attendedHours.toFixed(2)} h`} />
                  <Stat label="Funded hours (weekly)" value={`${activeCalc.fundedHoursPerWeek} h`} />
                  <Stat label="Funding credit (weekly)" value={`- ${gbp(activeCalc.weeklyFundingCredit)}`} />
                  <Stat
                    label={`Estimated monthly (${yearMode === "FULL_YEAR" ? "50 w/yr ÷ 12" : `${termWeeks} w/yr ÷ 11`})`}
                    value={gbp(activeCalc.monthlyInvoice)}
                  />
                </div>
                <div className="grid sm:grid-cols-2 gap-4 pt-2">
                  <Stat label="TFC top-up (20%, capped)" value={`- ${gbp(activeCalc.tfcTopUp)}`} />
                  <Stat label="Parent net monthly" value={gbp(activeCalc.parentNet)} />
                </div>
                <p className="text-xs opacity-70 mt-2">
                  Funding rule: {activeChild.ageYears >= 3 ? (yearMode === "FULL_YEAR" ? "22.8 hrs/week (stretched)" : "30 hrs/week (term time)") : "0 hrs/week (under 3)"}.
                </p>
              </section>
            )}
          </div>
        ) : (
          <div className="pt-4 text-sm opacity-75">Add a child to get started.</div>
        )}
      </section>

      {/* Family summary */}
      <section className="card">
        <h2 className="text-lg font-medium mb-3">Family totals</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Stat label="Combined monthly invoice" value={gbp(results.familyMonthlyInvoice)} />
          <Stat label="Combined TFC top-up" value={`- ${gbp(results.familyTfcTopUp)}`} />
          <Stat label="Combined parent net monthly" value={gbp(results.familyParentNet)} />
        </div>
        <p className="text-xs opacity-70 mt-3">
          Monthly = weekly (after funding) × ({yearMode === "FULL_YEAR" ? "50 ÷ 12" : `${termWeeks} ÷ 11`}). TFC applies after funding.
        </p>
      </section>
    </div>
  );
}

/** ---------------- UI bits ---------------- */
function NumberField({
  label, value, onChange, step = 0.5, hint,
}: { label: string; value: number; onChange: (v: number) => void; step?: number; hint?: string; }) {
  return (
    <label className="flex flex-col gap-1 w-full">
      <span className="text-xs sm:text-sm">{label}</span>
      <input
        type="number"
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(parseFloat(e.target.value || "0"))}
        className="px-3 py-2 rounded-lg border"
      />
      {hint ? <span className="text-[11px] sm:text-xs opacity-70">{hint}</span> : null}
    </label>
  );
}

function TimeField({
  label, value, onChange,
}: { label: string; value: string; onChange: (v: TimeStr) => void; }) {
  return (
    <label className="flex flex-col gap-1 w-full">
      <span className="text-xs sm:text-sm">{label}</span>
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value as TimeStr)}
        className="px-3 py-2 rounded-lg border"
      />
    </label>
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

function YearModeToggle({
  yearMode, setYearMode,
}: { yearMode: YearMode; setYearMode: (m: YearMode) => void; }) {
  return (
    <div className="inline-flex rounded-full border overflow-hidden">
      <button
        className={`px-3 sm:px-4 py-2 text-sm ${yearMode === "FULL_YEAR" ? "bg-[var(--accent-2)] text-white" : ""}`}
        onClick={() => setYearMode("FULL_YEAR")}
      >
        Full Year
      </button>
      <button
        className={`px-3 sm:px-4 py-2 text-sm border-l ${yearMode === "TERM_TIME" ? "bg-[var(--accent)] text-white" : ""}`}
        onClick={() => setYearMode("TERM_TIME")}
      >
        Term Time
      </button>
    </div>
  );
}
