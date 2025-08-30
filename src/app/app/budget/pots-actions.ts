"use server";

import { prisma } from "@/lib/prisma";

function nowMonthYear() {
  const d = new Date();
  return { month: d.getMonth() + 1, year: d.getFullYear() };
}

async function getHousehold() {
  const hh = await prisma.household.findFirst({ select: { id: true } });
  if (!hh) throw new Error("No household found");
  return hh;
}

export async function fetchPots() {
  const hh = await getHousehold();
  return prisma.savingsPot.findMany({
    where: { householdId: hh.id },
    orderBy: { name: "asc" },
  });
}

export async function upsertPot(pot: { id?: string; name: string }) {
  const hh = await getHousehold();

  if (pot.id) {
    return prisma.savingsPot.update({
      where: { id: pot.id },
      data: { name: pot.name },
    });
  }

  return prisma.savingsPot.create({
    data: {
      householdId: hh.id,
      name: pot.name,
      balancePence: 0, 
    },
  });
}

export async function deletePot(id: string) {
  const hh = await getHousehold();
  await prisma.potMonthly.deleteMany({ where: { potId: id, householdId: hh.id } });
  return prisma.savingsPot.delete({ where: { id } });
}

export async function fetchPotPlans(year?: number) {
  const hh = await getHousehold();
  const y = year ?? nowMonthYear().year;

  const rows = await prisma.potMonthly.findMany({
    where: { householdId: hh.id, year: y },
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
  const hh = await getHousehold();
  const amountPence = Math.round((params.amount || 0) * 100);

  await prisma.potMonthly.upsert({
    where: {
      householdId_potId_month_year: {
        householdId: hh.id,
        potId: params.potId,
        month: params.month,
        year: params.year,
      },
    },
    update: { amountPence },
    create: {
      householdId: hh.id,
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
