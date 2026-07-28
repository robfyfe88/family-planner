"use server";

import { prisma } from "@/lib/prisma";
import { getHouseholdIdOrThrow } from "@/lib/household";

const DEFAULT_CATEGORIES = [
  ["Home", "Essentials"],
  ["Groceries", "Essentials"],
  ["Transport", "Essentials"],
  ["Childcare", "Family"],
  ["Kids & activities", "Family"],
  ["Eating out", "Lifestyle"],
  ["Shopping", "Lifestyle"],
  ["Subscriptions", "Lifestyle"],
  ["Health", "Essentials"],
  ["Debt payments", "Financial"],
  ["Savings", "Financial"],
  ["Other", "Other"],
] as const;

const monthBounds = (year: number, month: number) => ({
  gte: new Date(Date.UTC(year, month - 1, 1)),
  lt: new Date(Date.UTC(year, month, 1)),
});

async function ensureCategories(householdId: string) {
  const count = await prisma.budgetCategory.count({ where: { householdId, flow: "expense" } });
  if (count > 0) return;
  await prisma.budgetCategory.createMany({
    data: DEFAULT_CATEGORIES.map(([name, group]) => ({
      householdId,
      name,
      group,
      isSpending: true,
      flow: "expense" as const,
    })),
    skipDuplicates: true,
  });
}

export async function fetchMoneyWorkspace(year: number, month: number) {
  const householdId = await getHouseholdIdOrThrow();
  await ensureCategories(householdId);

  const [categories, transactions, accounts, rules] = await Promise.all([
    prisma.budgetCategory.findMany({
      where: { householdId },
      include: { budgets: { where: { year, month } } },
      orderBy: [{ group: "asc" }, { name: "asc" }],
    }),
    prisma.transaction.findMany({
      where: { householdId, date: monthBounds(year, month) },
      include: { category: true, account: true },
      orderBy: [{ date: "desc" }, { description: "asc" }],
    }),
    prisma.account.findMany({ where: { householdId }, orderBy: [{ isPrimary: "desc" }, { name: "asc" }] }),
    prisma.categoryRule.findMany({
      where: { householdId },
      include: { category: true },
      orderBy: { matchText: "asc" },
    }),
  ]);

  return {
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      group: category.group || "Other",
      flow: category.flow,
      planned: (category.budgets[0]?.plannedPence || 0) / 100,
    })),
    transactions: transactions.map((transaction) => ({
      id: transaction.id,
      date: transaction.date.toISOString().slice(0, 10),
      description: transaction.description || "Transaction",
      amount: Math.abs(transaction.amountPence) / 100,
      flow: transaction.flow,
      categoryId: transaction.categoryId || "",
      categoryName: transaction.category?.name || "Needs review",
      accountName: transaction.account?.name || "Manual",
      needsReview: !transaction.categoryId,
    })),
    accounts: accounts.map((account) => ({ id: account.id, name: account.name, type: account.type || "bank" })),
    rules: rules.map((rule) => ({
      id: rule.id,
      matchText: rule.matchText,
      categoryId: rule.categoryId,
      categoryName: rule.category.name,
    })),
    bankLink: {
      provider: "Plaid",
      configured: Boolean(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET),
    },
  };
}

export async function setTransactionCategory(transactionId: string, categoryId: string, learn = false) {
  const householdId = await getHouseholdIdOrThrow();
  const transaction = await prisma.transaction.findFirst({ where: { id: transactionId, householdId } });
  const category = await prisma.budgetCategory.findFirst({ where: { id: categoryId, householdId } });
  if (!transaction || !category) throw new Error("Transaction or category not found");
  await prisma.transaction.update({ where: { id: transactionId }, data: { categoryId } });
  if (learn && transaction.description) {
    await prisma.categoryRule.upsert({
      where: { householdId_matchText: { householdId, matchText: transaction.description.toLowerCase().trim() } },
      update: { categoryId },
      create: { householdId, categoryId, matchText: transaction.description.toLowerCase().trim() },
    });
  }
  return { ok: true };
}

