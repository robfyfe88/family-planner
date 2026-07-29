import Link from "next/link";
import HearthPlanLogo from "@/components/HearthPlanLogo";
import BudgetTrendChart, { PotDef } from "@/components/BudgetTrendChart";
import React from "react";
import Section from "@/components/Section";
import Stat from "@/components/Stat";
import WeekBars from "@/components/Weekbars";
import { UserMenu } from "@/components/ui/UserMenu";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

import { getDashboardData } from "./actions";
import { getBudgetInsights } from "./budget-insights";
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
function formatDay(iso: string) {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
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

  const kids = children.map((c: any) => {
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

    const attendedHours = attendedMinutes / 60;
    const fundedHoursPerWeek = c.ageYears >= 3 ? (settings?.yearMode === "FULL_YEAR" ? 22.8 : 30) : 0;
    const fundedHoursApplied = Math.min(attendedHours, fundedHoursPerWeek);
    const avgEffectiveRate = attendedHours > 0 ? weeklyTotal / attendedHours : 0;
    const creditRatePerHour = Math.min(rates.hourly, avgEffectiveRate);
    let weeklyFundingCredit = Math.min(weeklyTotal, fundedHoursApplied * creditRatePerHour);

    weeklyTotal = Math.round(weeklyTotal * 100) / 100;
    weeklyFundingCredit = Math.round(weeklyFundingCredit * 100) / 100;

    const weeklyAfterFunding = Math.max(0, Math.round((weeklyTotal - weeklyFundingCredit) * 100) / 100);
    const monthlyInvoice = Math.round(weeklyAfterFunding * (weeksPerYear / monthlyDivisor) * 100) / 100;

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
          ? (settings?.yearMode === "FULL_YEAR" ? "22.8 hrs/week (stretched)" : "30 hrs/week (term time)")
          : "0 hrs/week (under 3)",
        monthlyFactor: settings?.yearMode === "FULL_YEAR" ? "51 w/yr ÷ 12" : `${termWeeks} w/yr ÷ 11`,
      },
    };
  });

  return { yearMode, termWeeks, kids };
}

