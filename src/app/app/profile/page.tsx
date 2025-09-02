"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useSession, signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Save, Shield, Info as InfoIcon } from "lucide-react";

import {
    fetchProfileData,
    updateHouseholdName,
    addMember,
    removeMember,
    updateMember,
    type MemberLite,
} from "./actions";

import { GoogleIcon } from "@/components/ui/GoogleIcon";
import { capsForTier, MemberRoleAny, PLAN_LABEL, PlanTier, showInviteEmail, validateEmail } from "@/lib/profile-utils";
import MemberCard from "@/components/profile/MemberCard";
import AddMemberCard from "@/components/profile/AddMemberCard";

export default function ProfilePage() {
    const { data: session, status } = useSession();
    if (status === "loading") {
        return (
            <div className="p-6">
                <div className="h-7 w-40 rounded bg-gray-100 animate-pulse" />
            </div>
        );
    }
    if (!session) {
        return (
            <div className="p-6">
                <div className="max-w-md mx-auto text-center p-8 border rounded-2xl bg-[var(--card-bg)]">
                    <p className="text-sm opacity-70 mb-5">
                        Sign in to manage your household and family members.
                    </p>
                    <Button
                        type="button"
                        onClick={() => signIn("google", { callbackUrl: "/app/profile" })}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent-2)] text-white"
                    >
                        <GoogleIcon />
                        <span>Sign in with Google</span>
                    </Button>
                </div>
            </div>
        );
    }
    return <ProfileInner />;
}

