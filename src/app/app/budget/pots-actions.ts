"use server";

import { prisma } from "@/lib/prisma";
import { getHouseholdIdOrThrow } from "@/lib/household";

function nowMonthYear() {
  const d = new Date();
  return { month: d.getMonth() + 1, year: d.getFullYear() };
}

export async function fetchPots() {
  const householdId = await getHouseholdIdOrThrow();
  return prisma.savingsPot.findMany({
    where: { householdId },
    orderBy: { name: "asc" },
  });
}

export async function upsertPot(pot: { id?: string; name: string }) {
  const householdId = await getHouseholdIdOrThrow();

  if (pot.id) {
    return prisma.savingsPot.update({
      where: { id: pot.id },
      data: { name: pot.name },
    });
  }

  return prisma.savingsPot.create({
    data: {
      householdId,
      name: pot.name,
      balancePence: 0,
    },
  });
}

export async function deletePot(id: string) {
  const householdId = await getHouseholdIdOrThrow();
  await prisma.potMonthly.deleteMany({ where: { potId: id, householdId } });
  return prisma.savingsPot.delete({ where: { id } });
}

export async function fetchPotPlans(year?: number) {
  const householdId = await getHouseholdIdOrThrow();
  const y = year ?? nowMonthYear().year;

  const rows = await prisma.potMonthly.findMany({
    where: { householdId, year: y },
    orderBy: [{ potId: "asc" }, { month: "asc" }],
  });

  const byPot: Record<string, Record<number, number>> = {};
  for (const r of rows) {
    byPot[r.potId] ??= {};
    byPot[r.potId][r.month] = (r.amountPence ?? 0) / 100;
  }
  return { year: y, byPot };
}

export async function upsertPotPlan(params: {
  potId: string;
  month: number; 
  year: number;
  amount: number; 
}) {
  const householdId = await getHouseholdIdOrThrow();
  const amountPence = Math.round((params.amount || 0) * 100);

  await prisma.potMonthly.upsert({
    where: {
      householdId_potId_month_year: {
        householdId,
        potId: params.potId,
        month: params.month,
        year: params.year,
      },
    },
    update: { amountPence },
    create: {
      householdId,
      potId: params.potId,
      month: params.month,
      year: params.year,
      amountPence,
    },
  });

  return { ok: true };
}

export async function updatePotBalance(id: string, balance: number) {
  return prisma.savingsPot.update({
    where: { id },
    data: { balancePence: Math.round(balance * 100) },
  });
}
