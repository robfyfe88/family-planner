"use server";

import { prisma } from "@/lib/prisma";
import { getHouseholdIdOrThrow } from "@/lib/household";

export type Owner = "joint" | "A" | "B";
export type Kind = "income" | "expense";
export type RecurrenceUI = "recurring" | "oneoff"
export type Row = {
  id?: string;
  label: string;
  amount: number;
  owner?: Owner;
  recurrence?: RecurrenceUI;
};

export type Scope = "this-month" | "from-now-on" | "entire-range";

function monthStart(year: number, month1to12: number) {
  return new Date(Date.UTC(year, month1to12 - 1, 1, 0, 0, 0, 0));
}
function monthEnd(year: number, month1to12: number) {

  return new Date(Date.UTC(year, month1to12, 0, 0, 0, 0, 0));
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

const toISO = (d: Date) => d.toISOString().slice(0, 10);
const dateOnlyUTC = (d: Date) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

type RecurrenceKind = "none" | "weekly" | "biweekly" | "every_n_weeks";
function expandActivityDates(
  a: {
    startDate: Date;
    endDate: Date;
    recurrenceKind: RecurrenceKind;
    daysOfWeek: number[];
    intervalWeeks?: number | null;
  },
  windowLo: Date,
  windowHi: Date
): string[] {
  const s = dateOnlyUTC(a.startDate);
  const e = dateOnlyUTC(a.endDate);
  const lo = s <= e ? s : e;
  const hi = s <= e ? e : s;

  if (hi < windowLo || lo > windowHi) return [];

  const result: string[] = [];
  const push = (d: Date) => {
    if (d >= windowLo && d <= windowHi) result.push(toISO(d));
  };

  const addWeeklyLike = (intervalWeeks: number) => {
    const anchorWeekStart = addDays(s, -s.getUTCDay());
    for (
      let w = new Date(anchorWeekStart);
      w <= hi;
      w = addDays(w, 7 * intervalWeeks)
    ) {
      for (const wd of a.daysOfWeek) {
        const occ = addDays(w, wd);
        if (occ >= lo && occ <= hi) push(occ);
      }
    }
  };

  switch (a.recurrenceKind) {
    case "none": {
      for (let d = new Date(lo); d <= hi; d = addDays(d, 1)) push(d);
      break;
    }
    case "weekly":
      addWeeklyLike(1);
      break;
    case "biweekly":
      addWeeklyLike(2);
      break;
    case "every_n_weeks":
      addWeeklyLike(Math.max(1, a.intervalWeeks ?? 1));
      break;
  }
  return result;
}

export async function fetchBudgetRowsForMonth(
  year: number,
  month1to12: number
): Promise<{ incomes: Row[]; expenses: Row[] }> {
  const householdId = await getHouseholdIdOrThrow();
  const targetStart = monthStart(year, month1to12);
  const targetEnd = new Date(Date.UTC(year, month1to12, 0, 23, 59, 59, 999)); // end of month

  // 1) Base budget lines (as before)
  const lines = await prisma.budgetLine.findMany({
    where: {
      householdId,
      effectiveFrom: { lte: targetStart },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: targetStart } }],
    },
    include: {
      overrides: {
        where: { year, month: month1to12 },
        select: { amountPence: true },
      },
    },
    orderBy: [{ label: "asc" }],
  });

  const toRow = (l: (typeof lines)[number]): Row => ({
    id: l.id,
    label: l.label,
    amount: fromPence(l.overrides[0]?.amountPence ?? l.defaultAmountPence ?? 0),
    owner: l.owner as Owner,
    recurrence: "recurring",
  });

  const baseIncomes: Row[] = lines
    .filter((l) => l.flow === "income")
    .map(toRow);

  const baseExpenses: Row[] = lines
    .filter((l) => l.flow === "expense")
    .map(toRow);

  // 2) Activities that overlap this month (open-ended allowed)
  const acts = await prisma.plannerActivity.findMany({
    where: {
      householdId,
      startDate: { lte: targetEnd },
      OR: [{ endDate: null }, { endDate: { gte: targetStart } }],
    },
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      recurrenceKind: true,
      daysOfWeek: true,
      intervalWeeks: true,
      // new fee model fields (may be null if you haven't migrated everything yet)
      feeModel: true,
      amount: true,
      allocation: true,
      // legacy back-compat
      costPerSession: true,
    },
    orderBy: { name: "asc" },
  });

  // Helpers
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const startOfMonthUTC = (y: number, m1: number) => new Date(Date.UTC(y, m1 - 1, 1));
  const endOfMonthUTC = (y: number, m1: number) => new Date(Date.UTC(y, m1, 0));
  const inMonth = (d: Date) => d >= targetStart && d <= targetEnd;
  const monthLo = startOfMonthUTC(year, month1to12);
  const monthHi = endOfMonthUTC(year, month1to12);

  const addDays = (d: Date, n: number) => {
    const nd = new Date(d);
    nd.setUTCDate(nd.getUTCDate() + n);
    return nd;
  };

  const countOccurrencesInMonth = (a: any): number => {
    const s = new Date(ymd(a.startDate));
    const e = a.endDate ? new Date(ymd(a.endDate)) : monthHi; // if open-ended, clamp to this month
    const lo = s <= e ? s : e;
    const hi = s <= e ? e : s;

    if (hi < monthLo || lo > monthHi) return 0;

    const pushIfInMonth = (d: Date, arr: Date[]) => {
      if (d >= monthLo && d <= monthHi) arr.push(d);
    };

    const result: Date[] = [];
    const kind = a.recurrenceKind as "none" | "weekly" | "biweekly" | "every_n_weeks";

    const addWeeklyLike = (intervalWeeks: number) => {
      // anchor to the week of startDate
      const anchorWeekStart = addDays(s, -s.getUTCDay());
      for (let weekStart = new Date(anchorWeekStart); weekStart <= hi; weekStart = addDays(weekStart, 7 * intervalWeeks)) {
        for (const wd of (a.daysOfWeek as number[])) {
          const occ = addDays(weekStart, wd);
          if (occ >= lo && occ <= hi) pushIfInMonth(occ, result);
        }
      }
    };

    switch (kind) {
      case "none":
        // one-off (or “every day in range” legacy) — treat as one date if start is in this month
        if (inMonth(s)) result.push(s);
        break;
      case "weekly":
        addWeeklyLike(1);
        break;
      case "biweekly":
        addWeeklyLike(2);
        break;
      case "every_n_weeks":
        addWeeklyLike(Math.max(1, a.intervalWeeks ?? 1));
        break;
    }
    return result.length;
  };

  const monthsBetweenInclusive = (a: Date, b: Date) => {
    const y1 = a.getUTCFullYear(), m1 = a.getUTCMonth();
    const y2 = b.getUTCFullYear(), m2 = b.getUTCMonth();
    return (y2 - y1) * 12 + (m2 - m1) + 1;
  };

  const activityRows: Row[] = [];
  for (const a of acts) {
    // Effective fee model (fallback to legacy per-session if not set)
    const feeModel = (a.feeModel ?? "per_session") as "per_session" | "monthly" | "one_off" | "total_range";
    const unit = Number(a.amount ?? a.costPerSession ?? 0);
    const recurring = a.recurrenceKind !== "none" || feeModel === "monthly";

    let amtForMonth = 0;

    if (feeModel === "per_session") {
      const n = countOccurrencesInMonth(a);
      amtForMonth = n * unit;
    } else if (feeModel === "monthly") {
      // charge when month overlaps the active window
      const end = a.endDate ?? targetEnd; // open-ended
      if (!(end < monthLo || a.startDate > monthHi)) {
        amtForMonth = unit;
      }
    } else if (feeModel === "one_off") {
      // single charge in the start month
      if (a.startDate >= monthLo && a.startDate <= monthHi) {
        amtForMonth = unit;
      }
    } else if (feeModel === "total_range") {
      if (!a.endDate) {
        // no end date -> treat as upfront in start month
        if (a.startDate >= monthLo && a.startDate <= monthHi) amtForMonth = unit;
      } else {
        const months = Math.max(1, monthsBetweenInclusive(
          new Date(Date.UTC(a.startDate.getUTCFullYear(), a.startDate.getUTCMonth(), 1)),
          new Date(Date.UTC(a.endDate.getUTCFullYear(), a.endDate.getUTCMonth(), 1))
        ));
        if (a.startDate <= monthHi && a.endDate >= monthLo) {
          if (a.allocation === "upfront") {
            if (a.startDate >= monthLo && a.startDate <= monthHi) amtForMonth = unit;
          } else {
            // evenly spread
            amtForMonth = unit / months;
          }
        }
      }
    }

    if (amtForMonth > 0) {
      activityRows.push({
        id: `activity:${a.id}:${year}-${month1to12}`,
        label: a.name,
        amount: Math.round(amtForMonth * 100) / 100,
        owner: "joint",
        recurrence: recurring ? "recurring" : "oneoff",
      });
    }
  }

  return {
    incomes: baseIncomes,
    expenses: [...baseExpenses, ...activityRows],
  };
}


