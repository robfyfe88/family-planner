export type PlanTier = "free" | "pro" | "family" | "trial";
export type MemberRoleAny = "parent" | "caregiver" | "child";

export const PLAN_LABEL: Record<PlanTier, string> = {
  free: "Free",
  pro: "Pro",
  family: "Family",
  trial: "Trial",
};

export function capsForTier(tier: PlanTier) {
  if (tier === "family") return { parents: Infinity, caregivers: Infinity };
  if (tier === "pro" || tier === "trial") return { parents: 2, caregivers: 1 };
  return { parents: 1, caregivers: 0 };
}

export function showInviteEmail(role: MemberRoleAny) {
  return role === "parent" || role === "caregiver";
}

export function emailRequired(role: MemberRoleAny) {
  return role === "caregiver";
}

export function validateEmail(e: string) {
  if (!e) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}
