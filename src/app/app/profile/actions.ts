"use server";

import { prisma } from "@/lib/prisma";
import { getHouseholdIdOrThrow } from "@/lib/household";

export type MemberLite = {
  id: string;
  name: string;
  role: "parent" | "child";
};

export async function fetchProfileData(): Promise<{
  householdId: string;
  householdName: string;
  members: MemberLite[];
}> {
  const householdId = await getHouseholdIdOrThrow();
  const hh = await prisma.household.findUnique({
    where: { id: householdId },
    select: { id: true, name: true },
  });
  const members = await prisma.member.findMany({
    where: { householdId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, role: true },
  });
  return {
    householdId,
    householdName: hh?.name ?? "Household",
    members: members as MemberLite[],
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
  role: "parent" | "child";
}): Promise<MemberLite> {
  const householdId = await getHouseholdIdOrThrow();
  const created = await prisma.member.create({
    data: {
      householdId,
      name: input.name.trim(),
      role: input.role,
    },
    select: { id: true, name: true, role: true },
  });
  return created as MemberLite;
}

export async function removeMember(id: string): Promise<{ ok: true }> {
  const householdId = await getHouseholdIdOrThrow();
  // Ensure member belongs to this household
  const target = await prisma.member.findUnique({ where: { id }, select: { householdId: true } });
  if (!target || target.householdId !== householdId) {
    // Silently ignore if not in household
    return { ok: true };
  }
  await prisma.member.delete({ where: { id } });
  return { ok: true };
}

export async function updateMember(
  id: string,
  patch: Partial<MemberLite>
): Promise<MemberLite> {
  const householdId = await getHouseholdIdOrThrow();
  // Ensure member belongs to this household
  const target = await prisma.member.findUnique({ where: { id }, select: { householdId: true } });
  if (!target || target.householdId !== householdId) {
    throw new Error("Not found");
  }
  const updated = await prisma.member.update({
    where: { id },
    data: {
      name: typeof patch.name === "string" ? patch.name.trim() : undefined,
      role:
        patch.role === "parent" || patch.role === "child" ? patch.role : undefined,
    },
    select: { id: true, name: true, role: true },
  });
  return updated as MemberLite;
}
