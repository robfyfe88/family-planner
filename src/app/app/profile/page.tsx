"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useSession, signIn } from "next-auth/react";
import HearthPlanLogo from "@/components/HearthPlanLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectItem,
} from "@/components/ui/select";
import {
    ArrowLeft,
    Save,
    Trash,
    Shield,
    Info as InfoIcon,
} from "lucide-react";

import {
    fetchProfileData,
    updateHouseholdName,
    addMember,
    removeMember,
    updateMember,
    type MemberLite,
} from "./actions";

type PlanTier = "free" | "pro" | "family" | "trial";
const PLAN_LABEL: Record<PlanTier, string> = {
    free: "Free",
    pro: "Pro",
    family: "Family",
    trial: "Trial",
};

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
                    <HearthPlanLogo size={50} variant="app" />
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

    // draft row
    const [nmName, setNmName] = React.useState("");
    const [nmRole, setNmRole] = React.useState<"parent" | "caregiver" | "child">("child");
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

    // simple derived quotas for front-end hints
    const numParents = members.filter(m => m.role === "parent").length;
    const numCaregivers = members.filter(m => m.role === "caregiver").length;

    const isFree = planTier === "free";
    const isProish = planTier === "pro" || planTier === "trial";
    const canAddParent =
        planTier === "family" ||
        (isProish && numParents < 2) ||
        (planTier === "free" && numParents < 1);
    const canAddCaregiver =
        planTier === "family" || (isProish && numCaregivers < 1);

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

    // Only show email input when role === parent (per your spec)
    const showInviteEmail = (role: "parent" | "caregiver" | "child") => role === "parent";

    const canAddCurrentDraft =
        nmName.trim().length > 0 &&
        (
            (nmRole === "parent" && canAddParent) ||
            (nmRole === "caregiver" && canAddCaregiver) ||
            nmRole === "child"
        ) &&
        (!showInviteEmail(nmRole) || validateEmail(nmEmail));

    const addRow = async () => {
        if (!canAddCurrentDraft) return;
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
            {/* Header */}
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

            {/* Plan callouts with upgrade CTAs */}
            {isFree && (
                <div className="rounded-xl border bg-amber-50 text-amber-900 px-3 py-2 flex items-start gap-2">
                    <Shield className="h-4 w-4 mt-0.5" />
                    <div className="text-sm">
                        <div className="font-medium">You’re on the Free plan</div>
                        <div className="opacity-90">
                            You can have <b>1 parent</b> and any number of children.
                            Inviting an additional parent or any caregiver requires Pro.
                        </div>
                    </div>
                    <div className="ml-auto">
                        <Button
                            size="sm"
                            className="bg-[var(--accent-2)] text-white"
                            onClick={() => router.push("/app/subscribe")}
                        >
                            Upgrade to Pro
                        </Button>
                    </div>
                </div>
            )}


            {isProish && (
                <div className="rounded-xl border bg-violet-50 text-violet-900 px-3 py-2 flex items-start gap-2">
                    <Shield className="h-4 w-4 mt-0.5" />
                    <div className="text-sm">
                        <div className="font-medium">You’re on {planTier === "trial" ? "a Pro trial" : "the Pro plan"}</div>
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

            {/* Household */}
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

            {/* Members */}
            <section className="rounded-2xl border bg-white p-4 sm:p-5">
                <div className="flex items-center justify-between gap-2 mb-3">
                    <h2 className="text-base sm:text-lg font-semibold">Family members</h2>
                    {(isProish || planTier === "family") && (
                        <div className="text-xs opacity-70">
                            {`Parents: ${numParents}/${planTier === "family" ? "∞" : "2"}  •  Caregivers: ${numCaregivers}/${planTier === "family" ? "∞" : "1"}`}
                        </div>
                    )}
                </div>

                <div className="overflow-auto rounded-xl border">
                    <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-white">
                            <tr>
                                <th className="text-left px-3 py-2 w-[30%]">Name</th>
                                <th className="text-left px-3 py-2 w-[20%]">Role</th>
                                <th className="text-left px-3 py-2 w-[40%]">Invite email (parents only)</th>
                                <th className="text-right px-2 py-2 w-[10%]">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="[&>tr:nth-child(even)]:bg-[rgba(0,0,0,0.02)]">
                            {loading && (
                                <tr>
                                    <td className="px-3 py-3" colSpan={4}>
                                        <div className="h-4 w-40 bg-gray-100 animate-pulse rounded" />
                                    </td>
                                </tr>
                            )}
                            {!loading && members.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="px-3 py-6 text-center opacity-70">
                                        No members yet. Add one below.
                                    </td>
                                </tr>
                            )}

                            {members.map((m) => {
                                const isParent = m.role === "parent";
                                // Disable choosing "parent" if at cap and this row isn't already a parent
                                const parentOptionDisabled = !isParent && !canAddParent;
                                const caregiverOptionDisabled = m.role !== "caregiver" && !canAddCaregiver;

                                return (
                                    <tr key={m.id}>
                                        <td className="px-3 py-2">
                                            <Input
                                                className="w-full sm:w-64 bg-transparent"
                                                value={m.name}
                                                onChange={(e) => updateRow(m.id, { name: e.target.value })}
                                                onBlur={(e) => updateRow(m.id, { name: e.target.value.trim() })}
                                            />
                                        </td>

                                        <td className="px-3 py-2 min-w-36">
                                            <Select
                                                value={m.role}
                                                onValueChange={(v) => updateRow(m.id, { role: v as any })}
                                            >
                                                <SelectTrigger className="h-9">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="parent" disabled={parentOptionDisabled}>
                                                        Parent{parentOptionDisabled ? " — limit reached" : ""}
                                                    </SelectItem>
                                                    <SelectItem value="caregiver" disabled={caregiverOptionDisabled}>
                                                        Caregiver{caregiverOptionDisabled ? " — limit reached" : ""}
                                                    </SelectItem>
                                                    <SelectItem value="child">Child</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </td>

                                        <td className="px-3 py-2">
                                            {isParent ? (
                                                <Input
                                                    className="w-full sm:w-64"
                                                    type="email"
                                                    placeholder="name@example.com (optional)"
                                                    value={m.inviteEmail ?? ""}
                                                    onChange={(e) => updateRow(m.id, { inviteEmail: e.target.value })}
                                                    onBlur={(e) =>
                                                        updateRow(m.id, { inviteEmail: e.target.value.trim() || null })
                                                    }
                                                />
                                            ) : (
                                                <span className="opacity-40">—</span>
                                            )}
                                        </td>

                                        <td className="px-2 py-2 text-right">
                                            <Button
                                                variant="outline"
                                                size="icon"
                                                aria-label="Remove"
                                                onClick={() => removeRow(m.id)}
                                            >
                                                <Trash className="h-4 w-4" />
                                            </Button>
                                        </td>
                                    </tr>
                                );
                            })}

                            {/* Add row */}
                            <tr className="bg-[var(--card-bg)] border-t">
                                <td className="px-3 py-2">
                                    <Input
                                        placeholder="Member name"
                                        value={nmName}
                                        onChange={(e) => setNmName(e.target.value)}
                                    />
                                </td>
                                <td className="px-3 py-2">
                                    <Select value={nmRole} onValueChange={(v) => setNmRole(v as any)}>
                                        <SelectTrigger className="h-9">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="parent" disabled={!canAddParent}>
                                                Parent{!canAddParent ? " — limit reached" : ""}
                                            </SelectItem>
                                            <SelectItem value="caregiver" disabled={!canAddCaregiver}>
                                                Caregiver{!canAddCaregiver ? " — limit reached" : ""}
                                            </SelectItem>
                                            <SelectItem value="child">Child</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </td>
                                <td className="px-3 py-2">
                                    {showInviteEmail(nmRole) ? (
                                        <Input
                                            type="email"
                                            placeholder="Invite email (optional)"
                                            value={nmEmail}
                                            onChange={(e) => setNmEmail(e.target.value)}
                                            onBlur={(e) => setNmEmail(e.target.value.trim())}
                                        />
                                    ) : (
                                        <span className="opacity-40">—</span>
                                    )}
                                </td>
                                <td className="px-2 py-2 text-right">
                                    <Button
                                        onClick={addRow}
                                        disabled={!canAddCurrentDraft || busyAdd}
                                        className="w-full sm:w-auto"
                                    >
                                        Add member
                                    </Button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                {/* Gentle nudge below the table */}
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

function GoogleIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
            <path fill="#EA4335" d="M24 9.5c3.7 0 6.9 1.3 9.5 3.8l7.1-7.1C36.9 2.2 30.9 0 24 0 14.6 0 6.4 5.4 2.5 13.2l8.6 6.7C12.9 14.3 17.9 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.5 24.5c0-1.7-.2-3.3-.6-4.9H24v9.3h12.7c-.6 3-2.3 5.6-4.8 7.3l7.4 5.7c4.3-3.9 6.8-9.6 6.8-17.4z" />
            <path fill="#FBBC05" d="M11.1 27.9c-.5-1.5-.8-3.1-.8-4.9s.3-3.4.8-4.9l-8.6-6.7C.9 13.9 0 18.8 0 23s.9 9.1 2.5 12.6l8.6-7.7z" />
            <path fill="#34A853" d="M24 48c6.5 0 12-2.1 16-5.8l-7.4-5.7c-2.1 1.4-4.8 2.2-8.6 2.2-6.1 0-11.1-4.8-12.9-11.1l-8.6 7.7C6.4 42.6 14.6 48 24 48z" />
        </svg>
    );
}

function validateEmail(e: string) {
    if (!e) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}
