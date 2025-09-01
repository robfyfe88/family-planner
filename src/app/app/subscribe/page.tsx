"use client";

import * as React from "react";
import { useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { fetchSubscription, setSubscriptionTier, cancelToFree, type PlanTier } from "./actions";
import { Check, Shield, Crown, Users, AlertTriangle, ArrowLeft } from "lucide-react";

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
        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs text-white ${tone}`}>
            <Shield className="h-3 w-3" />
            {label}
            {periodEndISO && tier === "trial" ? (
                <span className="opacity-90 ml-1">(ends {new Date(periodEndISO).toLocaleDateString()})</span>
            ) : null}
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
