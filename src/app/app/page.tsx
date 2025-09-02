"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import HearthPlanLogo from "@/components/HearthPlanLogo";
import { Button } from "@/components/ui/button";
import * as React from "react";
import FamilyToolsPage from "../family-tools/FamilyToolsPage";
import { GoogleIcon } from "@/components/ui/GoogleIcon";
import { UserMenu } from "@/components/ui/UserMenu";

export default function AppHome() {
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

  const user = session.user;
  return (
    <div className="p-2 space-y-4">
      <FamilyToolsPage />
    </div>
  );
}



