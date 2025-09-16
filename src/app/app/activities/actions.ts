"use server";

import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { countByMonth } from "@/lib/recurrence";
import type { Weekday, RecurrenceKind } from "@/lib/recurrence";
import { Decimal } from "@prisma/client/runtime/library";

/** Session shape your callbacks set in authOptions.session() */
type SessionLike = {
  user?: { email?: string | null } | null;
  householdId?: string | null;
  memberId?: string | null;
  role?: "parent" | "caregiver" | "child" | null;
};

/** Small helper to assert required values */
function assert<T>(v: T | null | undefined, msg = "Not found"): asserts v is T {
  if (v === null || v === undefined) throw new Error(msg);
}

async function getSessionContext() {
  const session = (await getServerSession(authOptions)) as SessionLike | null;
  assert(session, "Unauthenticated");
  assert(session.householdId, "No household");
  assert(session.memberId, "No member in session");
  return {
    householdId: session.householdId!,
    memberId: session.memberId!,
    role: (session.role ?? "parent") as "parent" | "caregiver" | "child",
  };
}

/** Member list for assigning activities (parents, children, caregivers) */
export async function listMembersForHousehold() {
  const { householdId } = await getSessionContext();

  const members = await prisma.member.findMany({
    where: { householdId },
    select: { id: true, role: true, name: true, shortLabel: true, color: true },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  return members;
}

/** Activity DTO returned to the client (matches your UI needs) */
export type ActivityDTO = {
  id: string;
  type: string;
  name: string;
  notes?: string;
  startDate: string; // "YYYY-MM-DD"
  endDate: string;   // "YYYY-MM-DD" (empty string if null)
  recurrence: {
    kind: RecurrenceKind;
    daysOfWeek: Weekday[];
    intervalWeeks?: number;
  };
  costPerSession: number;
  memberIds: string[];
};

/** Fetch planner activities for the signed-in household */
export async function listPlannerActivities(): Promise<ActivityDTO[]> {
  const { householdId } = await getSessionContext();

  const rows = await prisma.plannerActivity.findMany({
    where: { householdId },
    include: { members: { select: { memberId: true } } },
    orderBy: [{ startDate: "asc" }, { createdAt: "desc" }],
  });

  return rows.map((a): ActivityDTO => ({
  id: a.id,
  type: a.type,
  name: a.name,
  notes: a.notes ?? undefined,
  startDate: a.startDate.toISOString().slice(0,10),
  endDate: a.endDate ? a.endDate.toISOString().slice(0,10) : "",
  recurrence: {
    kind: a.recurrenceKind as RecurrenceKind,
    daysOfWeek: (a.daysOfWeek as number[]).map(n => n as Weekday),
    intervalWeeks: a.intervalWeeks ?? undefined,
  },
  costPerSession: Number(a.costPerSession),   // legacy
  memberIds: a.members.map(m => m.memberId),
  }));
}

/** Payload for create/update */
export type UpsertPlannerActivityInput = {
  id?: string;
  type: string;
  name: string;
  notes?: string;
  startDate: string;          // YYYY-MM-DD
  endDate?: string | null;    // optional; NULL means open-ended
  recurrence: {
    kind: RecurrenceKind;
    daysOfWeek: Weekday[];
    intervalWeeks?: number;
  };
  // NEW (persist these)
  feeModel?: "per_session" | "monthly" | "one_off" | "total_range";
  amount?: number | null;
  allocation?: "evenly" | "upfront" | null;

  // legacy back-compat (kept)
  costPerSession: number;

  memberIds: string[];
  budgetCategory?: string;
  budgetLabel?: string;
};
/**
 * Create/update a planner activity and re-sync its monthly budget links.
 * Parents and caregivers in the same household are allowed (tighten if desired).
 */
export async function upsertPlannerActivity(input: UpsertPlannerActivityInput) {
  const { householdId, memberId } = await getSessionContext();

  const name = (input.name || "").trim();
  if (!name) throw new Error("Name is required");
  if (!input.memberIds?.length) throw new Error("Assign at least one member");

  const start = new Date(`${input.startDate}T00:00:00.000Z`);
  if (isNaN(start.getTime())) throw new Error("Invalid start date");

  // ⬇️ IMPORTANT: blank => NULL (true open-ended)
  const endISO = input.endDate && input.endDate.trim() ? input.endDate : null;
  const end = endISO ? new Date(`${endISO}T00:00:00.000Z`) : null;
  if (endISO && isNaN(end!.getTime())) throw new Error("Invalid end date");

  // cost fields
  const feeModel = (input.feeModel ?? "per_session") as
    | "per_session" | "monthly" | "one_off" | "total_range";
  const amountNum = Number(input.amount ?? input.costPerSession ?? 0);
  const allocation = (input.allocation ?? null) as "evenly" | "upfront" | null;

  const baseData = {
    householdId,
    createdById: memberId,
    type: input.type,
    name,
    notes: input.notes?.trim() || null,
    startDate: start,
    endDate: end,                     // store NULL if open-ended
    recurrenceKind: input.recurrence.kind,
    daysOfWeek: input.recurrence.daysOfWeek.map(Number),
    intervalWeeks: input.recurrence.intervalWeeks ?? null,
    // persist new fee fields
    feeModel,
    amount: amountNum,
    allocation,
    // legacy field stays in sync for back-compat
    costPerSession: new Decimal(feeModel === "per_session" ? amountNum : 0),
  };

  const activity = await prisma.$transaction(async (tx) => {
    const act = input.id
      ? await tx.plannerActivity.update({
          where: { id: input.id, householdId },
          data: {
            ...baseData,
            members: {
              deleteMany: {},
              createMany: {
                data: input.memberIds.map((mid) => ({ memberId: mid })),
                skipDuplicates: true,
              },
            },
          },
        })
      : await tx.plannerActivity.create({
          data: {
            ...baseData,
            members: {
              createMany: {
                data: input.memberIds.map((mid) => ({ memberId: mid })),
                skipDuplicates: true,
              },
            },
          },
        });
    return act;
  });

  // === Budget links (optional precomputation) ===
  // For one-offs: 1 occurrence in the start month
  // For recurring with an explicit end: expand by month
  // For open-ended recurring (end == NULL): skip precreating links; runtime merge handles it.
  let counts = new Map<string, number>();

  if (input.recurrence.kind === "none") {
    const y = start.getUTCFullYear();
    const m = start.getUTCMonth() + 1;
    counts.set(`${y}-${m}`, 1);
  } else if (endISO) {
    counts = countByMonth(
      input.startDate,
      endISO,
      input.recurrence.kind,
      input.recurrence.daysOfWeek,
      input.recurrence.intervalWeeks
    );
  }

  const category = input.budgetCategory || "Kids Clubs";
  const label = (input.budgetLabel || name).trim();

  await prisma.$transaction(async (tx) => {
    await tx.plannerBudgetLink.deleteMany({ where: { activityId: activity.id } });
    if (counts.size) {
      const rows = Array.from(counts.entries()).map(([ym, n]) => {
        const [yy, mm] = ym.split("-").map(Number);
        return {
          activityId: activity.id,
          householdId,
          year: yy,
          month: mm,
          amount: new Decimal(amountNum).mul(n),
          category,
          label,
        };
      });
      await tx.plannerBudgetLink.createMany({ data: rows, skipDuplicates: true });
    }
  });

  return { id: activity.id };
}

/** Delete an activity (cascade removes members + budget links via FK) */
export async function deletePlannerActivity(activityId: string) {
  const { householdId } = await getSessionContext();

  // Ensure the activity belongs to the caller's household
  const exists = await prisma.plannerActivity.findFirst({
    where: { id: activityId, householdId },
    select: { id: true },
  });
  assert(exists, "Not found");

  await prisma.plannerActivity.delete({ where: { id: activityId } });
  return { ok: true };
}