function ProfileInner() {
    const router = useRouter();

    const [loading, setLoading] = React.useState(true);

    const [householdName, setHouseholdName] = React.useState("");
    const [savingName, setSavingName] = React.useState(false);

    const [members, setMembers] = React.useState<MemberLite[]>([]);
    const [planTier, setPlanTier] = React.useState<PlanTier>("free");
    const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

    const [nmName, setNmName] = React.useState("");
    const [nmRole, setNmRole] = React.useState<MemberRoleAny>("child");
    const [nmEmail, setNmEmail] = React.useState("");
    const [busyAdd, setBusyAdd] = React.useState(false);

    React.useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const data = await fetchProfileData();
                if (cancelled) return;
                setHouseholdName(data.householdName ?? "Household");
                setMembers(data.members ?? []);
                setPlanTier((data.planTier as PlanTier) ?? "free");
            } catch {
                if (!cancelled) setErrorMsg("Failed to load profile. Please try again.");
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const numParents = members.filter((m) => m.role === "parent").length;
    const numCaregivers = members.filter((m) => m.role === "caregiver").length;

    const caps = capsForTier(planTier);
    const canAddParent = numParents < caps.parents;
    const canAddCaregiver = numCaregivers < caps.caregivers;

    const isFree = planTier === "free";
    const isProish = planTier === "pro" || planTier === "trial";

    const saveHousehold = async () => {
        const name = (householdName || "").trim();
        if (!name) return;
        setSavingName(true);
        setErrorMsg(null);
        try {
            const updated = await updateHouseholdName(name);
            setHouseholdName(updated.name);
        } catch {
            setErrorMsg("Could not save household name.");
        } finally {
            setSavingName(false);
        }
    };

    const updateRow = async (id: string, patch: Partial<MemberLite>) => {
        setErrorMsg(null);
        const prev = members;
        setMembers((m) => m.map((x) => (x.id === id ? { ...x, ...patch } : x)));
        try {
            await updateMember(id, patch);
        } catch (e: any) {
            setMembers(prev);
            setErrorMsg(e?.message ?? "Could not update member.");
        }
    };

    const removeRow = async (id: string) => {
        setErrorMsg(null);
        const prev = members;
        setMembers((m) => m.filter((x) => x.id !== id));
        try {
            await removeMember(id);
        } catch {
            setMembers(prev);
            setErrorMsg("Could not remove member.");
        }
    };

    const canAddDraft =
        nmName.trim().length > 0 &&
        (
            (nmRole === "parent" && canAddParent) ||
            (nmRole === "caregiver" && canAddCaregiver) ||
            nmRole === "child"
        ) &&
        (!showInviteEmail(nmRole) || validateEmail(nmEmail));

    const addRow = async () => {
        if (!canAddDraft) return;
        setBusyAdd(true);
        setErrorMsg(null);
        try {
            const created = await addMember({
                name: nmName.trim(),
                role: nmRole,
                inviteEmail: showInviteEmail(nmRole) ? (nmEmail.trim() || undefined) : undefined,
            });
            setMembers((m) => [...m, created]);
            setNmName("");
            setNmEmail("");
            setNmRole(isFree ? "child" : "parent");
        } catch (e: any) {
            setErrorMsg(e?.message ?? "Could not add member.");
        } finally {
            setBusyAdd(false);
        }
    };

    return (
        <div className="max-w-5xl mx-auto p-3 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-start gap-2">
                    <Button
                        variant="ghost"
                        className="px-2"
                        onClick={() => {
                            if (history.length > 1) router.back();
                            else router.push("/app");
                        }}
                        aria-label="Back"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <h1 className="ml-1 text-lg sm:text-xl font-semibold">Profile & Household</h1>
                </div>
                <PlanBadge tier={planTier} />
            </div>

            {isFree && (
                <div className="rounded-xl border bg-amber-50 text-amber-900 px-3 py-2 flex items-start gap-2">
                    <Shield className="h-4 w-4 mt-0.5" />
                    <div className="text-sm">
                        <div className="font-medium">You’re on the Free plan</div>
                        <div className="opacity-90">
                            You can have <b>1 parent</b> and unlimited children. Inviting another parent or any caregiver requires Pro.
                        </div>
                    </div>
                    <div className="ml-auto">
                        <Button
                            size="sm"
                            className="bg-[var(--accent-2)] text-white"
                            onClick={() => router.push("/app/subscribe")}
                        >
                            See Pro & Family plans
                        </Button>
                    </div>
                </div>
            )}
            {isProish && (
                <div className="rounded-xl border bg-violet-50 text-violet-900 px-3 py-2 flex items-start gap-2">
                    <Shield className="h-4 w-4 mt-0.5" />
                    <div className="text-sm">
                        <div className="font-medium">
                            You’re on {planTier === "trial" ? "a Pro trial" : "the Pro plan"}
                        </div>
                        <div className="opacity-90">
                            Invite up to <b>2 parents</b> and <b>1 caregiver</b>. Need more? Upgrade to Family for unlimited adults & caregivers.
                        </div>
                    </div>
                    <div className="ml-auto">
                        <Button
                            size="sm"
                            className="bg-violet-600 text-white"
                            onClick={() => router.push("/app/subscribe")}
                        >
                            Upgrade to Family
                        </Button>
                    </div>
                </div>
            )}

            {errorMsg && (
                <div className="rounded-xl border bg-red-50 text-red-800 px-3 py-2 text-sm flex items-center gap-2">
                    <InfoIcon className="h-4 w-4" />
                    <span>{errorMsg}</span>
                </div>
            )}

            <section className="rounded-2xl border bg-white p-4 sm:p-5">
                <h2 className="text-base sm:text-lg font-semibold mb-3">Household</h2>
                <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                    <Input
                        className="w-full sm:w-96"
                        value={householdName}
                        onChange={(e) => setHouseholdName(e.target.value)}
                        placeholder="Household name"
                        disabled={loading}
                    />
                    <Button
                        onClick={saveHousehold}
                        disabled={loading || savingName || !householdName.trim()}
                        className="inline-flex items-center gap-2 w-full sm:w-auto"
                    >
                        <Save className="h-4 w-4" />
                        Save
                    </Button>
                </div>
            </section>

            <section className="rounded-2xl border bg-white p-4 sm:p-5">
                <div className="flex items-center justify-between gap-2 mb-3">
                    <h2 className="text-base sm:text-lg font-semibold">Family members</h2>
                    <div className="text-xs opacity-70">
                        Parents: {numParents}/{Number.isFinite(caps.parents) ? caps.parents : "∞"} • Caregivers: {numCaregivers}/{Number.isFinite(caps.caregivers) ? caps.caregivers : "∞"}
                    </div>
                </div>

                {loading ? (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {[0, 1, 2].map((i) => (
                            <div key={i} className="rounded-xl border p-4 bg-white">
                                <div className="h-4 w-24 bg-gray-100 rounded mb-3 animate-pulse" />
                                <div className="h-9 w-full bg-gray-100 rounded mb-2 animate-pulse" />
                                <div className="h-9 w-full bg-gray-100 rounded animate-pulse" />
                            </div>
                        ))}
                    </div>
                ) : (
                    <>
                        {members.length === 0 && (
                            <p className="text-sm opacity-70 mb-3">No members yet. Add one below.</p>
                        )}

                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {members.map((m) => {
                                const parentOptionDisabled = m.role !== "parent" && !canAddParent;
                                const caregiverOptionDisabled = m.role !== "caregiver" && !canAddCaregiver;
                                return (
                                    <MemberCard
                                        key={m.id}
                                        member={m}
                                        onSave={(patch) => updateRow(m.id, patch)}
                                        onRemove={() => removeRow(m.id)}
                                        parentOptionDisabled={parentOptionDisabled}
                                        caregiverOptionDisabled={caregiverOptionDisabled}
                                    />
                                );
                            })}

                            <AddMemberCard
                                name={nmName}
                                setName={setNmName}
                                role={nmRole}
                                setRole={setNmRole}
                                email={nmEmail}
                                setEmail={setNmEmail}
                                canAddParent={canAddParent}
                                canAddCaregiver={canAddCaregiver}
                                canSubmit={canAddDraft}
                                busy={busyAdd}
                                onSubmit={addRow}
                            />
                        </div>

                        {planTier !== "family" && (
                            <div className="mt-2 flex flex-col sm:flex-row sm:items-center gap-2">
                                <p className="text-xs opacity-70">
                                    Pro allows up to <b>2 parents</b> and <b>1 caregiver</b>. Family has no limits.
                                </p>
                                {(isFree || isProish) && (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="sm:ml-auto"
                                        onClick={() => router.push("/app/subscribe")}
                                    >
                                        {isFree ? "See Pro & Family plans" : "Upgrade to Family"}
                                    </Button>
                                )}
                            </div>
                        )}
                    </>
                )}
            </section>
        </div>
    );
}

function PlanBadge({ tier }: { tier: PlanTier }) {
    const label = PLAN_LABEL[tier] ?? "Free";
    const tone =
        tier === "family"
            ? "bg-sky-600"
            : tier === "pro"
                ? "bg-emerald-600"
                : tier === "trial"
                    ? "bg-violet-600"
                    : "bg-gray-600";
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs text-white ${tone}`}>
            <Shield className="h-3 w-3" />
            {label}
        </span>
    );
}
