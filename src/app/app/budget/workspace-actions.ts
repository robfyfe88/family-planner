"use server";

import { prisma } from "@/lib/prisma";
import { getHouseholdIdOrThrow } from "@/lib/household";

const DEFAULT_CATEGORIES = [
  ["Salary", "Income", "income", false],
  ["Benefits", "Income", "income", false],
  ["Other income", "Income", "income", false],
  ["Home & bills", "Essentials"],
  ["Food & groceries", "Essentials"],
  ["Transport", "Essentials"],
  ["Children & family", "Family"],
  ["Personal & lifestyle", "Lifestyle"],
  ["Debt repayments", "Debt"],
  ["Other", "Other"],
  ["Transfers", "System", "expense", false],
] as const;

const BANK_CATEGORY_ALIASES: Record<string, string> = {
  BILLS_AND_SERVICES: "Home & bills",
  CASH: "Other",
  CASH_WITHDRAWAL: "Other",
  CHILDCARE: "Children & family",
  EATING_OUT: "Personal & lifestyle",
  ENTERTAINMENT: "Personal & lifestyle",
  FOOD_AND_DRINK: "Food & groceries",
  GENERAL: "Other",
  GROCERIES: "Food & groceries",
  HEALTH: "Personal & lifestyle",
  INCOME: "Other income",
  PAYMENTS: "Other",
  SALARY: "Salary",
  SHOPPING: "Personal & lifestyle",
  TRANSPORT: "Transport",
};

const isDebtLabel = (value: string) => /\b(credit\s*card|loan)\b/i.test(value);

const monthBounds = (year: number, month: number) => ({
  gte: new Date(Date.UTC(year, month - 1, 1)),
  lt: new Date(Date.UTC(year, month, 1)),
});

async function ensureCategories(householdId: string) {
  await prisma.budgetCategory.createMany({
    data: DEFAULT_CATEGORIES.map((category) => {
      const [name, group] = category;
      const flow = category.length > 2 ? category[2] : "expense";
      const isSpending = category.length > 3 ? category[3] : true;
      return {
        householdId,
        name,
        group,
        isSpending,
        flow: flow as "income" | "expense",
      };
    }),
    skipDuplicates: true,
  });
}

async function reclassifyInternalTransfers(householdId: string) {
  const transferCategory = await prisma.budgetCategory.findFirst({
    where: { householdId, name: "Transfers" },
    select: { id: true },
  });
  if (!transferCategory) return;

  await prisma.transaction.updateMany({
    where: {
      householdId,
      OR: [
        { description: { contains: "Joint Savings", mode: "insensitive" } },
        { description: { contains: "Transfer from Easy Saver", mode: "insensitive" } },
        { description: { contains: "Transfer into Easy Saver", mode: "insensitive" } },
      ],
    },
    data: { categoryId: transferCategory.id },
  });
}

export async function fetchMoneyWorkspace(year: number, month: number) {
  const householdId = await getHouseholdIdOrThrow();
  await ensureCategories(householdId);
  await reclassifyInternalTransfers(householdId);

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
      isSpending: category.isSpending,
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
      countsAsMoney: transaction.category?.isSpending ?? true,
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
    const learnedText = transaction.description.split("—")[0].toLowerCase().trim();
    await prisma.categoryRule.upsert({
      where: { householdId_matchText: { householdId, matchText: learnedText } },
      update: { categoryId },
      create: { householdId, categoryId, matchText: learnedText },
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
  bankCategory?: string;
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
    const bankCategory = row.bankCategory?.trim().toUpperCase().replace(/[\s-]+/g, "_") || "";
    const mappedName = BANK_CATEGORY_ALIASES[bankCategory];
    const debtLabel = isDebtLabel(description);
    const internalTransfer = /\bjoint savings\b|transfer (?:from|into) easy saver/i.test(description);
    const mappedCategory = internalTransfer
      ? categories.find((item) => item.name === "Transfers")
      : debtLabel
      ? categories.find((item) => item.name === "Debt repayments" && item.flow === "expense")
      : mappedName
      ? categories.find((item) => item.name === mappedName && item.flow === flow)
      : undefined;
    if (flow === "expense" && debtLabel) {
      const debtName = description.split("—")[0].trim();
      const existingDebt = await prisma.debt.findFirst({
        where: { householdId, name: { equals: debtName, mode: "insensitive" } },
      });
      if (!existingDebt) {
        await prisma.debt.create({
          data: {
            householdId,
            name: debtName,
            minimumPence: Math.abs(amountPence),
          },
        });
      } else if (existingDebt.minimumPence === 0) {
        await prisma.debt.update({
          where: { id: existingDebt.id },
          data: { minimumPence: Math.abs(amountPence) },
        });
      }
    }
    await prisma.transaction.create({
      data: {
        householdId,
        accountId: account.id,
        categoryId: rule?.categoryId || mappedCategory?.id || null,
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
