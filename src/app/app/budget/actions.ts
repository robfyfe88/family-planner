"use server";

import { prisma } from "@/lib/prisma";

/** ---------------- Types (kept compatible with existing client) ---------------- */
export type Owner = "joint" | "A" | "B";
export type Row = { id?: string; label: string; amount: number; owner?: Owner };
export type Kind = "income" | "expense";

/** ---------------- Helpers ---------------- */
function nowMonthYear() {
  const d = new Date();
  return { month: d.getMonth() + 1, year: d.getFullYear() };
}
function monthStart(year: number, month1to12: number) {
  return new Date(Date.UTC(year, month1to12 - 1, 1));
}
function monthEnd(year: number, month1to12: number) {
  return new Date(Date.UTC(year, month1to12, 0, 23, 59, 59, 999));
}
async function getHousehold() {
  const hh = await prisma.household.findFirst({ select: { id: true } });
  if (!hh) throw new Error("No household found");
  return hh;
}
function normalizeLabel(s: string) {
  return (s || "").trim().replace(/\s+/g, " ");
}
function pence(amount: number) {
  return Math.round((amount || 0) * 100);
}
function pounds(penceVal: number | null | undefined) {
  return ((penceVal ?? 0) / 100);
}

/** Recurrence gating for a given month. 
 *  - monthly: always true within effective range
 *  - yearly: only true when month matches effectiveFrom’s month
 *  - none: only true when year+month == effectiveFrom’s year+month
 *  - weekly/custom: treat as monthly for planner (until richer rules are needed)
 */
function appliesByRecurrence(
  recurrence: "none" | "monthly" | "weekly" | "yearly" | "custom",
  effectiveFrom: Date,
  year: number,
  month1to12: number
) {
  const efM = effectiveFrom.getUTCMonth() + 1;
  const efY = effectiveFrom.getUTCFullYear();
  switch (recurrence) {
    case "monthly":
    case "weekly":
    case "custom":
      return true;
    case "yearly":
      return efM === month1to12;
    case "none":
      return efM === month1to12 && efY === year;
    default:
      return true;
  }
}

/** Partition helper */
function isIncome(flow: "income" | "expense" | "transfer") {
  return flow === "income";
}
function isExpense(flow: "income" | "expense" | "transfer") {
  return flow === "expense";
}

/** ---------------- Fetch (month-aware, with carry-forward + overrides) ---------------- */

export async function fetchBudgetRowsForMonth(
  year: number,
  month1to12: number
): Promise<{ incomes: Row[]; expenses: Row[] }> {
  const hh = await getHousehold();
  const start = monthStart(year, month1to12);
  const end = monthEnd(year, month1to12);

  // Active lines by effective range overlap
  const lines = await prisma.budgetLine.findMany({
    where: {
      householdId: hh.id,
      effectiveFrom: { lte: end },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: start } }],
    },
    select: {
      id: true,
      label: true,
      owner: true,
      flow: true,
      recurrence: true,
      effectiveFrom: true,
      defaultAmountPence: true,
    },
    orderBy: [{ flow: "asc" }, { label: "asc" }],
  });

  // Overrides in this month
  const overrides = await prisma.budgetLineOverride.findMany({
    where: { householdId: hh.id, year, month: month1to12 },
    select: { lineId: true, amountPence: true },
  });
  const overrideMap = new Map<string, number>();
  for (const o of overrides) overrideMap.set(o.lineId, o.amountPence);

  const rows: (Row & { _flow: "income" | "expense" | "transfer" })[] = [];

  for (const ln of lines) {
    // Check recurrence suitability for this month
    if (!appliesByRecurrence(ln.recurrence as any, ln.effectiveFrom, year, month1to12)) continue;

    const amountP = overrideMap.has(ln.id)
      ? overrideMap.get(ln.id)!
      : (ln.defaultAmountPence ?? 0);

    // If amount is zero for the month (e.g., "deleted" this month), skip like old BudgetMonthly absence.
    if (!amountP) continue;

    rows.push({
      id: ln.id,
      label: ln.label,
      amount: pounds(amountP),
      owner: (ln.owner?.toLowerCase?.() as Owner) ?? "joint",
      _flow: ln.flow as any,
    });
  }

  return {
    incomes: rows.filter(r => isIncome((r as any)._flow)).map(({ _flow, ...r }) => r),
    expenses: rows.filter(r => isExpense((r as any)._flow)).map(({ _flow, ...r }) => r),
  };
}

