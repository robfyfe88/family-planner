"use client";

import * as React from "react";
import { useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { fetchSubscription, setSubscriptionTier, cancelToFree, type PlanTier } from "./actions";
import { Check, Shield, Crown, Users, AlertTriangle, ArrowLeft } from "lucide-react";
import { GoogleIcon } from "@/components/ui/GoogleIcon";
import { UserMenu } from "@/components/ui/UserMenu";
import HearthPlanLogo from "@/components/HearthPlanLogo";

type TierCardProps = {
    tier: PlanTier;
    title: string;
    price: string;
    blurb: string;
    features: string[];
    cta: string;
    onClick: () => void;
    highlight?: boolean;
    disabled?: boolean;
};

export default function SubscribePage() {
    const { data: session, status } = useSession();
    const router = useRouter();

    const [loading, setLoading] = React.useState(true);
    const [err, setErr] = React.useState<string | null>(null);

    const [tier, setTier] = React.useState<PlanTier>("free");
    const [statusStr, setStatusStr] = React.useState<string>("active");
    const [periodEnd, setPeriodEnd] = React.useState<string | null>(null);
    const [parentCount, setParentCount] = React.useState(0);
    const [caregiverCount, setCaregiverCount] = React.useState(0);

    React.useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                setLoading(true);
                const s = await fetchSubscription();
                if (cancelled) return;
                setTier(s.tier);
                setStatusStr(s.status);
                setPeriodEnd(s.currentPeriodEndISO);
                setParentCount(s.parentCount);
                setCaregiverCount(s.caregiverCount);
            } catch (e: any) {
                if (!cancelled) setErr(e?.message ?? "Failed to load subscription.");
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

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
                        Sign in to manage your subscription.
                    </p>
                    <Button
                        type="button"
                        onClick={() => signIn("google", { callbackUrl: "/app/subscribe" })}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent-2)] text-white"
                    >
                        <GoogleIcon />
                        <span>Sign in with Google</span>
                    </Button>
                </div>
            </div>
        );
    }

    const busy = loading;

    const onChoose = async (next: PlanTier) => {
        setErr(null);
        try {
            setLoading(true);
            const res = await setSubscriptionTier(next);
            setTier(res.tier);
            setStatusStr(res.status);
            setPeriodEnd(res.currentPeriodEndISO);
        } catch (e: any) {
            setErr(e?.message ?? "Could not change plan.");
        } finally {
            setLoading(false);
        }
    };

    const onCancel = async () => {
        setErr(null);
        try {
            setLoading(true);
            const res = await cancelToFree();
            setTier(res.tier);
            setStatusStr(res.status);
            setPeriodEnd(res.currentPeriodEndISO);
        } catch (e: any) {
            setErr(e?.message ?? "Could not cancel subscription.");
        } finally {
            setLoading(false);
        }
    };

    const exceedsFree =
        parentCount > 1 || caregiverCount > 0;

    const exceedsPro = parentCount > 2 || caregiverCount > 1;

    const isFreeCurrent = tier === "free";
    const isProLikeCurrent = tier === "pro" || tier === "trial";
    const isFamilyCurrent = tier === "family";

    return (
        <div className="max-w-5xl mx-auto p-3 sm:p-6 space-y-5">
            <div className="flex items-center justify-between w-full">
                <HearthPlanLogo size={50} variant="app" />
                {session?.user && <UserMenu user={session.user} />}
            </div>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        className="px-2"
                        onClick={() => {
                            if (history.length > 1) router.back();
                            else router.push("/app");
                        }}
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <h1 className="ml-1 text-lg sm:text-xl font-semibold">Subscription</h1>
                </div>
                <PlanBadge tier={tier} status={statusStr} periodEndISO={periodEnd} />
            </div>

            {err && (
                <div className="rounded-xl border bg-red-50 text-red-800 px-3 py-2 text-sm flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    <span>{err}</span>
                </div>
            )}

            <div className="rounded-xl border bg-white p-4 sm:p-5">
                <div className="text-sm opacity-80 mb-2">
                    Current household: parent(s) <b>{parentCount}</b> • caregiver(s) <b>{caregiverCount}</b>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                    <TierCard
                        tier="free"
                        title="Free"
                        price="£0"
                        blurb="Everything you need to start."
                        features={[
                            "1 parent",
                            "Unlimited children",
                            "Budget planner",
                        ]}
                        cta={tier === "free" ? "Current plan" : "Switch to Free"}
                        onClick={() => onChoose("free")}
                        disabled={busy || (tier === "free") || exceedsFree}
                    />


                    <TierCard
                        tier="pro"
                        title="Pro"
                        price="£4.99/mo"
                        blurb="Co-parenting & caregiver invites."
                        features={[
                            "Up to 2 parents",
                            "1 caregiver",
                            "Priority support",
                        ]}
                        cta={
                            tier === "pro" || tier === "trial"
                                ? "Current plan"
                                : tier === "family"
                                    ? "Downgrade to Pro"
                                    : "Upgrade to Pro"
                        }
                        onClick={() => onChoose("pro")}
                        highlight={isProLikeCurrent}
                        disabled={busy || tier === "pro" || tier === "trial"}
                    />

                    <TierCard
                        tier="family"
                        title="Family"
                        price="£8.99/mo"
                        blurb="Unlimited adults & caregivers."
                        features={[
                            "Unlimited parents",
                            "Unlimited caregivers",
                            "Priority support",
                        ]}
                        cta={tier === "family" ? "Current plan" : "Upgrade to Family"}
                        onClick={() => onChoose("family")}
                        highlight={isFamilyCurrent}
                        disabled={busy || tier === "family"}
                    />
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Button
                        variant="outline"
                        disabled={busy || tier === "free"}
                        onClick={onCancel}
                    >
                        Cancel & move to Free
                    </Button>

                    {tier === "free" && (
                        <Button
                            className="bg-violet-600 text-white"
                            disabled={busy}
                            onClick={() => onChoose("trial")}
                        >
                            Start 7-day Trial (Pro)
                        </Button>
                    )}

                    <p className="text-xs opacity-70 ml-auto">
                        Downgrading is blocked if your current adults exceed the target plan limits.
                    </p>
                </div>
            </div>
        </div>
    );
}

