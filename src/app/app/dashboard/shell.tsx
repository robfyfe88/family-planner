import Link from "next/link";
import { getBudgetInsights } from "./budget-insights";
import { getDashboardData } from "./actions";
import HearthPlanLogo from "@/components/HearthPlanLogo";
import BudgetTrendChart, { PotDef } from "@/components/BudgetTrendChart";
import React from "react";
import { formatDay } from "@/lib/utils";
import Section from "@/components/Section";
import Stat from "@/components/Stat";
import WeekBars from "@/components/Weekbars";
import { UserMenu } from "@/components/ui/UserMenu";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { getOrCreateHouseholdForUser as getHouseholdIdOrThrow } from "@/lib/household";

type DayKey = "Mon" | "Tue" | "Wed" | "Thu" | "Fri";
const DAYS: DayKey[] = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function gbp(n: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n);
}
function parseTimeToMinutes(t?: string | null): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}
function minutesBetween(start?: string | null, end?: string | null): number {
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

async function getNurserySnapshot() {
  const householdId = await getHouseholdIdOrThrow();

  const [settings, children] = await Promise.all([
    prisma.nurserySettings.findUnique({
      where: { householdId },
      select: { yearMode: true, termWeeks: true },
    }),
    prisma.nurseryChild.findMany({
      where: { householdId },
      include: {
        weekPlans: {
          select: { weekday: true, startTime: true, endTime: true },
          orderBy: { weekday: "asc" },
        },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!children.length) {
    return {
      yearMode: settings?.yearMode ?? "FULL_YEAR",
      termWeeks: settings?.termWeeks ?? 38,
      kids: [] as Array<any>,
    };
  }

  const yearMode = settings?.yearMode ?? "FULL_YEAR";
  const termWeeks = settings?.termWeeks ?? 38;
  const weeksPerYear = yearMode === "FULL_YEAR" ? 51 : termWeeks;
  const monthlyDivisor = yearMode === "TERM_TIME" ? 11 : 12;
  const monthlyFactor = weeksPerYear / monthlyDivisor;

  const dayLabel = (i: number): DayKey => DAYS[(i - 1) as 0 | 1 | 2 | 3 | 4];

  const kids = children.map((c : any) => {
    const timetable: Record<DayKey, { start?: string; end?: string }> = {
      Mon: {}, Tue: {}, Wed: {}, Thu: {}, Fri: {},
    };
    for (const dp of c.weekPlans) {
      const label = dayLabel(dp.weekday);
      timetable[label] = {
        start: dp.startTime ?? undefined,
        end: dp.endTime ?? undefined,
      };
    }

    const rates = {
      am: c.amRatePence / 100,
      pm: c.pmRatePence / 100,
      day: c.dayRatePence / 100,
      hourly: c.hourlyRatePence / 100,
    };
    const sessions = {
      amStart: c.amStart,
      amEnd: c.amEnd,
      pmStart: c.pmStart,
      pmEnd: c.pmEnd,
      fullDayHours: c.fullDayHours,
      hourlyRoundingMinutes: c.hourlyRoundingMinutes,
      sessionTriggerMinutes: c.sessionTriggerMinutes,
    };

    const amS = parseTimeToMinutes(sessions.amStart)!;
    const amE = parseTimeToMinutes(sessions.amEnd)!;
    const pmS = parseTimeToMinutes(sessions.pmStart)!;
    const pmE = parseTimeToMinutes(sessions.pmEnd)!;

    let attendedMinutes = 0;
    let weeklyTotal = 0;

    for (const d of DAYS) {
      const plan = timetable[d] || {};
      const mins = minutesBetween(plan.start, plan.end);
      if (mins <= 0) continue;
      attendedMinutes += mins;

      const s = parseTimeToMinutes(plan.start)!;
      const e = parseTimeToMinutes(plan.end)!;

      let amOverlap = overlapMinutes(s, e, amS, amE);
      let pmOverlap = overlapMinutes(s, e, pmS, pmE);

      if (amOverlap < sessions.sessionTriggerMinutes) amOverlap = 0;
      if (pmOverlap < sessions.sessionTriggerMinutes) pmOverlap = 0;

      const hourlyCostFor = (m: number) => {
        const rounded = roundUpMinutes(m, sessions.hourlyRoundingMinutes);
        return (rounded / 60) * rates.hourly;
      };

      const candHourly = hourlyCostFor(mins);

      let sessionsOnly = 0;
      if (amOverlap > 0) sessionsOnly += rates.am;
      if (pmOverlap > 0) sessionsOnly += rates.pm;
      const candSessionsOnly = (amOverlap > 0 || pmOverlap > 0) ? sessionsOnly : candHourly;

      let candAmPlusHourly = Number.POSITIVE_INFINITY;
      if (amOverlap > 0) {
        const extraBeforeAM = s < amS ? amS - s : 0;
        const extraAfterAM = e > amE ? e - Math.max(s, amE) : 0;
        candAmPlusHourly = rates.am + hourlyCostFor(extraBeforeAM + extraAfterAM);
      }

      let candPmPlusHourly = Number.POSITIVE_INFINITY;
      if (pmOverlap > 0) {
        const extraBeforePM = s < pmS ? pmS - s : 0;
        const extraAfterPM = e > pmE ? e - Math.max(s, pmE) : 0;
        candPmPlusHourly = rates.pm + hourlyCostFor(extraBeforePM + extraAfterPM);
      }

      const dayRateEligible = (amOverlap > 0 && pmOverlap > 0) || mins / 60 >= sessions.fullDayHours;
      let candBothSessionsPlusEdges = Number.POSITIVE_INFINITY;
      if (amOverlap > 0 && pmOverlap > 0) {
        const extraBeforeAM = s < amS ? amS - s : 0;
        const extraAfterPM = e > pmE ? e - Math.max(s, pmE) : 0;
        candBothSessionsPlusEdges = rates.am + rates.pm + hourlyCostFor(extraBeforeAM + extraAfterPM);
      }
      const candDayRate = dayRateEligible ? rates.day : Number.POSITIVE_INFINITY;

      const best = Math.min(
        candHourly,
        candSessionsOnly,
        candAmPlusHourly,
        candPmPlusHourly,
        candBothSessionsPlusEdges,
        candDayRate
      );

      weeklyTotal += best;
    }

    // Funding
    const attendedHours = attendedMinutes / 60;
    const fundedHoursPerWeek = c.ageYears >= 3 ? (yearMode === "FULL_YEAR" ? 22.8 : 30) : 0;
    const fundedHoursApplied = Math.min(attendedHours, fundedHoursPerWeek);
    const avgEffectiveRate = attendedHours > 0 ? weeklyTotal / attendedHours : 0;
    const creditRatePerHour = Math.min(rates.hourly, avgEffectiveRate);
    let weeklyFundingCredit = Math.min(weeklyTotal, fundedHoursApplied * creditRatePerHour);

    weeklyTotal = Math.round(weeklyTotal * 100) / 100;
    weeklyFundingCredit = Math.round(weeklyFundingCredit * 100) / 100;

    const weeklyAfterFunding = Math.max(0, Math.round((weeklyTotal - weeklyFundingCredit) * 100) / 100);
    const monthlyInvoice = Math.round(weeklyAfterFunding * monthlyFactor * 100) / 100;

    const tfcCap = (c.tfcMonthlyCapPence ?? 0) / 100;
    const tfcTopUp = Math.min(Math.round(monthlyInvoice * 0.2 * 100) / 100, tfcCap);
    const parentNet = Math.max(0, Math.round((monthlyInvoice - tfcTopUp) * 100) / 100);

    return {
      id: c.id,
      name: c.name,
      ageYears: c.ageYears,
      timetable,
      weekly: {
        attendedHours: Math.round(attendedHours * 100) / 100,
        totalBeforeFunding: weeklyTotal,
        fundedHoursApplied,
        fundingCredit: weeklyFundingCredit,
        afterFunding: weeklyAfterFunding,
      },
      monthly: {
        invoice: monthlyInvoice,
        tfcTopUp,
        parentNet,
      },
      labels: {
        fundingRule: c.ageYears >= 3
          ? (yearMode === "FULL_YEAR" ? "22.8 hrs/week (stretched)" : "30 hrs/week (term time)")
          : "0 hrs/week (under 3)",
        monthlyFactor: yearMode === "FULL_YEAR" ? "51 w/yr ÷ 12" : `${termWeeks} w/yr ÷ 11`,
      },
    };
  });

  return { yearMode, termWeeks, kids };
}

export default async function DashboardShell() {
  const [s, budget, session, nursery] = await Promise.all([
    getDashboardData(),
    getBudgetInsights(),
    getServerSession(authOptions),
    getNurserySnapshot(),
  ]);

  const monthLabel = budget?.monthLabel ?? "This month";
  const plannedIncomeStr = budget?.plannedIncomeStr ?? "£0";
  const plannedExpenseStr = budget?.plannedExpenseStr ?? "£0";
  const netPlanStr = budget?.netPlanStr ?? "£0";
  const totalPotsStr = budget?.totalPotsStr ?? "£0";
  const topPotNote = budget?.topPotNote ?? "";
  const byMonth = budget?.byMonth ?? { income: {}, expense: {}, savings: {} };

  const potDefs: PotDef[] = (budget?.savingsByPot ?? []).map((p: any) => ({
    key: `pot:${p.id}`,
    name: p.name,
  }));

  let savingsRun = 0;
  const potRun: Record<string, number> = {};
  const trendData = MONTHS.map((m, i) => {
    const idx = i + 1;
    const incomeGBP = Math.round((byMonth.income?.[idx] ?? 0) / 100);
    const expensesGBP = Math.round((byMonth.expense?.[idx] ?? 0) / 100);
    const savingsGBP = Math.round((byMonth.savings?.[idx] ?? 0) / 100);
    savingsRun += savingsGBP;

    const point: Record<string, number | string> = {
      month: m,
      income: incomeGBP,
      expenses: expensesGBP,
      savingsCum: savingsRun,
    };

    for (const p of budget?.savingsByPot ?? []) {
      const key = `pot:${p.id}`;
      const monthGBP = Math.round(((p.monthly?.[idx] ?? 0) as number) / 100);
      potRun[key] = (potRun[key] ?? 0) + monthGBP;
      point[key] = potRun[key];
    }
    return point as any;
  });

  return (
    <div className="max-w-6xl mx-auto px-2 sm:px-6 py-4 sm:py-6 space-y-6">
      <header className="flex items-center justify-between gap-3">
        <HearthPlanLogo size={50} variant="app" />
        {session?.user ? <UserMenu user={session.user} /> : null}
      </header>

      <div className="flex items-center justify-between ">
        <div>
          <h1 className="text-xl font-bold ml-1">{s.householdName}</h1>
        </div>
      </div>

      <Section title="Budget overview" ctaHref="/app#budget" ctaLabel="Open Family Budget" tone="violet">
        <div className="grid gap-4">
          <BudgetTrendChart data={trendData} potDefs={potDefs} />
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Planned income" value={plannedIncomeStr} sub={monthLabel} />
            <Stat label="Planned expenses" value={plannedExpenseStr} sub={monthLabel} />
            <Stat label="Net plan" value={netPlanStr} sub={budget?.netPlanNote} />
            <Stat label="Saved so far" value={totalPotsStr} sub={topPotNote} />
          </div>
        </div>
        {!!budget?.topCategories?.length && (
          <div className="mt-4">
            <div className="text-xs opacity-70 mb-2">Top planned categories</div>
            <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {budget.topCategories.map((c: any, i: number) => (
                <li key={i} className="rounded-lg border px-3 py-2 bg-white flex items-center justify-between">
                  <span className="text-sm">{c.name}</span>
                  <span className="text-sm font-medium">{c.plannedStr}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      <Section
        title="Childcare snapshot"
        ctaHref="/app#nursery"
        ctaLabel="Open Nursery Planner"
        tone="green"
      >
        {nursery.kids.length === 0 ? (
          <div className="text-sm opacity-75">
            No childcare profiles yet. Set up your children, rates and timetable in the Nursery Planner.
          </div>
        ) : (
          <div className="space-y-3">
            <Tabs defaultValue={nursery.kids[0].id} className="w-full">
              <TabsList className="w-full overflow-x-auto max-w-64">
                {nursery.kids.map((k: any) => (
                  <TabsTrigger key={k.id} value={k.id} className="whitespace-nowrap">
                    {k.name}
                  </TabsTrigger>
                ))}
              </TabsList>

              {nursery.kids.map((k: any) => (
                <TabsContent key={k.id} value={k.id} className="space-y-3">
                  <div>
                    <div className="text-xs opacity-70 mb-2">Weekly timetable</div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                      {DAYS.map((d) => {
                        const slot = k.timetable[d];
                        const label =
                          slot?.start && slot?.end
                            ? `${slot.start} – ${slot.end}`
                            : "—";
                        return (
                          <div key={d} className="rounded-lg border p-2 bg-white h-16">
                            <div className="text-sm opacity-70">{d}</div>
                            <div className="text-m font-medium">{label}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
                    <Stat label="Attended hours (weekly)" value={`${k.weekly.attendedHours.toFixed(2)} h`} />
                    <Stat label="Weekly total (before funding)" value={gbp(k.weekly.totalBeforeFunding)} />
                    <Stat label="Funding credit (weekly)" value={`- ${gbp(k.weekly.fundingCredit)}`} sub={k.labels.fundingRule} />
                    <Stat label={`Estimated monthly (${k.labels.monthlyFactor})`} value={gbp(k.monthly.invoice)} />
                    <Stat label="Parent net monthly" value={gbp(k.monthly.parentNet)} sub={`incl. TFC top-up ${gbp(k.monthly.tfcTopUp)}`} />
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </div>
        )}
      </Section>

      <Section title="Annual leave & closures" ctaHref="/app#leave" ctaLabel="Open Annual Leave" tone="amber">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <div className="text-xs opacity-70 mb-2">Upcoming school closures</div>
            <ul className="space-y-1">
              {s.closuresUpcoming.length === 0 && (
                <li className="text-sm opacity-70">None in the near future.</li>
              )}
              {s.closuresUpcoming.map((c: any, i: number) => (
                <li key={i} className="text-sm flex items-center gap-2">
                  <span className="inline-block w-28 opacity-70">{formatDay(c.dateISO)}</span>
                  <span className="font-medium">{c.label}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="text-xs opacity-70 mb-2">Upcoming leave</div>
            <ul className="space-y-1">
              {s.upcomingLeave.length === 0 && <li className="text-sm opacity-70">No leave booked.</li>}
              {s.upcomingLeave.map((l: any) => (
                <li key={l.id} className="text-sm">
                  <span className="inline-block w-28 opacity-70">{formatDay(l.dateISO)}</span>
                  <span className="font-medium">{l.label}</span>
                  {l.member ? <span className="opacity-70"> — {l.member}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <Section title="Activities snapshot" ctaHref="/app#activities" ctaLabel="Open Activities" tone="blue">
        <div className="grid lg:grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium opacity-80">Next 7 days load</div>
              <span className="px-2 py-0.5 rounded-full text-xs border bg-white">
                {s.weeklyActivities} total
              </span>
            </div>
            <WeekBars counts={s.activityLoadByWeekday} />
          </div>

          <div>
            <div className="text-xs opacity-70 mb-2">Next activities</div>
            <ul className="space-y-1">
              {s.nextActivities.length === 0 && (
                <li className="text-sm opacity-70">No activities scheduled this week.</li>
              )}
              {s.nextActivities.map((a: any) => (
                <li key={a.id} className="text-sm flex items-center gap-2">
                  <span className="inline-block w-28 opacity-70">{formatDay(a.dateISO)}</span>
                  <span className="font-medium">{a.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>
    </div>
  );
}
