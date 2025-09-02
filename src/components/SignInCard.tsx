"use client";

import { signIn } from "next-auth/react";
import HearthPlanLogo from "@/components/HearthPlanLogo";
import { Button } from "@/components/ui/button";
import { GoogleIcon } from "@/components/ui/GoogleIcon";

export default function SignInCard() {
  return (
    <div className="p-6">
      <div className="max-w-md mx-auto text-center p-8 border rounded-2xl bg-[var(--card-bg)]">
        <HearthPlanLogo size={50} variant="app" />
        <p className="text-sm opacity-70 mb-5">
          Sign in to save your nursery plans, leave schedules, and budgets.
        </p>
        <Button
          type="button"
          onClick={() => signIn("google", { callbackUrl: "/app" })}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent-2)] text-white"
        >
          <GoogleIcon />
          <span>Sign in with Google</span>
        </Button>
      </div>
    </div>
  );
}