export async function upsertBudgetRowScoped(
  flow: Kind,
  payload: {
    id?: string;
    label: string;
    amount: number;
    owner?: Owner;
    year: number;
    month1to12: number;
    scope: Scope;
  }
): Promise<Row> {
  const householdId = await getHouseholdIdOrThrow();
  const label = normalizeLabel(payload.label);
  const owner = (payload.owner ?? "joint") as Owner;
  const defaultAmountPence = toPence(payload.amount);
  const effFrom = monthStart(payload.year, payload.month1to12);

  return prisma.$transaction(async (tx: any) => {
    let line =
      payload.id
        ? await tx.budgetLine.findFirst({
          where: { id: payload.id, householdId },
        })
        : await tx.budgetLine.findFirst({
          where: {
            householdId,
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
          householdId,
          label,
          flow,
          owner,
          recurrence: "monthly",
          effectiveFrom: effFrom,
          effectiveTo: null,
          defaultAmountPence,
        },
      });
    } else {
      if (line.label !== label || line.flow !== flow || (line.owner as Owner) !== owner) {
        line = await tx.budgetLine.update({
          where: { id: line.id },
          data: { label, flow, owner },
        });
      }
    }

    if (payload.scope === "this-month") {
      await tx.budgetLineOverride.upsert({
        where: {
          lineId_year_month: {
            lineId: line.id,
            year: payload.year,
            month: payload.month1to12,
          },
        },
        update: { amountPence: defaultAmountPence },
        create: {
          householdId,
          lineId: line.id,
          year: payload.year,
          month: payload.month1to12,
          amountPence: defaultAmountPence,
        },
      });
    } else if (payload.scope === "from-now-on") {
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
      await tx.budgetLine.update({
        where: { id: line.id },
        data: { defaultAmountPence },
      });
      await tx.budgetLineOverride.deleteMany({ where: { lineId: line.id } });
    }

    const ov = await tx.budgetLineOverride.findUnique({
      where: {
        lineId_year_month: {
          lineId: line.id,
          year: payload.year,
          month: payload.month1to12,
        },
      },
      select: { amountPence: true },
    });

    const amountForMonth =
      ov?.amountPence ??
      (await tx.budgetLine.findUnique({
        where: { id: line.id },
        select: { defaultAmountPence: true },
      }))?.defaultAmountPence ??
      0;

    return {
      id: line.id,
      label: line.label,
      amount: fromPence(amountForMonth),
      owner: line.owner as Owner,
      recurrence: "recurring" as const,    // 👈 fix
    };
  });
}

