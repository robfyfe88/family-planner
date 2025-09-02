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

type Flow = "income" | "expense" | "transfer";

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

  savingsByPot: Array<{
    id: string;
    name: string;
    monthly: Record<number, number>;  
  }>;

  topCategories: Array<{
    id: string;
    name: string;
    flow: Flow;
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

function monthStart(year: number, m1to12: number) {
  return new Date(Date.UTC(year, m1to12 - 1, 1, 0, 0, 0, 0));
}
function yearStart(year: number) {
  return new Date(Date.UTC(year, 0, 1));
}
function yearEnd(year: number) {
  return new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
}

export async function getBudgetInsights(): Promise<BudgetInsights> {
  const householdId = await getHouseholdIdOrThrow();

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const monthLabel = format(now, "MMM yyyy");

  const pots = await prisma.savingsPot.findMany({
    where: { householdId },
    orderBy: { balancePence: "desc" },
  });

  const totalPotsPence = pots.reduce((sum : any, p : any) => sum + (p.balancePence ?? 0), 0);
  const topPot = pots[0];

  const potPlansYear = await prisma.potMonthly.findMany({
    where: { householdId, year },
  });

  const savingsByPotMap = new Map<string, { id: string; name: string; monthly: Record<number, number> }>();
  for (const p of pots) savingsByPotMap.set(p.id, { id: p.id, name: p.name, monthly: {} });
  for (const r of potPlansYear) {
    const pot = savingsByPotMap.get(r.potId);
    if (pot) pot.monthly[r.month] = (pot.monthly[r.month] ?? 0) + (r.amountPence ?? 0);
  }

  const lines = await prisma.budgetLine.findMany({
    where: {
      householdId,
      effectiveFrom: { lte: yearEnd(year) },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: yearStart(year) } }],
    },
    include: {
      overrides: { where: { year }, select: { month: true, amountPence: true } },
      category: { select: { id: true, name: true, flow: true } },
    },
    orderBy: [{ label: "asc" }],
  });

  const byMonth: BudgetInsights["byMonth"] = { income: {}, expense: {}, savings: {} };

  for (let m = 1; m <= 12; m++) {
    byMonth.income[m] = 0;
    byMonth.expense[m] = 0;
    byMonth.savings[m] = 0; 
  }

  for (let m = 1; m <= 12; m++) {
    const start = monthStart(year, m);

    for (const line of lines) {
      const active =
        line.effectiveFrom.getTime() <= start.getTime() &&
        (line.effectiveTo == null || line.effectiveTo.getTime() >= start.getTime());

      if (!active) continue;

      const ov = line.overrides.find((o : any) => o.month === m);
      const amount = ov?.amountPence ?? (line.defaultAmountPence ?? 0);

      if (line.flow === "income") byMonth.income[m] += amount;
      else if (line.flow === "expense") byMonth.expense[m] += amount;
    }
  }

  for (let m = 1; m <= 12; m++) {
    const savM = potPlansYear
      .filter((p : any) => p.month === m)
      .reduce((s : any, p : any) => s + (p.amountPence ?? 0), 0);
    byMonth.savings[m] = savM;

    for (const pot of savingsByPotMap.values()) {
      if (pot.monthly[m] == null) pot.monthly[m] = 0;
    }
  }

  const plannedIncomePence = byMonth.income[month] ?? 0;
  const plannedExpensePence = byMonth.expense[month] ?? 0;
  const netPlanPence = plannedIncomePence - plannedExpensePence;

  const topAgg = new Map<
    string,
    { id: string; name: string; flow: Flow; plannedPence: number }
  >();

  for (const line of lines) {
    const active =
      line.effectiveFrom.getTime() <= monthStart(year, month).getTime() &&
      (line.effectiveTo == null || line.effectiveTo.getTime() >= monthStart(year, month).getTime());
    if (!active) continue;

    const ov = line.overrides.find((o : any) => o.month === month);
    const amount = ov?.amountPence ?? (line.defaultAmountPence ?? 0);
    const flow = line.flow as Flow;

    if (flow === "transfer" || amount <= 0) continue;

    const id = line.category?.id ?? `label:${line.label}`;
    const name = line.category?.name ?? line.label;

    const prev = topAgg.get(id);
    topAgg.set(id, {
      id,
      name,
      flow,
      plannedPence: (prev?.plannedPence ?? 0) + amount,
    });
  }

  const topCategories = Array.from(topAgg.values())
    .sort((a, b) => b.plannedPence - a.plannedPence)
    .slice(0, 5)
    .map((c) => ({ ...c, plannedStr: money(c.plannedPence) }));

  return {
    monthLabel,

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
    savingsByPot: Array.from(savingsByPotMap.values()),
    topCategories,
    potBalances: pots.map((p : any) => ({
      id: p.id,
      name: p.name,
      balancePence: p.balancePence ?? 0,
      balanceStr: money(p.balancePence ?? 0),
    })),
  };
}
