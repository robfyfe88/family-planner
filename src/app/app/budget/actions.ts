"use server";

import { prisma } from "@/lib/prisma";

// ---------- Types shared with the client ----------
export type Owner = "joint" | "A" | "B";
export type Kind = "income" | "expense";

export type Row = {
  id?: string;            // BudgetLine.id
  label: string;
  amount: number;         // GBP decimal
  owner?: Owner;
};

// The UI calls these:
export type Scope = "this-month" | "from-now-on" | "entire-range";

// ---------- Helpers ----------
function nowMonthYear() {
  const d = new Date();
  return { month: d.getMonth() + 1, year: d.getFullYear() };
}

async function getHousehold() {
  const hh = await prisma.household.findFirst({ select: { id: true } });
  if (!hh) throw new Error("No household found");
  return hh;
}

function monthStart(year: number, month1to12: number) {
  return new Date(Date.UTC(year, month1to12 - 1, 1, 0, 0, 0, 0));
}

function normalizeLabel(s: string) {
  return (s || "").trim().replace(/\s+/g, " ");
}

function toPence(amount: number) {
  return Math.round((amount || 0) * 100);
}

function fromPence(p: number) {
  return (p || 0) / 100;
}

// --------------------------------------------------
// Fetch rows for a specific month from BudgetLine + overrides
// --------------------------------------------------
export async function fetchBudgetRowsForMonth(
  year: number,
  month1to12: number
): Promise<{ incomes: Row[]; expenses: Row[] }> {
  const hh = await getHousehold();
  const target = monthStart(year, month1to12);

  const lines = await prisma.budgetLine.findMany({
    where: {
      householdId: hh.id,
      effectiveFrom: { lte: target },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: target } }],
    },
    include: {
      overrides: {
        where: { year, month: month1to12 },
        select: { amountPence: true },
      },
    },
    orderBy: [{ label: "asc" }],
  });

  const toRow = (l: typeof lines[number]): Row => ({
    id: l.id,
    label: l.label,
    amount: fromPence(l.overrides[0]?.amountPence ?? l.defaultAmountPence ?? 0),
    owner: l.owner as Owner,
  });

  return {
    incomes: lines.filter((l: { flow: string; }) => l.flow === "income").map(toRow),
    expenses: lines.filter((l: { flow: string; }) => l.flow === "expense").map(toRow),
  };
}

