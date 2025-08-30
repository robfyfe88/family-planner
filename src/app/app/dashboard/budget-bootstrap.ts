"use server";

import { prisma } from "@/lib/prisma";

export async function ensureBudgetBootstrap() {
  const hh = await prisma.household.findFirst();
  if (!hh) return;

  const account = await prisma.account.upsert({
    where: { householdId_name: { householdId: hh.id, name: "Current Account" } },
    update: {},
    create: { householdId: hh.id, name: "Current Account", type: "bank", isPrimary: true },
  });

  const wanted = [
    { name: "Salary", group: "Income", flow: "income" as const, isSpending: false },
    { name: "Rent/Mortgage", group: "Housing", flow: "expense" as const, isSpending: true },
    { name: "Groceries", group: "Living", flow: "expense" as const, isSpending: true },
    { name: "Nursery", group: "Childcare", flow: "expense" as const, isSpending: true },
    { name: "Utilities", group: "Housing", flow: "expense" as const, isSpending: true },
  ];

  const catMap = new Map<string, string>();
  for (const w of wanted) {
    const c = await prisma.budgetCategory.upsert({
      where: { householdId_name: { householdId: hh.id, name: w.name } },
      update: {},
      create: {
        householdId: hh.id,
        name: w.name,
        group: w.group,
        flow: w.flow,
        isSpending: w.isSpending,
      },
    });
    catMap.set(w.name, c.id);
  }

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const plannedDefaults: Array<[string, number]> = [
    ["Rent/Mortgage", 1200_00],
    ["Groceries", 400_00],
    ["Nursery", 600_00],
    ["Utilities", 250_00],
  ];

  for (const [name, plannedPence] of plannedDefaults) {
    const categoryId = catMap.get(name);
    if (!categoryId) continue;
    await prisma.budgetMonthly.upsert({
      where: { householdId_categoryId_month_year: { householdId: hh.id, categoryId, month, year } },
      update: { plannedPence },
      create: { householdId: hh.id, categoryId, month, year, plannedPence },
    });
  }

  const existing = await prisma.transaction.count({
    where: { householdId: hh.id, date: { gte: new Date(year, month - 1, 1), lt: new Date(year, month, 1) } },
  });
  if (existing === 0) {
    const salaryCatId = catMap.get("Salary");
    const rentCatId = catMap.get("Rent/Mortgage");
    const today = new Date();
    if (salaryCatId) {
      await prisma.transaction.create({
        data: {
          householdId: hh.id,
          accountId: account.id,
          categoryId: salaryCatId,
          date: today,
          amountPence: 2800_00,
          flow: "income",
          description: "Monthly salary",
        },
      });
    }
    if (rentCatId) {
      await prisma.transaction.create({
        data: {
          householdId: hh.id,
          accountId: account.id,
          categoryId: rentCatId,
          date: today,
          amountPence: -1200_00,
          flow: "expense",
          description: "Rent",
        },
      });
    }
  }
}
