"use server";

import { prisma } from "@/lib/prisma";
import { getHouseholdIdOrThrow } from "@/lib/household";
import format from "date-fns/format";

const money = (pence: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format((pence ?? 0) / 100);

export type BudgetInsights = {
  monthLabel: string;
  plannedIncomePence: number;
  plannedExpensePence: number;
  netPlanPence: number;
  totalPotsPence: number;

  plannedIncomeStr: string;
  plannedExpenseStr: string;
  netPlanStr: string;
  netPlanNote: string;
  totalPotsStr: string;
  topPotNote: string;

  byMonth: {
    income: Record<number, number>;   
    expense: Record<number, number>;  
    savings: Record<number, number>;  
  };

  topCategories: Array<{
    id: string;
    name: string;
    flow: "income" | "expense" | "transfer";
    plannedPence: number;
    plannedStr: string;
  }>;

  potBalances: Array<{
    id: string;
    name: string;
    balancePence: number;
    balanceStr: string;
  }>;
};

function monthStartUTC(year: number, month1to12: number) {
  return new Date(Date.UTC(year, month1to12 - 1, 1, 0, 0, 0, 0));
}

export async function getBudgetInsights(): Promise<BudgetInsights> {
  const householdId = await getHouseholdIdOrThrow();

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const yearStart = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
  const yearEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));

  const lines = await prisma.budgetLine.findMany({
    where: {
      householdId,
      effectiveFrom: { lte: yearEnd },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: yearStart } }],
    },
    select: {
      id: true,
      label: true,
      flow: true,
      defaultAmountPence: true,
      effectiveFrom: true,
      effectiveTo: true,
    },
  });

  const overrides = await prisma.budgetLineOverride.findMany({
    where: { householdId, year },
    select: { lineId: true, month: true, amountPence: true },
  });

  const ovMap = new Map<string, number>(); 
  for (const o of overrides) ovMap.set(`${o.lineId}:${o.month}`, o.amountPence ?? 0);

  const byMonth: BudgetInsights["byMonth"] = {
    income: {},
    expense: {},
    savings: {},
  };

  const potPlans = await prisma.potMonthly.findMany({
    where: { householdId, year },
    select: { month: true, amountPence: true },
  });
  const savingsByMonth: Record<number, number> = {};
  for (let m = 1; m <= 12; m++) savingsByMonth[m] = 0;
  for (const p of potPlans) {
    savingsByMonth[p.month] = (savingsByMonth[p.month] ?? 0) + (p.amountPence ?? 0);
  }
  for (let m = 1; m <= 12; m++) byMonth.savings[m] = savingsByMonth[m] ?? 0;

  function lineAmountForMonth(
    line: (typeof lines)[number],
    m: number
  ): number {
    const key = `${line.id}:${m}`;
    if (ovMap.has(key)) return ovMap.get(key)!;

    const ms = monthStartUTC(year, m);
    if (line.effectiveFrom > ms) return 0;
    if (line.effectiveTo && line.effectiveTo < ms) return 0;
    return line.defaultAmountPence ?? 0;
  }

  let plannedIncomePence = 0;
  let plannedExpensePence = 0;

  const aggCurrentMonth = new Map<
    string,
    { id: string; name: string; flow: "income" | "expense" | "transfer"; plannedPence: number }
  >();

  for (let m = 1; m <= 12; m++) {
    let inc = 0;
    let exp = 0;

    for (const l of lines) {
      const p = lineAmountForMonth(l, m);
      if (!p) continue;

      if (l.flow === "income") inc += p;
      else if (l.flow === "expense") exp += p;

      if (m === month) {
        const prev = aggCurrentMonth.get(l.id);
        const nextAmt = (prev?.plannedPence ?? 0) + p;
        aggCurrentMonth.set(l.id, {
          id: l.id,
          name: l.label,
          flow: l.flow as any,
          plannedPence: nextAmt,
        });
      }
    }

    byMonth.income[m] = inc;
    byMonth.expense[m] = exp;

    if (m === month) {
      plannedIncomePence = inc;
      plannedExpensePence = exp;
    }
  }

  const netPlanPence = plannedIncomePence - plannedExpensePence;

  const pots = await prisma.savingsPot.findMany({
    where: { householdId },
    orderBy: { balancePence: "desc" },
    select: { id: true, name: true, balancePence: true },
  });
  const totalPotsPence = pots.reduce((s : any, p : any) => s + (p.balancePence ?? 0), 0);
  const topPot = pots[0];

  const topCategories = Array.from(aggCurrentMonth.values())
    .sort((a, b) => b.plannedPence - a.plannedPence)
    .slice(0, 5)
    .map((c) => ({ ...c, plannedStr: money(c.plannedPence) }));

  return {
    monthLabel: format(now, "MMM yyyy"),

    plannedIncomePence,
    plannedExpensePence,
    netPlanPence,
    totalPotsPence,

    plannedIncomeStr: money(plannedIncomePence),
    plannedExpenseStr: money(plannedExpensePence),
    netPlanStr: money(netPlanPence),
    netPlanNote: netPlanPence >= 0 ? "On plan to save" : "Deficit planned",
    totalPotsStr: money(totalPotsPence),
    topPotNote: topPot ? `Top pot: ${topPot.name} ${money(topPot.balancePence ?? 0)}` : "No pots",

    byMonth,
    topCategories,
    potBalances: pots.map((p : any) => ({
      id: p.id,
      name: p.name,
      balancePence: p.balancePence ?? 0,
      balanceStr: money(p.balancePence ?? 0),
    })),
  };
}