// --------------------------------------------------
// Upsert a row with explicit scope (this-month / from-now-on / entire-range)
// --------------------------------------------------
export async function upsertBudgetRowScoped(
  flow: Kind,
  payload: {
    id?: string;                 // BudgetLine.id if known
    label: string;
    amount: number;              // GBP decimal
    owner?: Owner;
    year: number;
    month1to12: number;
    scope: Scope;
  }
): Promise<Row> {
  const hh = await getHousehold();
  const label = normalizeLabel(payload.label);
  const owner = (payload.owner ?? "joint") as Owner;
  const defaultAmountPence = toPence(payload.amount);
  const effFrom = monthStart(payload.year, payload.month1to12);

  return prisma.$transaction(async (tx: {
      budgetLine: {
        findFirst: (arg0: { where: { id: string; householdId: any; } | { householdId: any; label: string; flow: Kind; owner: Owner; effectiveFrom: { lte: Date; }; OR: ({ effectiveTo: null; } | { effectiveTo: { gte: Date; }; })[]; }; orderBy?: { effectiveFrom: string; }[]; }) => any; create: (arg0: {
          data: {
            householdId: any; label: string; flow: Kind; owner: Owner; recurrence: string; // default behaviour
            effectiveFrom: Date; effectiveTo: null; defaultAmountPence: number;
          };
        }) => any; update: (arg0: { where: { id: any; } | { id: any; } | { id: any; }; data: { label: string; flow: Kind; owner: Owner; } | { defaultAmountPence: number; } | { defaultAmountPence: number; }; }) => any; findUnique: (arg0: { where: { id: any; }; select: { defaultAmountPence: boolean; }; }) => any;
      }; budgetLineOverride: { upsert: (arg0: { where: { lineId_year_month: { lineId: any; year: number; month: number; }; }; update: { amountPence: number; }; create: { householdId: any; lineId: any; year: number; month: number; amountPence: number; }; }) => any; deleteMany: (arg0: { where: { lineId: any; OR: ({ year: { gt: number; }; } | { year: number; month: { gte: number; }; })[]; } | { lineId: any; }; }) => any; findUnique: (arg0: { where: { lineId_year_month: { lineId: any; year: number; month: number; }; }; select: { amountPence: boolean; }; }) => any; };
    }) => {
    // 1) Find or create a BudgetLine
    let line = payload.id
      ? await tx.budgetLine.findFirst({
          where: { id: payload.id, householdId: hh.id },
        })
      : await tx.budgetLine.findFirst({
          where: {
            householdId: hh.id,
            label,
            flow,
            owner,
            effectiveFrom: { lte: effFrom },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: effFrom } }],
          },
          orderBy: [{ effectiveFrom: "desc" }],
        });

    if (!line) {
      line = await tx.budgetLine.create({
        data: {
          householdId: hh.id,
          label,
          flow,
          owner,
          recurrence: "monthly", // default behaviour
          effectiveFrom: effFrom,
          effectiveTo: null,
          defaultAmountPence,
        },
      });
    } else {
      // If basic identity fields changed (label/flow/owner), update them
      if (line.label !== label || line.flow !== flow || (line.owner as Owner) !== owner) {
        line = await tx.budgetLine.update({
          where: { id: line.id },
          data: { label, flow, owner },
        });
      }
    }

    // 2) Apply scope
    if (payload.scope === "this-month") {
      // Just this month -> upsert override for (year,month)
      await tx.budgetLineOverride.upsert({
        where: { lineId_year_month: { lineId: line.id, year: payload.year, month: payload.month1to12 } },
        update: { amountPence: defaultAmountPence },
        create: {
          householdId: hh.id,
          lineId: line.id,
          year: payload.year,
          month: payload.month1to12,
          amountPence: defaultAmountPence,
        },
      });
    } else if (payload.scope === "from-now-on") {
      // Update default and clear overrides from (year,month) onward
      await tx.budgetLine.update({
        where: { id: line.id },
        data: { defaultAmountPence },
      });
      await tx.budgetLineOverride.deleteMany({
        where: {
          lineId: line.id,
          OR: [
            { year: { gt: payload.year } },
            { year: payload.year, month: { gte: payload.month1to12 } },
          ],
        },
      });
    } else {
      // entire-range: set default and remove all overrides
      await tx.budgetLine.update({
        where: { id: line.id },
        data: { defaultAmountPence },
      });
      await tx.budgetLineOverride.deleteMany({ where: { lineId: line.id } });
    }

    // 3) Return the current-month value for convenience
    const ov = await tx.budgetLineOverride.findUnique({
      where: { lineId_year_month: { lineId: line.id, year: payload.year, month: payload.month1to12 } },
      select: { amountPence: true },
    });

    const amountForMonth = ov?.amountPence ?? (await tx.budgetLine.findUnique({ where: { id: line.id }, select: { defaultAmountPence: true } }))?.defaultAmountPence ?? 0;

    return {
      id: line.id,
      label: line.label,
      amount: fromPence(amountForMonth),
      owner: line.owner as Owner,
    };
  });
}

// --------------------------------------------------
// Delete: treat as "remove for this month" (set override to 0)
// If a line ends up unused elsewhere you can garbage-collect separately.
// --------------------------------------------------
export async function deleteBudgetRow(lineId: string): Promise<{ ok: true }> {
  const hh = await getHousehold();
  const { month, year } = nowMonthYear();

  // Ensure the line exists and belongs to the household
  const line = await prisma.budgetLine.findFirst({
    where: { id: lineId, householdId: hh.id },
    select: { id: true },
  });
  if (!line) {
    return { ok: true };
  }

  await prisma.budgetLineOverride.upsert({
    where: { lineId_year_month: { lineId, year, month } },
    update: { amountPence: 0 },
    create: { householdId: hh.id, lineId, year, month, amountPence: 0 },
  });

  return { ok: true };
}
