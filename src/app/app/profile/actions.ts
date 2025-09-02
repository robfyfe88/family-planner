"use server";

import { prisma } from "@/lib/prisma";
import { getHouseholdIdOrThrow } from "@/lib/household";

export type MemberLite = {
  id: string;
  name: string;
  role: "parent" | "caregiver" | "child";
  inviteEmail?: string | null;
};

type Plan = "free" | "pro" | "family" | "trial";

function tierCaps(tier: Plan) {
  if (tier === "family") return { parents: Infinity, caregivers: Infinity };
  if (tier === "pro" || tier === "trial") return { parents: 2, caregivers: 1 };
  return { parents: 1, caregivers: 0 };
}

export async function fetchProfileData() {
  const householdId = await getHouseholdIdOrThrow();
  const hh = await prisma.household.findUnique({
    where: { id: householdId },
    select: { name: true, subscriptionTier: true },
  });

  const members = await prisma.member.findMany({
    where: { householdId },
    select: { id: true, name: true, role: true, inviteEmail: true },
    orderBy: { name: "asc" },
  });

  return {
    householdName: hh?.name ?? "Household",
    members,
    planTier: (hh?.subscriptionTier ?? "free") as Plan,
  };
}

export async function updateHouseholdName(name: string): Promise<{ id: string; name: string }> {
  const householdId = await getHouseholdIdOrThrow();
  const next = await prisma.household.update({
    where: { id: householdId },
    data: { name: name.trim() || "Household" },
    select: { id: true, name: true },
  });
  return next;
}

export async function addMember(input: {
  name: string;
  role: "parent" | "caregiver" | "child";
  inviteEmail?: string;
}) {
  const householdId = await getHouseholdIdOrThrow();

  const hh = await prisma.household.findUnique({
    where: { id: householdId },
    select: { subscriptionTier: true },
  });
  const tier = (hh?.subscriptionTier ?? "free") as Plan;
  const caps = tierCaps(tier);

  const [parentCount, caregiverCount] = await Promise.all([
    prisma.member.count({ where: { householdId, role: "parent" } }),
    prisma.member.count({ where: { householdId, role: "caregiver" } }),
  ]);

  if (input.role === "parent" && parentCount >= caps.parents) {
    throw new Error(
      tier === "free"
        ? "Free plan cannot add more parents. Upgrade to Pro."
        : "Parent limit reached for your plan."
    );
  }
  if (input.role === "caregiver" && caregiverCount >= caps.caregivers) {
    throw new Error(
      tier === "free"
        ? "Free plan cannot add caregivers. Upgrade to Pro."
        : "Caregiver limit reached for your plan."
    );
  }

  const emailAllowed = input.role === "parent" || input.role === "caregiver";
  const inviteEmail = emailAllowed ? (input.inviteEmail?.trim() || null) : null;

  const created = await prisma.member.create({
    data: {
      householdId,
      name: input.name.trim(),
      role: input.role,
      inviteEmail,
    },
    select: { id: true, name: true, role: true, inviteEmail: true },
  });

  return created;
}

export async function removeMember(id: string): Promise<{ ok: true }> {
  const householdId = await getHouseholdIdOrThrow();
  const target = await prisma.member.findUnique({ where: { id }, select: { householdId: true } });
  if (!target || target.householdId !== householdId) {
    return { ok: true };
  }
  await prisma.member.delete({ where: { id } });
  return { ok: true };
}

export async function updateMember(id: string, patch: Partial<MemberLite>) {
  const member = await prisma.member.findUnique({
    where: { id },
    select: { id: true, householdId: true, role: true },
  });
  if (!member) throw new Error("Member not found");

  const hh = await prisma.household.findUnique({
    where: { id: member.householdId },
    select: { subscriptionTier: true },
  });
  const tier = (hh?.subscriptionTier ?? "free") as Plan;
  const caps = tierCaps(tier);

  if (patch.role && patch.role !== member.role) {
    const [parentCount, caregiverCount] = await Promise.all([
      prisma.member.count({ where: { householdId: member.householdId, role: "parent" } }),
      prisma.member.count({ where: { householdId: member.householdId, role: "caregiver" } }),
    ]);

    if (patch.role === "parent" && parentCount >= caps.parents) {
      throw new Error("Parent limit reached for your plan.");
    }
    if (patch.role === "caregiver" && caregiverCount >= caps.caregivers) {
      throw new Error("Caregiver limit reached for your plan.");
    }
  }

  const nextRole = (patch.role ?? member.role) as MemberLite["role"];

  const data: any = {};
  if (typeof patch.name === "string") data.name = patch.name.trim();
  if (patch.role) data.role = patch.role;

  if (nextRole === "child") {
    data.inviteEmail = null;
  } else if (patch.inviteEmail !== undefined) {
    data.inviteEmail = patch.inviteEmail ? patch.inviteEmail.trim() : null;
  }

  const updated = await prisma.member.update({
    where: { id: member.id },
    data,
    select: { id: true, name: true, role: true, inviteEmail: true },
  });
  return updated;
}
