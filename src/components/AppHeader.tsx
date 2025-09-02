"use client";

import { useSession } from "next-auth/react";
import HearthPlanLogo from "@/components/HearthPlanLogo";
import { UserMenu } from "@/components/ui/UserMenu";

export default function AppHeader() {
  const { data: session } = useSession();
  return (
    <div className="flex items-center justify-between w-full">
    </div>
  );
}