/** Backward-compatible: fetch current month */
export async function fetchBudgetRows(): Promise<{ incomes: Row[]; expenses: Row[] }> {
  const { month, year } = nowMonthYear();
  return fetchBudgetRowsForMonth(year, month);
}

/** ---------------- Upserts (scoped) ---------------- */

type UpsertScope = "this-month" | "from-now-on" | "entire-range";

export async function upsertBudgetRowScoped(
  flow: Kind,
  payload: {
    id?: string;              // existing line id (if editing a specific line)
    label: string;
    amount: number;
    owner?: Owner;
    year: number;
    month1to12: number;
    scope: UpsertScope;
  }
) {
  const hh = await getHousehold();
  const label = normalizeLabel(payload.label);
  const owner = (payload.owner ?? "joint") as Owner;
  const amountP = pence(payload.amount);
  const effFrom = monthStart(payload.year, payload.month1to12);

  return prisma.$transaction(async (tx: { budgetLine: { findFirst: (arg0: { where: { id: string; householdId: any; } | { householdId: any; label: string; flow: Kind; owner: Owner; OR: ({ effectiveTo: null; } | { effectiveTo: { gte: Date; }; })[]; }; orderBy?: { effectiveFrom: string; }[]; }) => any; create: (arg0: { data: { householdId: any; label: string; flow: Kind; owner: Owner; recurrence: string; effectiveFrom: Date; effectiveTo: null; defaultAmountPence: number; } | { householdId: any; label: string; flow: Kind; owner: Owner; recurrence: string; effectiveFrom: Date; effectiveTo: null; defaultAmountPence: number; } | { householdId: any; label: string; flow: Kind; owner: Owner; recurrence: string; effectiveFrom: Date; effectiveTo: null; defaultAmountPence: number; }; }) => any; update: (arg0: { where: { id: any; } | { id: any; } | { id: any; }; data: { label: string; flow: Kind; owner: Owner; } | { effectiveTo: Date; } | { label: string; flow: Kind; owner: Owner; defaultAmountPence: number; }; }) => any; }; budgetLineOverride: { upsert: (arg0: { where: { lineId_year_month: { lineId: any; year: number; month: number; }; }; update: { amountPence: number; }; create: { householdId: any; lineId: any; year: number; month: number; amountPence: number; }; }) => any; deleteMany: (arg0: { where: { lineId: any; year: number; month: number; } | { lineId: any; year: number; month: number; }; }) => any; }; }) => {
    // Try to locate target line: prefer explicit id; else fallback by (household, label, flow, owner) most recent open
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
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: effFrom } }],
          },
          orderBy: [{ effectiveFrom: "desc" }],
        });

    if (payload.scope === "this-month") {
      // Ensure a line exists (can be open-ended with default 0)
      if (!line) {
        line = await tx.budgetLine.create({
          data: {
            householdId: hh.id,
            label,
            flow,
            owner,
            recurrence: "monthly",
            effectiveFrom: effFrom,
            effectiveTo: null,
            defaultAmountPence: 0,
          },
        });
      } else if (line.label !== label || line.flow !== flow || line.owner !== owner) {
        // If metadata changed, update line metadata minimally (doesn't affect history)
        line = await tx.budgetLine.update({
          where: { id: line.id },
          data: { label, flow, owner },
        });
      }

      // Upsert override for this month
      await tx.budgetLineOverride.upsert({
        where: { lineId_year_month: { lineId: line.id, year: payload.year, month: payload.month1to12 } },
        update: { amountPence: amountP },
        create: {
          householdId: hh.id,
          lineId: line.id,
          year: payload.year,
          month: payload.month1to12,
          amountPence: amountP,
        },
      });

      return { id: line.id, label: line.label, amount: pounds(amountP) };
    }

    if (payload.scope === "from-now-on") {
      // Close any open line for this label/owner/flow and start a new one this month
      if (line && line.effectiveTo === null && line.effectiveFrom <= effFrom) {
        // set effectiveTo to the last day of previous month
        const prevMonthEnd = new Date(Date.UTC(payload.year, payload.month1to12 - 1, 0, 23, 59, 59, 999));
        await tx.budgetLine.update({
          where: { id: line.id },
          data: { effectiveTo: prevMonthEnd },
        });
      }

      const newLine = await tx.budgetLine.create({
        data: {
          householdId: hh.id,
          label,
          flow,
          owner,
          recurrence: "monthly",
          effectiveFrom: effFrom,
          effectiveTo: null,
          defaultAmountPence: amountP,
        },
      });

      // Remove any stale override this month (default now equals intended)
      await tx.budgetLineOverride.deleteMany({
        where: { lineId: newLine.id, year: payload.year, month: payload.month1to12 },
      });

      return { id: newLine.id, label: newLine.label, amount: pounds(newLine.defaultAmountPence) };
    }

    // entire-range: mutate existing line in place, or create a new open line anchored at this month
    if (line) {
      line = await tx.budgetLine.update({
        where: { id: line.id },
        data: { label, flow, owner, defaultAmountPence: amountP },
      });

      // Clear this-month override (if any) since default changed
      await tx.budgetLineOverride.deleteMany({
        where: { lineId: line.id, year: payload.year, month: payload.month1to12 },
      });

      return { id: line.id, label: line.label, amount: pounds(line.defaultAmountPence) };
    } else {
      const newLine = await tx.budgetLine.create({
        data: {
          householdId: hh.id,
          label,
          flow,
          owner,
          recurrence: "monthly",
          effectiveFrom: effFrom,
          effectiveTo: null,
          defaultAmountPence: amountP,
        },
      });
      return { id: newLine.id, label: newLine.label, amount: pounds(newLine.defaultAmountPence) };
    }
  });
}

