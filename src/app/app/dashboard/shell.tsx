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

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default async function DashboardShell() {
  const [s, budget] = await Promise.all([getDashboardData(), getBudgetInsights()]);
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
      </header>

      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs opacity-70">Household</div>
          <h1 className="text-xl font-semibold">{s.householdName}</h1>
        </div>
        <Link href="/app" className="px-3 py-1.5 rounded-full text-sm border bg-white">
          Open planner
        </Link>
      </div>

      <Section title="Budget overview" ctaHref="/app#budget" ctaLabel="Open Family Budget" tone="violet">
        <div className="grid gap-4">
          <BudgetTrendChart data={trendData} potDefs={potDefs} />
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Planned income" value={plannedIncomeStr} sub={monthLabel} />
            <Stat label="Planned expenses" value={plannedExpenseStr} sub={monthLabel} />
            <Stat
              label="Net plan"
              value={netPlanStr}
              sub={budget?.netPlanNote}
            />
            <Stat label="Saved so far" value={totalPotsStr} sub={topPotNote} />
          </div>
        </div>

        {!!budget?.topCategories?.length && (
          <div className="mt-4">
            <div className="text-xs opacity-70 mb-2">Top planned categories</div>
            <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {budget.topCategories.map((c: any, i: number) => (
                <li
                  key={i}
                  className="rounded-lg border px-3 py-2 bg-white flex items-center justify-between"
                >
                  <span className="text-sm">{c.name}</span>
                  <span className="text-sm font-medium">{c.plannedStr}</span>
                </li>
              ))}
            </ul>
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
