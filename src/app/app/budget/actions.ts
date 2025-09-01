"use server";

import { prisma } from "@/lib/prisma";
import { getHouseholdIdOrThrow } from "@/lib/household";

export type Owner = "joint" | "A" | "B";
export type Kind = "income" | "expense";

export type Row = {
  id?: string;
  label: string;
  amount: number; 
  owner?: Owner;
};

export type Scope = "this-month" | "from-now-on" | "entire-range";

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

export async function fetchBudgetRowsForMonth(
  year: number,
  month1to12: number
): Promise<{ incomes: Row[]; expenses: Row[] }> {
  const householdId = await getHouseholdIdOrThrow();
  const target = monthStart(year, month1to12);

  const lines = await prisma.budgetLine.findMany({
    where: {
      householdId,
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

  const toRow = (l: (typeof lines)[number]): Row => ({
    id: l.id,
    label: l.label,
    amount: fromPence(l.overrides[0]?.amountPence ?? l.defaultAmountPence ?? 0),
    owner: l.owner as Owner,
  });

  return {
    incomes: lines.filter((l : any) => l.flow === "income").map(toRow),
    expenses: lines.filter((l : any) => l.flow === "expense").map(toRow),
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

  return prisma.$transaction(async (tx : any) => {
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

  await prisma.$transaction(async (tx : any) => {
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