export default async function DashboardShell() {
  const session = await getServerSession(authOptions);
  const role = (session as any)?.role ?? null;
  const isCaregiver = role === "caregiver";

  const sPromise = getDashboardData();

  const budgetPromise = isCaregiver ? Promise.resolve(null) : getBudgetInsights();
  const nurseryPromise = isCaregiver ? Promise.resolve(null) : getNurserySnapshot();

  const [s, budget, nursery] = await Promise.all([sPromise, budgetPromise, nurseryPromise]);

  const monthLabel = budget?.monthLabel ?? "This month";
  const plannedIncomeStr = budget?.plannedIncomeStr ?? "£0";
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
  const childcareParentNet = nursery?.kids.reduce((sum: number, child: any) => sum + child.monthly.parentNet, 0) ?? 0;
  const childcareInvoice = nursery?.kids.reduce((sum: number, child: any) => sum + child.monthly.invoice, 0) ?? 0;
  const childcareTfc = nursery?.kids.reduce((sum: number, child: any) => sum + child.monthly.tfcTopUp, 0) ?? 0;
  const leaveRemaining = s.leaveBalances.reduce((sum, item) => sum + item.remaining, 0);
  const moneyAfterMinimums = budget
    ? (budget.plannedIncomePence - budget.plannedExpensePence - budget.debtMinimumsPence) / 100 - s.monthlyActivityCost
    : 0;
  const dashboardPlannedExpenses = (budget?.plannedExpensePence ?? 0) / 100 + s.monthlyActivityCost;

  return (
    <div className="dashboard-shell max-w-6xl mx-auto px-2 sm:px-6 py-4 sm:py-6 space-y-6">
      <header className="flex items-center justify-between gap-3">
        <HearthPlanLogo size={50} variant="app" />
        {session?.user ? <UserMenu user={session.user} /> : null}
      </header>

      <section className="dashboard-command">
        <div>
          <span className="section-kicker">Household command centre</span>
          <h1>{s.householdName}</h1>
          <p>One shared view of the four things that shape family life: money, childcare, leave cover and activities.</p>
        </div>
        <div className="dashboard-pillar-grid">
          {!isCaregiver && <DashboardPillar href="/app#budget" label="Money" value={budget ? gbp(moneyAfterMinimums) : "£0"} note="After commitments and debt minimums" tone="money" />}
          {!isCaregiver && <DashboardPillar href="/app#nursery" label="Childcare" value={gbp(childcareParentNet)} note={`${nursery?.kids.length ?? 0} profiles · monthly parent cost`} tone="childcare" />}
          <DashboardPillar href="/app#leave" label="Leave" value={`${leaveRemaining} days`} note={`${s.closuresThisMonth} closures this month`} tone="leave" />
          <DashboardPillar href="/app#activities" label="Activities" value={gbp(s.monthlyActivityCost)} note={`${s.monthlyActivitySessions} sessions this month`} tone="activities" />
        </div>
      </section>

      {!isCaregiver && (
        <Section title="Budget overview" ctaHref="/app#budget" ctaLabel="Open Family Budget" tone="violet">
          <div className="grid gap-4">
            <BudgetTrendChart data={trendData} potDefs={potDefs} />
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <Stat label="Planned income" value={plannedIncomeStr} sub={monthLabel} />
              <Stat label="Planned expenses" value={gbp(dashboardPlannedExpenses)} sub={`${monthLabel} · includes activities`} />
              <Stat label="After debt minimums" value={gbp(moneyAfterMinimums)} sub={moneyAfterMinimums >= 0 ? "Available for saving and debt overpayment" : "Plan needs attention"} />
              <Stat label="Debt remaining" value={budget?.totalDebtStr ?? "£0"} sub={budget?.priorityDebtName ? `Priority: ${budget.priorityDebtName}` : "No eligible priority debt"} />
              <Stat label="Debt minimums" value={budget?.debtMinimumsStr ?? "£0"} sub="Protected in every pay cycle" />
              <Stat label="Emergency savings" value={budget?.emergencySavedStr ?? totalPotsStr} sub={budget?.emergencyTargetPence ? `Target ${budget.emergencyTargetStr}` : topPotNote} />
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
      )}

      {!isCaregiver && (
        <Section
          title="Childcare snapshot"
          ctaHref="/app#nursery"
          ctaLabel="Open Nursery Planner"
          tone="green"
        >
          {nursery && nursery.kids.length === 0 ? (
            <div className="text-sm opacity-75">
              No childcare profiles yet. Set up your children, rates and timetable in the Nursery Planner.
            </div>
          ) : (
            nursery && (
              <div className="space-y-3">
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <Stat label="Family parent cost" value={gbp(childcareParentNet)} sub="Monthly commitment" />
                  <Stat label="Invoice after funded hours" value={gbp(childcareInvoice)} />
                  <Stat label="Tax-Free Childcare top-up" value={`- ${gbp(childcareTfc)}`} />
                  <Stat label="Children modelled" value={String(nursery.kids.length)} sub={nursery.yearMode === "FULL_YEAR" ? "Full-year care" : `${nursery.termWeeks} term weeks`} />
                </div>
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
            )
          )}
        </Section>
      )}

      <Section title="Annual leave & closures" ctaHref="/app#leave" ctaLabel="Open Annual Leave" tone="amber">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <Stat label="Leave remaining" value={`${leaveRemaining} days`} sub="Across both parents" />
          <Stat label="Closures this month" value={String(s.closuresThisMonth)} sub={s.nextClosureISO ? `Next ${formatDay(s.nextClosureISO)}` : "No upcoming closure this month"} />
          <Stat label="Upcoming leave" value={String(s.upcomingLeave.length)} sub="Next booked entries" />
          <Stat label="Household members" value={String(s.membersCount)} sub="Parents, children and caregivers" />
        </div>
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
            <div className="text-xs opacity-70 mb-2">Leave allowance</div>
            <div className="dashboard-breakdown-list">
              {s.leaveBalances.map((item) => <span key={item.memberId}><b>{item.name}</b><em>{item.booked} used · {item.remaining} remaining</em><strong>{item.allowance} d</strong></span>)}
              {s.leaveBalances.length === 0 && <p className="text-sm opacity-70">Add parent leave allowances in the Leave planner.</p>}
            </div>
          </div>
        </div>
      </Section>

      <Section title="Activities snapshot" ctaHref="/app#activities" ctaLabel="Open Activities" tone="blue">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <Stat label="This month’s cost" value={gbp(s.monthlyActivityCost)} sub="Feeds the money plan" />
          <Stat label="Sessions this month" value={String(s.monthlyActivitySessions)} />
          <Stat label="Active activity plans" value={String(s.activeActivities)} />
          <Stat label="Next 7 days" value={String(s.weeklyActivities)} sub="Scheduled sessions" />
        </div>
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
            <div className="text-xs opacity-70 mb-2">Monthly cost breakdown</div>
            <div className="dashboard-breakdown-list">
              {s.activityCostBreakdown.map((item) => <span key={item.name}><b>{item.name}</b><em>Expected this month</em><strong>{gbp(item.cost)}</strong></span>)}
              {s.activityCostBreakdown.length === 0 && <p className="text-sm opacity-70">No activity costs expected this month.</p>}
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}

function DashboardPillar({ href, label, value, note, tone }: { href: string; label: string; value: string; note: string; tone: string }) {
  return (
    <Link href={href} className={`dashboard-pillar ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
      <ChevronRightIcon />
    </Link>
  );
}

function ChevronRightIcon() {
  return <span aria-hidden className="dashboard-pillar-arrow">→</span>;
}