function TierCard({
    title, price, blurb, features, cta, onClick, highlight, disabled, tier,
}: TierCardProps & { tier: PlanTier }) {
    return (
        <div
            className={`rounded-xl border p-4 flex flex-col bg-white ${highlight ? "ring-2 ring-violet-200" : ""
                }`}
            aria-current={highlight ? "true" : undefined}
        >
            <div className="flex items-center justify-between">
                <div className="text-lg font-semibold">{title}</div>
                {tier === "family" ? (
                    <Users className="h-5 w-5 opacity-60" />
                ) : title === "Pro" ? (
                    <Crown className="h-5 w-5 opacity-60" />
                ) : (
                    <Shield className="h-5 w-5 opacity-60" />
                )}
            </div>
            <div className="mt-1 text-2xl font-bold">{price}</div>
            <div className="text-sm opacity-80">{blurb}</div>
            <ul className="mt-3 space-y-1 text-sm">
                {features.map((f) => (
                    <li key={f} className="flex items-center gap-2">
                        <Check className="h-4 w-4" />
                        <span>{f}</span>
                    </li>
                ))}
            </ul>
            <Button
                className={`mt-4 ${highlight ? "bg-violet-600 text-white hover:bg-violet-700" : ""}`}
                disabled={disabled}
                onClick={onClick}
            >
                {cta}
            </Button>
        </div>
    );
}

function PlanBadge({ tier, status, periodEndISO }: { tier: PlanTier; status: string; periodEndISO: string | null }) {
    const tone =
        tier === "family" ? "bg-sky-600"
            : tier === "pro" || tier === "trial" ? "bg-emerald-600"
                : "bg-gray-600";
    const label =
        tier === "trial" ? "Trial (Pro)"
            : tier.charAt(0).toUpperCase() + tier.slice(1);

    return (
        <span className={`inline-flex items-center gap-1 px-2 py-1 mr-1 rounded-full text-xs text-white ${tone}`}>
            <Shield className="h-3 w-3" />
            {label}
            {periodEndISO && tier === "trial" ? (
                <span className="opacity-90 ml-1">(ends {new Date(periodEndISO).toLocaleDateString()})</span>
            ) : null}
        </span>
    );
}
