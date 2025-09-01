import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

type UserIdentity = { userId: string; email?: string | null; name?: string | null };

export async function getCurrentUserIdentity(): Promise<{ userId: string; email?: string | null; name?: string | null }> {
  try {
    const { currentUser } = await import("@clerk/nextjs/server");
    const u = await currentUser();
    if (u) {
      const userId = u.id; 
      const email =
        u.primaryEmailAddress?.emailAddress ??
        u.emailAddresses?.[0]?.emailAddress ??
        null;
      const name =
        u.fullName ??
        ([u.firstName, u.lastName].filter(Boolean).join(" ") || null);
      return { userId, email, name };
    }
  } catch {
  }

  try {
    const { getServerSession } = await import("next-auth");
    const session = await getServerSession();
    if (session?.user) {
      const id = (session.user as any).id ?? session.user.email;
      if (!id) throw new Error("No user id in session");
      return {
        userId: String(id),
        email: session.user.email ?? null,
        name: session.user.name ?? null,
      };
    }
  } catch {
  }

  throw new Error("Not authenticated");
}


export async function getOrCreateHouseholdForUser(): Promise<string> {
  const { userId, email, name } = await getCurrentUserIdentity();

  const linked = await prisma.member.findFirst({
    where: { userId },
    select: { householdId: true },
  });
  if (linked) return linked.householdId;

  const normEmail = email?.toLowerCase() ?? null;

  if (normEmail) {
    const invited = await prisma.member.findFirst({
      where: { inviteEmail: normEmail },
      select: { id: true, householdId: true },
    });
    if (invited) {
      await prisma.member.update({
        where: { id: invited.id },
        data: { userId, inviteEmail: null, name: name ?? normEmail },
      });
      return invited.householdId;
    }
  }

  const display = (name ?? normEmail ?? "You").trim();

  try {
    const householdId = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const hh = await tx.household.create({
        data: { name: `${display}'s Household` },
        select: { id: true },
      });

      await tx.member.create({
        data: {
          householdId: hh.id,
          name: display,
          role: "parent", 
          userId,
        },
      });

      return hh.id;
    });
    return householdId;
  } catch (e) {
    const fallback = await prisma.member.findFirst({
      where: { userId },
      select: { householdId: true },
    });
    if (fallback) return fallback.householdId;
    throw e;
  }
}

export async function getHouseholdIdOrThrow(): Promise<string> {
  return getOrCreateHouseholdForUser();
}
