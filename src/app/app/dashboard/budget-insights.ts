"use server";

import { prisma } from "@/lib/prisma";
import format from "date-fns/format";

// ---------- helpers ----------
const money = (pence: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format((pence ?? 0) / 100);

const monthStart = (year: number, m1to12: number) =>
  new Date(Date.UTC(year, m1to12 - 1, 1, 0, 0, 0, 0));

type Flow = "income" | "expense" | "transfer";

// ---------- shape (unchanged) ----------
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
    income: Record<number, number>;   // pence
    expense: Record<number, number>;  // pence
    savings: Record<number, number>;  // pence (from PotMonthly)
  };

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

// ---------- main ----------
export async function getBudgetInsights(): Promise<BudgetInsights> {
  const hh = await prisma.household.findFirst({
    select: { id: true, name: true },
  });

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  // Empty shape when no household exists
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

  // ---------- CURRENT MONTH TOTALS (BudgetLine + Override) ----------
  const targetStart = monthStart(year, month);

  const currentLines = await prisma.budgetLine.findMany({
    where: {
      householdId: hh.id,
      effectiveFrom: { lte: targetStart },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: targetStart } }],
    },
    include: {
      overrides: { where: { year, month }, select: { amountPence: true } },
      category: { select: { id: true, name: true, flow: true } },
    },
    orderBy: { label: "asc" },
  });

  let plannedIncomePence = 0;
  let plannedExpensePence = 0;

  // Aggregate for "top categories" (only when a category is attached)
  const categoriesAgg = new Map<
    string,
    { id: string; name: string; flow: Flow; plannedPence: number }
  >();

  for (const l of currentLines) {
    const amt = (l.overrides[0]?.amountPence ?? l.defaultAmountPence ?? 0);
    if (l.flow === "income") plannedIncomePence += amt;
    else if (l.flow === "expense") plannedExpensePence += amt;

    if (l.category) {
      const prev = categoriesAgg.get(l.category.id);
      const next = (prev?.plannedPence ?? 0) + amt;
      categoriesAgg.set(l.category.id, {
        id: l.category.id,
        name: l.category.name,
        flow: l.category.flow as Flow,
        plannedPence: next,
      });
    }
  }

  const topCategories = Array.from(categoriesAgg.values())
    .sort((a, b) => b.plannedPence - a.plannedPence)
    .slice(0, 5)
    .map((c) => ({ ...c, plannedStr: money(c.plannedPence) }));

  // ---------- POTS ----------
  const pots = await prisma.savingsPot.findMany({
    where: { householdId: hh.id },
    orderBy: { balancePence: "desc" },
  });
  const totalPotsPence = pots.reduce((s : any, p : any) => s + (p.balancePence ?? 0), 0);
  const topPot = pots[0];

  // ---------- YEAR SERIES (12 months) ----------
  // Fetch all lines that can affect this year + all overrides for the year.
  const yearLines = await prisma.budgetLine.findMany({
    where: {
      householdId: hh.id,
      OR: [
        { effectiveTo: null, effectiveFrom: { lte: monthStart(year, 12) } },
        {
          AND: [
            { effectiveFrom: { lte: monthStart(year, 12) } },
            { effectiveTo: { gte: monthStart(year, 1) } },
          ],
        },
      ],
    },
    include: {
      overrides: { where: { year }, select: { month: true, amountPence: true } },
    },
  });

  const potPlansYear = await prisma.potMonthly.findMany({
    where: { householdId: hh.id, year },
    select: { month: true, amountPence: true },
  });

  const byMonth: BudgetInsights["byMonth"] = {
    income: {},
    expense: {},
    savings: {},
  };

  // Pre-fill savings by month from PotMonthly
  for (const p of potPlansYear) {
    if (p.month >= 1 && p.month <= 12) {
      byMonth.savings[p.month] = (byMonth.savings[p.month] ?? 0) + (p.amountPence ?? 0);
    }
  }

  // Walk each month and sum active lines (override-if-present else default)
  for (let m = 1; m <= 12; m++) {
    const mStart = monthStart(year, m);
    let inc = 0;
    let exp = 0;

    for (const l of yearLines) {
      const active =
        l.effectiveFrom <= mStart &&
        (l.effectiveTo === null || l.effectiveTo >= mStart);
      if (!active) continue;

      const ov = l.overrides.find((o : any) => o.month === m)?.amountPence;
      const amt = ov ?? (l.defaultAmountPence ?? 0);

      if (l.flow === "income") inc += amt;
      else if (l.flow === "expense") exp += amt;
    }

    byMonth.income[m] = inc;
    byMonth.expense[m] = exp;
    if (!(m in byMonth.savings)) byMonth.savings[m] = 0;
  }

  // ---------- Final formatting ----------
  const netPlanPence = plannedIncomePence - plannedExpensePence;
  const monthLabel = format(now, "MMM yyyy");

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
    topCategories,
    potBalances: pots.map((p : any) => ({
      id: p.id,
      name: p.name,
      balancePence: p.balancePence ?? 0,
      balanceStr: money(p.balancePence ?? 0),
    })),
  };
}