export async function deleteBudgetRowScoped(
  lineId: string,
  scope: Scope,
  year: number,
  month1to12: number
): Promise<{ ok: true }> {
  const householdId = await getHouseholdIdOrThrow();

  await prisma.$transaction(async (tx: any) => {
    const line = await tx.budgetLine.findFirst({
      where: { id: lineId, householdId },
      select: { id: true },
    });
    if (!line) return;

    if (scope === "this-month") {
      await tx.budgetLineOverride.upsert({
        where: { lineId_year_month: { lineId, year, month: month1to12 } },
        update: { amountPence: 0 },
        create: { householdId, lineId, year, month: month1to12, amountPence: 0 },
      });
      return;
    }

    if (scope === "from-now-on") {
      const cutPoint = monthStart(year, month1to12).getTime() - 1;
      await tx.budgetLine.update({
        where: { id: lineId },
        data: { effectiveTo: new Date(cutPoint) },
      });
      await tx.budgetLineOverride.deleteMany({
        where: {
          lineId,
          OR: [
            { year: { gt: year } },
            { year, month: { gte: month1to12 } },
          ],
        },
      });
      return;
    }

    await tx.budgetLineOverride.deleteMany({ where: { lineId } });
    await tx.budgetLine.delete({ where: { id: lineId } });
  });

  return { ok: true };
}