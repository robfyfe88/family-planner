// src/lib/household.ts
import { prisma } from "@/lib/prisma";

// If you’re only using NextAuth now, keep this import.
// If you still have Clerk in the tree, this file won’t require it.
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";

/** Minimal identity pulled from NextAuth session */
async function getIdentity(): Promise<{ email: string | null; memberId: string | null; householdId: string | null }> {
  const session = await getServerSession(authOptions);

  if (!session) throw new Error("Not authenticated");

  const email =
    (session.user?.email?.trim().toLowerCase() as string | undefined) ?? null;

  const memberId = (session as any).memberId ?? null;
  const householdId = (session as any).householdId ?? null;

  return { email, memberId, householdId };
}

/**
 * Resolve the current user's household ID.
 * - Uses householdId/memberId already placed on the session by auth callbacks.
 * - If missing, falls back to a read-only lookup by inviteEmail.
 * - DOES NOT CREATE anything. If nothing is found, throws.
 */
export async function getOrCreateHouseholdForUser(): Promise<string> {
  const { email, memberId, householdId } = await getIdentity();

  // 1) If auth callbacks put householdId on the session, trust it.
  if (householdId) return householdId;

  // 2) If we have a memberId, read its household.
  if (memberId) {
    const m = await prisma.member.findUnique({
      where: { id: memberId },
      select: { householdId: true },
    });
    if (m?.householdId) return m.householdId;
  }

  // 3) Fallback by email -> inviteEmail (works for caregivers & parents that were invited)
  if (email) {
    const invited = await prisma.member.findFirst({
      where: { inviteEmail: email },
      select: { householdId: true },
    });
    if (invited?.householdId) return invited.householdId;
  }

  // 4) Nothing matched — do NOT create. Force a data fix instead.
  throw new Error(
    "No household linked to this account. Ask a parent to add your email under Members."
  );
}

// Backward-compatible export name used elsewhere
export async function getHouseholdIdOrThrow(): Promise<string> {
  return getOrCreateHouseholdForUser();
}
