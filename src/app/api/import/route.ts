// src/app/api/import/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// ---- Schemas ----
const BudgetSchema = z.object({
  mode: z.string().optional(),
  parentAName: z.string().optional(),
  parentBName: z.string().optional(),
  incomes: z.array(z.object({
    id: z.string(),
    label: z.string(),
    amount: z.number(), // monthly amount in £ from local
    owner: z.string().optional(),
  })).default([]),
  expenses: z.array(z.object({
    id: z.string(),
    label: z.string(),
    amount: z.number(), // monthly amount in £ from local
    owner: z.string().optional(),
  })).default([]),
  pots: z.array(z.object({
    id: z.string(),
    name: z.string(),
  })).default([]),
  savingsYear: z.array(z.object({
    month: z.string(),
    values: z.record(z.string(), z.number()), // { potId: amount£ }
  })).optional(),
}).optional();

const LegacySchema = z.object({
  householdName: z.string().default("My Household"),
  members: z.array(z.object({
    name: z.string(),
    role: z.enum(["parent","child"]),
    shortLabel: z.string().optional(),
    color: z.string().optional(),
    slot: z.string().optional(),
  })).default([]),
  activities: z.array(z.object({
    name: z.string(),
    category: z.string().optional(),
    location: z.string().optional(),
    schedules: z.array(z.object({
      weekday: z.number().int().min(0).max(6).optional(),
      startTime: z.string().optional(),
      endTime: z.string().optional(),
      rrule: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    })).default([]),
  })).default([]),
  overrides: z.array(z.object({
    date: z.string(),
    memberName: z.string().optional(),
    activityName: z.string().optional(),
    status: z.enum(["added","skipped","moved"]).default("moved"),
    newStartTime: z.string().optional(),
    newEndTime: z.string().optional(),
    notes: z.string().optional(),
  })).default([]),
  schoolDays: z.array(z.object({
    date: z.string(),
    isSchoolOpen: z.boolean(),
    label: z.string().optional(),
  })).default([]),
  leaves: z.array(z.object({
    memberName: z.string().optional(),
    startDate: z.string(),
    endDate: z.string(),
    type: z.string().optional(),
    notes: z.string().optional(),
  })).default([]),

  // NEW: budget
  budget: BudgetSchema,
});

