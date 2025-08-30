"use server";

import { prisma } from "@/lib/prisma";
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

export async function getBudgetInsights(): Promise<BudgetInsights> {
  const hh = await prisma.household.findFirst({ select: { id: true, name: true } });

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  if (!hh) {
    return {
      monthLabel: format(now, "MMM yyyy"),

      plannedIncomePence: 0,
      plannedExpensePence: 0,
      netPlanPence: 0,
      totalPotsPence: 0,

      plannedIncomeStr: "£0",
      plannedExpenseStr: "£0",
      netPlanStr: "£0",
      netPlanNote: "No data",
      totalPotsStr: "£0",
      topPotNote: "No pots",

      byMonth: { income: {}, expense: {}, savings: {} },
      topCategories: [],
      potBalances: [],
    };
  }

  const plans = await prisma.budgetMonthly.findMany({
    where: { householdId: hh.id, month, year },
    include: { category: true },
  });

  let inc = 0;
  let expAbs = 0;

  const categoriesAgg = new Map<
    string,
    { id: string; name: string; flow: "income" | "expense" | "transfer"; plannedPence: number }
  >();

  for (const p of plans) {
    const flow = p.category.flow as "income" | "expense" | "transfer";
    const val = Math.max(0, p.plannedPence ?? 0);

    if (flow === "income") inc += val;
    if (flow === "expense") expAbs += val;

    const prev = categoriesAgg.get(p.category.id);
    const nextAmount = (prev?.plannedPence ?? 0) + val;
    categoriesAgg.set(p.category.id, {
      id: p.category.id,
      name: p.category.name,
      flow,
      plannedPence: nextAmount,
    });
  }

  const net = inc - expAbs;

  const pots = await prisma.savingsPot.findMany({
    where: { householdId: hh.id },
    orderBy: { balancePence: "desc" },
  });
  const totalPots = pots.reduce((sum: any, x: { balancePence: any; }) => sum + (x.balancePence ?? 0), 0);
  const topPot = pots[0];

  const topCategories = Array.from(categoriesAgg.values())
    .sort((a, b) => b.plannedPence - a.plannedPence)
    .slice(0, 5)
    .map((c) => ({
      ...c,
      plannedStr: money(c.plannedPence),
    }));

  const plansYear = await prisma.budgetMonthly.findMany({
    where: { householdId: hh.id, year },
    include: { category: true },
  });

  const potPlansYear = await prisma.potMonthly.findMany({
    where: { householdId: hh.id, year },
  });

  const byMonth: BudgetInsights["byMonth"] = {
    income: {},
    expense: {},
    savings: {},
  };

  for (let m = 1; m <= 12; m++) {
    const incM = plansYear
      .filter((p: { month: number; category: { flow: string; }; }) => p.month === m && p.category.flow === "income")
      .reduce((s: any, p: { plannedPence: any; }) => s + (p.plannedPence ?? 0), 0);

    const expM = plansYear
      .filter((p: { month: number; category: { flow: string; }; }) => p.month === m && p.category.flow === "expense")
      .reduce((s: any, p: { plannedPence: any; }) => s + (p.plannedPence ?? 0), 0);

    const savM = potPlansYear
      .filter((p: { month: number; }) => p.month === m)
      .reduce((s: any, p: { amountPence: any; }) => s + (p.amountPence ?? 0), 0);

    byMonth.income[m] = incM;
    byMonth.expense[m] = expM;
    byMonth.savings[m] = savM;
  }

  return {
    monthLabel: format(now, "MMM yyyy"),

    plannedIncomePence: inc,
    plannedExpensePence: expAbs,
    netPlanPence: net,
    totalPotsPence: totalPots,

    plannedIncomeStr: money(inc),
    plannedExpenseStr: money(expAbs),
    netPlanStr: money(net),
    netPlanNote: net >= 0 ? "On plan to save" : "Deficit planned",
    totalPotsStr: money(totalPots),
    topPotNote: topPot ? `Top pot: ${topPot.name} ${money(topPot.balancePence ?? 0)}` : "No pots",

    byMonth,
    topCategories,
    potBalances: pots.map((p: { id: any; name: any; balancePence: any; }) => ({
      id: p.id,
      name: p.name,
      balancePence: p.balancePence ?? 0,
      balanceStr: money(p.balancePence ?? 0),
    })),
  };
}
