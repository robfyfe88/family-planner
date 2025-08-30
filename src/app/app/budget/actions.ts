"use server";

import { prisma } from "@/lib/prisma";

export type Owner = "joint" | "A" | "B";
export type Row = { id?: string; label: string; amount: number; owner?: Owner };
export type Kind = "income" | "expense";


function nowMonthYear() {
  const d = new Date();
  return { month: d.getMonth() + 1, year: d.getFullYear() };
}
async function getHousehold() {
  const hh = await prisma.household.findFirst({ select: { id: true } });
  if (!hh) throw new Error("No household found");
  return hh;
}

function normalizeLabel(s: string) {
  return s.trim().replace(/\s+/g, " ");
}

export async function fetchBudgetRows(): Promise<{ incomes: Row[]; expenses: Row[] }> {
  const hh = await getHousehold();
  const { month, year } = nowMonthYear();

  const plans = await prisma.budgetMonthly.findMany({
    where: { householdId: hh.id, month, year },
    include: { category: true },
    orderBy: { categoryId: "asc" },
  });

  const toRow = (p: typeof plans[number]): Row => ({
    id: p.category.id,
    label: p.category.name,
    amount: (p.plannedPence ?? 0) / 100,
    owner: "joint", 
  });

  return {
    incomes: plans.filter((p: { category: { flow: string; }; }) => p.category.flow === "income").map(toRow),
    expenses: plans.filter((p: { category: { flow: string; }; }) => p.category.flow === "expense").map(toRow),
  };
}

export async function upsertBudgetRow(
  flow: Kind,
  row: { id?: string; label: string; amount: number }
) {
  const hh = await getHousehold();
  const { month, year } = nowMonthYear();

  const labelNorm = normalizeLabel(row.label || "");
  if (labelNorm.length === 0) {
    return { id: row.id ?? "", label: labelNorm, amount: row.amount ?? 0 };
  }

  const plannedPence = Math.round((row.amount || 0) * 100);

  return prisma.$transaction(async (tx: { budgetCategory: { findUnique: (arg0: { where: { id: string; } | { householdId_name: { householdId: any; name: string; }; } | { householdId_name: { householdId: any; name: string; }; }; }) => any; delete: (arg0: { where: { id: any; }; }) => any; update: (arg0: { where: { id: any; }; data: { name: string; flow: Kind; }; }) => any; create: (arg0: { data: { householdId: any; name: string; flow: Kind; isSpending: boolean; }; }) => any; findUniqueOrThrow: (arg0: { where: { householdId_name: { householdId: any; name: string; }; }; }) => any; }; budgetMonthly: { upsert: (arg0: { where: { householdId_categoryId_month_year: { householdId: any; categoryId: any; month: number; year: number; }; } | { householdId_categoryId_month_year: { householdId: any; categoryId: any; month: number; year: number; }; }; update: { plannedPence: number; } | { plannedPence: number; }; create: { householdId: any; categoryId: any; month: number; year: number; plannedPence: number; } | { householdId: any; categoryId: any; month: number; year: number; plannedPence: number; }; }) => any; count: (arg0: { where: { categoryId: any; }; }) => any; }; transaction: { count: (arg0: { where: { categoryId: any; }; }) => any; }; }) => {
    let category =
      row.id
        ? await tx.budgetCategory.findUnique({ where: { id: row.id } })
        : null;

    if (!category) {
      category = await tx.budgetCategory.findUnique({
        where: { householdId_name: { householdId: hh.id, name: labelNorm } },
      });
    }

    if (category) {
      if (category.name !== labelNorm || category.flow !== flow) {
        const existingWithTarget = await tx.budgetCategory.findUnique({
          where: { householdId_name: { householdId: hh.id, name: labelNorm } },
        });

        if (existingWithTarget && existingWithTarget.id !== category.id) {
          await tx.budgetMonthly.upsert({
            where: {
              householdId_categoryId_month_year: {
                householdId: hh.id,
                categoryId: existingWithTarget.id,
                month,
                year,
              },
            },
            update: { plannedPence },
            create: {
              householdId: hh.id,
              categoryId: existingWithTarget.id,
              month,
              year,
              plannedPence,
            },
          });

          const stillHasPlans = await tx.budgetMonthly.count({
            where: { categoryId: category.id },
          });
          const stillHasTx = await tx.transaction.count({
            where: { categoryId: category.id },
          });
          if (!stillHasPlans && !stillHasTx) {
            await tx.budgetCategory.delete({ where: { id: category.id } });
          }

          category = existingWithTarget;
        } else {

          category = await tx.budgetCategory.update({
            where: { id: category.id },
            data: { name: labelNorm, flow },
          });
        }
      }
    } else {
      try {
        category = await tx.budgetCategory.create({
          data: {
            householdId: hh.id,
            name: labelNorm,
            flow,
            isSpending: flow === "expense",
          },
        });
      } catch (e: any) {
        category = await tx.budgetCategory.findUniqueOrThrow({
          where: { householdId_name: { householdId: hh.id, name: labelNorm } },
        });
      }
    }

    await tx.budgetMonthly.upsert({
      where: {
        householdId_categoryId_month_year: {
          householdId: hh.id,
          categoryId: category.id,
          month,
          year,
        },
      },
      update: { plannedPence },
      create: {
        householdId: hh.id,
        categoryId: category.id,
        month,
        year,
        plannedPence,
      },
    });

    return { id: category.id, label: category.name, amount: plannedPence / 100 };
  });
}

export async function deleteBudgetRow(categoryId: string): Promise<{ ok: true }> {
  const hh = await getHousehold();
  const { month, year } = nowMonthYear();

  await prisma.budgetMonthly.deleteMany({
    where: { householdId: hh.id, categoryId, month, year },
  });

  const stillHasPlans = await prisma.budgetMonthly.count({ where: { categoryId } });
  const stillHasTx = await prisma.transaction.count({ where: { categoryId } });

  if (!stillHasPlans && !stillHasTx) {
    const cat = await prisma.budgetCategory.findFirst({
      where: { id: categoryId, householdId: hh.id },
      select: { id: true },
    });
    if (cat) {
      await prisma.budgetCategory.delete({ where: { id: categoryId } });
    }
  }

  return { ok: true };
}