export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  try {
    const raw = await req.text();
    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = LegacySchema.safeParse(parsedBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const data = parsed.data;

    // ---- Household (create or reuse by name) ----
    const existing = await prisma.household.findFirst({ where: { name: data.householdName }, select: { id: true } });
    const hh = existing
      ? await prisma.household.update({ where: { id: existing.id }, data: {} })
      : await prisma.household.create({ data: { name: data.householdName } });

    // ---- Members ----
    const memberMap = new Map<string, string>();
    for (const m of data.members) {
      const created = await prisma.member.create({
        data: {
          householdId: hh.id,
          name: m.name,
          role: m.role, // "parent" | "child"
          shortLabel: m.shortLabel ?? null,
          color: m.color ?? null,
          slot: m.slot ?? null,
        },
      });
      memberMap.set(m.name, created.id);
    }

    // ---- Activities + Schedules ----
    const activityMap = new Map<string, string>();
    for (const a of data.activities) {
      const act = await prisma.activity.create({
        data: {
          householdId: hh.id,
          name: a.name,
          category: a.category ?? null,
          location: a.location ?? null,
        },
      });
      activityMap.set(a.name, act.id);

      if (a.schedules?.length) {
        await prisma.schedule.createMany({
          data: a.schedules.map((s) => ({
            householdId: hh.id,
            activityId: act.id,
            weekday: s.weekday ?? null,
            startTime: s.startTime ?? null,
            endTime: s.endTime ?? null,
            rrule: s.rrule ?? null,
            startDate: s.startDate ? new Date(s.startDate) : null,
            endDate: s.endDate ? new Date(s.endDate) : null,
          })),
        });
      }
    }

    // ---- Overrides ----
    if (data.overrides?.length) {
      await prisma.override.createMany({
        data: data.overrides.map((o) => ({
          householdId: hh.id,
          date: new Date(o.date),
          memberId: o.memberName ? memberMap.get(o.memberName) ?? null : null,
          activityId: o.activityName ? activityMap.get(o.activityName) ?? null : null,
          status: o.status,
          newStartTime: o.newStartTime ?? null,
          newEndTime: o.newEndTime ?? null,
          notes: o.notes ?? null,
        })),
      });
    }

    // ---- School days (closures) ----
    for (const sd of data.schoolDays) {
      try {
        await prisma.schoolDay.upsert({
          where: {
            householdId_date: { householdId: hh.id, date: new Date(sd.date) },
          },
          create: {
            householdId: hh.id,
            date: new Date(sd.date),
            isSchoolOpen: sd.isSchoolOpen,
            label: sd.label ?? null,
          },
          update: {
            isSchoolOpen: sd.isSchoolOpen,
            label: sd.label ?? null,
          },
        });
      } catch (e) {
        // Continue rather than failing entire import
        console.error("SchoolDay upsert failed for", sd.date, e);
      }
    }

    // ---- Leaves ----
    if (data.leaves?.length) {
      await prisma.leave.createMany({
        data: data.leaves.map((l) => ({
          householdId: hh.id,
          memberId: l.memberName ? memberMap.get(l.memberName) ?? null : null,
          startDate: new Date(l.startDate),
          endDate: new Date(l.endDate),
          type: l.type ?? null,
          notes: l.notes ?? null,
        })),
      });
    }

    // ---- Budget (NEW) ----
    if (data.budget) {
      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();

      // Create categories for each income/expense label
      // (idempotent per (householdId, name))
      const ensureCategory = async (name: string, flow: "income" | "expense") => {
        const existing = await prisma.budgetCategory.findFirst({
          where: { householdId: hh.id, name },
        });
        if (existing) return existing;

        return prisma.budgetCategory.create({
          data: {
            householdId: hh.id,
            name,
            group: flow === "income" ? "Income" : "Expenses",
            isSpending: flow === "expense",
            flow,
          },
        });
      };

      // Planned budgets (monthly) from local amounts (£ -> pence)
      for (const inc of data.budget.incomes ?? []) {
        const cat = await ensureCategory(inc.label, "income");
        await prisma.budgetMonthly.upsert({
          where: {
            householdId_categoryId_month_year: {
              householdId: hh.id,
              categoryId: cat.id,
              month,
              year,
            },
          },
          create: {
            householdId: hh.id,
            categoryId: cat.id,
            month,
            year,
            plannedPence: Math.round((inc.amount ?? 0) * 100),
          },
          update: {
            plannedPence: Math.round((inc.amount ?? 0) * 100),
          },
        });
      }

      for (const exp of data.budget.expenses ?? []) {
        const cat = await ensureCategory(exp.label, "expense");
        await prisma.budgetMonthly.upsert({
          where: {
            householdId_categoryId_month_year: {
              householdId: hh.id,
              categoryId: cat.id,
              month,
              year,
            },
          },
          create: {
            householdId: hh.id,
            categoryId: cat.id,
            month,
            year,
            plannedPence: Math.round((exp.amount ?? 0) * 100),
          },
          update: {
            plannedPence: Math.round((exp.amount ?? 0) * 100),
          },
        });
      }

      // Pots
      for (const p of data.budget.pots ?? []) {
        await prisma.savingsPot.upsert({
          where: { householdId_name: { householdId: hh.id, name: p.name } },
          create: { householdId: hh.id, name: p.name, balancePence: 0 },
          update: {},
        });
      }

      // (Optional) If you want to apply savingsYear -> PotTransfer balances, you can:
      // const potByName = new Map(
      //   (await prisma.savingsPot.findMany({ where: { householdId: hh.id } }))
      //     .map(p => [p.name, p] as const)
      // );
      // // You can add logic here to seed historical transfers if desired.
    }

    return NextResponse.json({ ok: true, householdId: hh.id });
  } catch (e: any) {
    console.error("Import failed:", e);
    return NextResponse.json(
      { error: "Internal Server Error", message: e?.message ?? "unknown", code: e?.code, meta: e?.meta },
      { status: 500 }
    );
  }
}