export async function setCategoryBudget(categoryId: string, year: number, month: number, amount: number) {
  const householdId = await getHouseholdIdOrThrow();
  const category = await prisma.budgetCategory.findFirst({ where: { id: categoryId, householdId } });
  if (!category) throw new Error("Category not found");
  await prisma.budgetMonthly.upsert({
    where: { householdId_categoryId_month_year: { householdId, categoryId, year, month } },
    update: { plannedPence: Math.max(0, Math.round(amount * 100)) },
    create: { householdId, categoryId, year, month, plannedPence: Math.max(0, Math.round(amount * 100)) },
  });
  return { ok: true };
}

export async function addManualTransaction(input: {
  date: string;
  description: string;
  amount: number;
  flow: "income" | "expense";
  categoryId?: string;
  accountName?: string;
}) {
  const householdId = await getHouseholdIdOrThrow();
  let account = await prisma.account.findFirst({
    where: { householdId, name: input.accountName?.trim() || "Manual" },
  });
  if (!account) {
    account = await prisma.account.create({
      data: { householdId, name: input.accountName?.trim() || "Manual", type: "manual" },
    });
  }
  return prisma.transaction.create({
    data: {
      householdId,
      accountId: account.id,
      categoryId: input.categoryId || null,
      date: new Date(`${input.date}T00:00:00.000Z`),
      amountPence: Math.round(Math.abs(input.amount) * 100) * (input.flow === "expense" ? -1 : 1),
      flow: input.flow,
      description: input.description.trim() || "Manual transaction",
    },
  });
}

export async function importStatementRows(rows: Array<{
  date: string;
  description: string;
  amount: number;
  flow?: "income" | "expense";
}>, accountName: string) {
  const householdId = await getHouseholdIdOrThrow();
  await ensureCategories(householdId);
  const [rules, categories] = await Promise.all([
    prisma.categoryRule.findMany({ where: { householdId } }),
    prisma.budgetCategory.findMany({ where: { householdId } }),
  ]);
  const account = await prisma.account.upsert({
    where: { householdId_name: { householdId, name: accountName.trim() || "Statement import" } },
    update: {},
    create: { householdId, name: accountName.trim() || "Statement import", type: "imported" },
  });

  let imported = 0;
  let skipped = 0;
  for (const row of rows.slice(0, 2000)) {
    const description = row.description.trim() || "Imported transaction";
    const date = new Date(`${row.date}T00:00:00.000Z`);
    const flow = row.flow || (row.amount < 0 ? "expense" : "income");
    const amountPence = Math.round(Math.abs(row.amount) * 100) * (flow === "expense" ? -1 : 1);
    const duplicate = await prisma.transaction.findFirst({
      where: { householdId, accountId: account.id, date, amountPence, description },
    });
    if (duplicate) {
      skipped += 1;
      continue;
    }
    const normalized = description.toLowerCase();
    const rule = rules.find((item) => normalized.includes(item.matchText));
    const fallback = categories.find((item) => item.name === "Other" && item.flow === "expense");
    await prisma.transaction.create({
      data: {
        householdId,
        accountId: account.id,
        categoryId: rule?.categoryId || (flow === "expense" ? fallback?.id : null),
        date,
        amountPence,
        flow,
        description,
      },
    });
    imported += 1;
  }
  return { imported, skipped };
}

export async function deleteMoneyTransaction(transactionId: string) {
  const householdId = await getHouseholdIdOrThrow();
  await prisma.transaction.deleteMany({ where: { id: transactionId, householdId } });
  return { ok: true };
}

export async function saveCategoryRule(matchText: string, categoryId: string) {
  const householdId = await getHouseholdIdOrThrow();
  const normalized = matchText.toLowerCase().trim();
  if (!normalized) throw new Error("Rule text is required");
  await prisma.categoryRule.upsert({
    where: { householdId_matchText: { householdId, matchText: normalized } },
    update: { categoryId },
    create: { householdId, categoryId, matchText: normalized },
  });
  return { ok: true };
}

export async function removeCategoryRule(id: string) {
  const householdId = await getHouseholdIdOrThrow();
  await prisma.categoryRule.deleteMany({ where: { id, householdId } });
  return { ok: true };
}
