"use server";

import { prisma } from "@/lib/prisma";
import { getHouseholdIdOrThrow } from "@/lib/household";

export type MemberLite = {
    id: string;
    name: string;
    role: "parent" | "caregiver" | "child";
    inviteEmail?: string | null;
};


function tierCaps(tier: "free" | "pro" | "family" | "trial") {
    if (tier === "family") return { parents: Infinity, caregivers: Infinity };
    if (tier === "pro" || tier === "trial") return { parents: 2, caregivers: 1 };
    return { parents: 0, caregivers: 0 };
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
        planTier: (hh?.subscriptionTier ?? "free") as "free" | "pro" | "family" | "trial",
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
    const tier = (hh?.subscriptionTier ?? "free") as "free" | "pro" | "family" | "trial";
    const caps = tierCaps(tier);

    const [parentCount, caregiverCount] = await Promise.all([
        prisma.member.count({ where: { householdId, role: "parent" } }),
        prisma.member.count({ where: { householdId, role: "caregiver" } }),
    ]);

    if (input.role === "parent" && parentCount >= caps.parents) {
        throw new Error(
            tier === "free"
                ? "Free plan cannot add parents. Upgrade to Pro."
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

    const created = await prisma.member.create({
        data: {
            householdId,
            name: input.name,
            role: input.role,
            inviteEmail: input.role === "parent" ? input.inviteEmail ?? null : null,
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
    const tier = (hh?.subscriptionTier ?? "free") as "free" | "pro" | "family" | "trial";
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

    const data: any = {};
    if (typeof patch.name === "string") data.name = patch.name.trim();
    if (patch.role) data.role = patch.role;
    if (patch.inviteEmail !== undefined) {
        data.inviteEmail =
            (patch.role ?? member.role) === "parent"
                ? (patch.inviteEmail?.trim() || null)
                : null;
    }

    const updated = await prisma.member.update({
        where: { id: member.id },
        data,
        select: { id: true, name: true, role: true, inviteEmail: true },
    });
    return updated;
}
