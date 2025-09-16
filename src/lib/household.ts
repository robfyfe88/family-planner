import { prisma } from "@/lib/prisma";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";

async function getIdentity(): Promise<{ email: string | null; memberId: string | null; householdId: string | null }> {
  const session = await getServerSession(authOptions);

  if (!session) throw new Error("Not authenticated");

  const email =
    (session.user?.email?.trim().toLowerCase() as string | undefined) ?? null;

  const memberId = (session as any).memberId ?? null;
  const householdId = (session as any).householdId ?? null;

  return { email, memberId, householdId };
}


export async function getOrCreateHouseholdForUser(): Promise<string> {
  const { email, memberId, householdId } = await getIdentity();

  if (householdId) return householdId;

  if (memberId) {
    const m = await prisma.member.findUnique({
      where: { id: memberId },
      select: { householdId: true },
    });
    if (m?.householdId) return m.householdId;
  }

  if (email) {
    const invited = await prisma.member.findFirst({
      where: { inviteEmail: email },
      select: { householdId: true },
    });
    if (invited?.householdId) return invited.householdId;
  }

  throw new Error(
    "No household linked to this account. Ask a parent to add your email under Members."
  );
}

export async function getHouseholdIdOrThrow(): Promise<string> {
  return getOrCreateHouseholdForUser();
}
