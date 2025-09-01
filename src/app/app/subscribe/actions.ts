"use server";

import { prisma } from "@/lib/prisma";
import { getOrCreateHouseholdForUser as getHouseholdIdOrThrow } from "@/lib/household";

export type PlanTier = "free" | "pro" | "family" | "trial";
export type SubStatus = "active" | "trialing" | "past_due" | "canceled";

function capsForTier(tier: PlanTier) {
  if (tier === "family") return { parents: Infinity, caregivers: Infinity };
  if (tier === "pro" || tier === "trial") return { parents: 2, caregivers: 1 };
  // FREE: allow 1 parent, 0 caregivers
  return { parents: 1, caregivers: 0 };
}

export async function fetchSubscription() {
  const householdId = await getHouseholdIdOrThrow();

  const hh = await prisma.household.findUnique({
    where: { id: householdId },
    select: {
      subscriptionTier: true,
      subscriptionStatus: true,
      currentPeriodEnd: true,
      name: true,
    },
  });

  const [parentCount, caregiverCount] = await Promise.all([
    prisma.member.count({ where: { householdId, role: "parent" } }),
    prisma.member.count({ where: { householdId, role: "caregiver" } }),
  ]);

  const tier = (hh?.subscriptionTier ?? "free") as PlanTier;
  const status = (hh?.subscriptionStatus ?? "active") as SubStatus;

  return {
    householdName: hh?.name ?? "Household",
    tier,
    status,
    currentPeriodEndISO: hh?.currentPeriodEnd?.toISOString() ?? null,
    parentCount,
    caregiverCount,
    caps: capsForTier(tier),
  };
}

export async function setSubscriptionTier(next: PlanTier) {
  const householdId = await getHouseholdIdOrThrow();

  const [hh, parentCount, caregiverCount] = await Promise.all([
    prisma.household.findUnique({
      where: { id: householdId },
      select: { subscriptionTier: true, subscriptionStatus: true },
    }),
    prisma.member.count({ where: { householdId, role: "parent" } }),
    prisma.member.count({ where: { householdId, role: "caregiver" } }),
  ]);

  if (!hh) throw new Error("Household not found");

  const caps = capsForTier(next);

  if (parentCount > caps.parents || caregiverCount > caps.caregivers) {
    if (next === "free") {
      const parts: string[] = [];
      if (parentCount > caps.parents) {
        parts.push(`Free supports 1 parent (you have ${parentCount}). Remove ${parentCount - 1}.`);
      }
      if (caregiverCount > caps.caregivers) {
        parts.push(`Free supports 0 caregivers (you have ${caregiverCount}). Remove all caregivers.`);
      }
      throw new Error(parts.join(" "));
    }
    throw new Error("Current members exceed limits for the selected plan.");
  }

  const isTrial = next === "trial";
  const now = new Date();
  const trialEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const updated = await prisma.household.update({
    where: { id: householdId },
    data: {
      subscriptionTier: next,
      subscriptionStatus: isTrial ? "trialing" : "active",
      currentPeriodEnd: isTrial ? trialEnd : null,
    },
    select: { subscriptionTier: true, subscriptionStatus: true, currentPeriodEnd: true },
  });

  return {
    tier: updated.subscriptionTier as PlanTier,
    status: updated.subscriptionStatus as SubStatus,
    currentPeriodEndISO: updated.currentPeriodEnd?.toISOString() ?? null,
  };
}

export async function cancelToFree() {
  return setSubscriptionTier("free");
}
