"use client";

import { User, Users, Smile } from "lucide-react";

export default function RoleBadge({ role }: { role: "parent" | "caregiver" | "child" }) {
  const tone =
    role === "parent"
      ? "bg-emerald-100 text-emerald-700 border-emerald-200"
      : role === "caregiver"
      ? "bg-sky-100 text-sky-700 border-sky-200"
      : "bg-violet-100 text-violet-700 border-violet-200";

  const Icon = role === "parent" ? User : role === "caregiver" ? Users : Smile;
  const label = role === "parent" ? "Parent" : role === "caregiver" ? "Caregiver" : "Child";

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border ${tone}`}>
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}