/** Backward-compatible: treat as "from now on" for current month, owner=joint */
export async function upsertBudgetRow(
  flow: Kind,
  row: { id?: string; label: string; amount: number }
) {
  const { month, year } = nowMonthYear();
  const label = normalizeLabel(row.label);
  if (!label) return { id: row.id ?? "", label, amount: row.amount ?? 0 };

  return upsertBudgetRowScoped(flow, {
    id: row.id,         // will be a BudgetLine id if editing existing row
    label,
    amount: row.amount,
    owner: "joint",
    year,
    month1to12: month,
    scope: "from-now-on",
  });
}

/** ---------------- Delete (this-month behaviour) ----------------
 * Matches old BudgetMonthly UX: removing a row only affects the selected month.
 * - If an override exists for this month -> delete it.
 * - Else write a zero-amount override for this month so it disappears here without touching history/future.
 */
export async function deleteBudgetRow(lineId: string): Promise<{ ok: true }> {
  const hh = await getHousehold();
  const { month, year } = nowMonthYear();

  // ensure the line exists & belongs to household
  const line = await prisma.budgetLine.findFirst({
    where: { id: lineId, householdId: hh.id },
    select: { id: true },
  });
  if (!line) return { ok: true };

  const existingOverride = await prisma.budgetLineOverride.findUnique({
    where: { lineId_year_month: { lineId, year, month } },
  });

  if (existingOverride) {
    await prisma.budgetLineOverride.delete({
      where: { lineId_year_month: { lineId, year, month } },
    });
  } else {
    // Create a zero override to hide this row for this month only
    await prisma.budgetLineOverride.upsert({
      where: { lineId_year_month: { lineId, year, month } },
      update: { amountPence: 0 },
      create: {
        householdId: hh.id,
        lineId,
        year,
        month,
        amountPence: 0,
      },
    });
  }

  return { ok: true };
}
