"use server";

import { prisma } from "@/lib/prisma";
import { getHouseholdIdOrThrow } from "@/lib/household";

const pence = (value: number) => Math.max(0, Math.round((Number(value) || 0) * 100));
const UNFORESEEN_POT_NAME = "Unforeseen costs buffer";

export async function fetchUnforeseenBuffer() {
  const householdId = await getHouseholdIdOrThrow();
  const pot = await prisma.savingsPot.findUnique({
    where: {
      householdId_name: {
        householdId,
        name: UNFORESEEN_POT_NAME,
      },
    },
    select: {
      targetPence: true,
      balancePence: true,
    },
  });

  return {
    exists: Boolean(pot),
    target: (pot?.targetPence ?? 0) / 100,
    balance: (pot?.balancePence ?? 0) / 100,
  };
}

export async function saveUnforeseenBuffer(input: { target: number; balance: number }) {
  const householdId = await getHouseholdIdOrThrow();
  const targetPence = pence(input.target);
  const balancePence = Math.min(targetPence, pence(input.balance));
  const saved = await prisma.savingsPot.upsert({
    where: {
      householdId_name: {
        householdId,
        name: UNFORESEEN_POT_NAME,
      },
    },
    update: {
      targetPence,
      balancePence,
    },
    create: {
      householdId,
      name: UNFORESEEN_POT_NAME,
      targetPence,
      balancePence,
    },
  });

  return {
    target: (saved.targetPence ?? 0) / 100,
    balance: saved.balancePence / 100,
  };
}

export async function fetchFreedomData() {
  const householdId = await getHouseholdIdOrThrow();
  const [profile, debts, existingGoals] = await Promise.all([
    prisma.financialProfile.upsert({
      where: { householdId },
      update: {},
      create: { householdId },
    }),
    prisma.debt.findMany({ where: { householdId }, orderBy: { createdAt: "asc" } }),
    prisma.financialGoal.findMany({ where: { householdId }, orderBy: { createdAt: "asc" } }),
  ]);
  let goals = existingGoals;
  if (!goals.some((goal) => /emergency|rainy day|buffer/i.test(goal.name))) {
    const emergencyFund = await prisma.financialGoal.create({
      data: { householdId, name: "Emergency fund" },
    });
    goals = [emergencyFund, ...goals];
  }

  return {
    profile: {
      strategy: profile.debtStrategy === "snowball" ? "snowball" as const : "avalanche" as const,
      extraPayment: profile.extraPaymentPence / 100,
      fireTarget: profile.fireTargetPence / 100,
      emergencyFundMonths: profile.emergencyFundMonths,
    },
    debts: debts.map((debt) => ({
      id: debt.id,
      name: debt.name,
      balance: debt.balancePence / 100,
      apr: debt.aprBasisPoints / 100,
      minimum: debt.minimumPence / 100,
      promotionalEndDate: debt.promotionalEndDate?.toISOString().slice(0, 10) ?? "",
    })),
    goals: goals.map((goal) => ({
      id: goal.id,
      name: goal.name,
      target: goal.targetPence / 100,
      saved: goal.savedPence / 100,
      monthly: goal.monthlyPence / 100,
      targetDate: goal.targetDate?.toISOString().slice(0, 10) ?? "",
    })),
  };
}

export async function saveFinancialProfile(input: {
  strategy: "avalanche" | "snowball";
  extraPayment: number;
  fireTarget: number;
  emergencyFundMonths: number;
}) {
  const householdId = await getHouseholdIdOrThrow();
  await prisma.financialProfile.upsert({
    where: { householdId },
    update: {
      debtStrategy: input.strategy,
      extraPaymentPence: pence(input.extraPayment),
      fireTargetPence: pence(input.fireTarget),
      emergencyFundMonths: Math.max(1, Math.min(12, Math.round(input.emergencyFundMonths || 3))),
    },
    create: {
      householdId,
      debtStrategy: input.strategy,
      extraPaymentPence: pence(input.extraPayment),
      fireTargetPence: pence(input.fireTarget),
      emergencyFundMonths: Math.max(1, Math.min(12, Math.round(input.emergencyFundMonths || 3))),
    },
  });
  return { ok: true };
}

export async function saveDebt(input: {
  id?: string;
  name: string;
  balance: number;
  apr: number;
  minimum: number;
  promotionalEndDate?: string;
}) {
  const householdId = await getHouseholdIdOrThrow();
  const persistedId = input.id && !input.id.startsWith("new-") ? input.id : undefined;
  const data = {
    name: input.name.trim() || "Untitled debt",
    balancePence: pence(input.balance),
    aprBasisPoints: Math.max(0, Math.round((Number(input.apr) || 0) * 100)),
    minimumPence: pence(input.minimum),
    promotionalEndDate: input.promotionalEndDate
      ? new Date(`${input.promotionalEndDate}T00:00:00.000Z`)
      : null,
  };

  if (persistedId) {
    const existing = await prisma.debt.findFirst({ where: { id: persistedId, householdId } });
    if (!existing) throw new Error("Debt not found");
    const saved = await prisma.debt.update({ where: { id: persistedId }, data });
    return { id: saved.id };
  }
  const saved = await prisma.debt.create({ data: { householdId, ...data } });
  return { id: saved.id };
}

export async function removeDebt(id: string) {
  const householdId = await getHouseholdIdOrThrow();
  await prisma.debt.deleteMany({ where: { id, householdId } });
  return { ok: true };
}

export async function saveGoal(input: {
  id?: string;
  name: string;
  target: number;
  saved: number;
  monthly: number;
  targetDate?: string;
}) {
  const householdId = await getHouseholdIdOrThrow();
  const data = {
    name: input.name.trim() || "Untitled goal",
    targetPence: pence(input.target),
    savedPence: pence(input.saved),
    monthlyPence: pence(input.monthly),
    targetDate: input.targetDate ? new Date(`${input.targetDate}T00:00:00.000Z`) : null,
  };

  if (input.id) {
    const existing = await prisma.financialGoal.findFirst({ where: { id: input.id, householdId } });
    if (!existing) throw new Error("Goal not found");
    return prisma.financialGoal.update({ where: { id: input.id }, data });
  }
  return prisma.financialGoal.create({ data: { householdId, ...data } });
}

export async function removeGoal(id: string) {
  const householdId = await getHouseholdIdOrThrow();
  await prisma.financialGoal.deleteMany({ where: { id, householdId } });
  return { ok: true };
}
