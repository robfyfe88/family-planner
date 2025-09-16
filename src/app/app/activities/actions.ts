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
  endDate: string;   // "YYYY-MM-DD"
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
    startDate: a.startDate.toISOString().slice(0, 10),
    endDate: a.endDate.toISOString().slice(0, 10),
    recurrence: {
      kind: a.recurrenceKind as RecurrenceKind,
      daysOfWeek: a.daysOfWeek as Weekday[],
      intervalWeeks: a.intervalWeeks ?? undefined,
    },
    costPerSession: Number(a.costPerSession),
    memberIds: a.members.map((m) => m.memberId),
  }));
}

/** Payload for create/update */
export type UpsertPlannerActivityInput = {
  id?: string;
  type: string;
  name: string;
  notes?: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  recurrence: {
    kind: RecurrenceKind;
    daysOfWeek: Weekday[];
    intervalWeeks?: number;
  };
  costPerSession: number;
  memberIds: string[];

  // Optional: control how budget rows are labeled/categorised
  budgetCategory?: string; // default "Kids Clubs"
  budgetLabel?: string;    // default = name
};

/**
 * Create/update a planner activity and re-sync its monthly budget links.
 * Parents and caregivers in the same household are allowed (tighten if desired).
 */
export async function upsertPlannerActivity(input: UpsertPlannerActivityInput) {
  const { householdId, memberId /*, role*/ } = await getSessionContext();

  // If you want to restrict caregivers:
  // if (role === "caregiver") throw new Error("Caregivers cannot edit activities");

  // Ensure actor belongs to the same household
  const me = await prisma.member.findFirst({ where: { id: memberId, householdId } });
  assert(me, "Forbidden");

  // Basic validation
  const name = (input.name || "").trim();
  if (!name) throw new Error("Name is required");
  if (!input.memberIds?.length) throw new Error("Assign at least one member");

  const start = new Date(input.startDate + "T00:00:00.000Z");
  const end = new Date(input.endDate + "T00:00:00.000Z");
  if (isNaN(start.getTime()) || isNaN(end.getTime())) throw new Error("Invalid dates");

  const cost = new Decimal(input.costPerSession || 0);

  const baseData = {
    householdId,
    createdById: memberId,
    type: input.type,
    name,
    notes: input.notes?.trim() || null,
    startDate: start,
    endDate: end,
    recurrenceKind: input.recurrence.kind,
    daysOfWeek: input.recurrence.daysOfWeek.map((n) => Number(n)),
    intervalWeeks: input.recurrence.intervalWeeks ?? null,
    costPerSession: cost,
  };

  // Upsert activity + membership in a transaction
  const activity = await prisma.$transaction(async (tx) => {
    let act;
    if (input.id) {
      act = await tx.plannerActivity.update({
        where: { id: input.id, householdId },
        data: {
          ...baseData,
          // replace members
          members: {
            deleteMany: {},
            createMany: {
              data: input.memberIds.map((mid) => ({ memberId: mid })),
              skipDuplicates: true,
            },
          },
        },
      });
    } else {
      act = await tx.plannerActivity.create({
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
    }
    return act;
  });

  // === Budget sync ===
  const counts = countByMonth(
    input.startDate,
    input.endDate,
    input.recurrence.kind,
    input.recurrence.daysOfWeek,
    input.recurrence.intervalWeeks
  );

  const category = input.budgetCategory || "Kids Clubs";
  const label = (input.budgetLabel || name).trim();

  // Rebuild all links for the activity idempotently
  await prisma.$transaction(async (tx) => {
    await tx.plannerBudgetLink.deleteMany({ where: { activityId: activity.id } });

    const rows = Array.from(counts.entries()).map(([ym, n]) => {
      const [yy, mm] = ym.split("-").map(Number);
      return {
        activityId: activity.id,
        householdId,
        year: yy,
        month: mm,
        amount: cost.mul(n),
        category,
        label,
      };
    });

    if (rows.length) {
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
