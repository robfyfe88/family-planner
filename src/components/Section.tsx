import Link from "next/link";
import { Button } from "@/components/ui/button";
import * as React from "react";

export default function Section({
  title,
  ctaHref,
  ctaLabel,
  tone = "blue",
  children,
}: {
  title: string;
  ctaHref: string;
  ctaLabel: string;
  tone?: "blue" | "green" | "amber" | "violet";
  children: React.ReactNode;
}) {
  const ring =
    tone === "green"
      ? "ring-emerald-200"
      : tone === "amber"
      ? "ring-amber-200"
      : tone === "violet"
      ? "ring-violet-200"
      : "ring-blue-200";

  const pillBg =
    tone === "green"
      ? "bg-emerald-600 hover:bg-emerald-700"
      : tone === "amber"
      ? "bg-amber-600 hover:bg-amber-700"
      : tone === "violet"
      ? "bg-violet-600 hover:bg-violet-700"
      : "bg-blue-600 hover:bg-blue-700";

  return (
    <section className={`rounded-2xl border bg-white p-4 sm:p-5 ring-1 ${ring}`}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-lg sm:text-xl font-semibold">{title}</h2>
        <Link href={ctaHref} passHref>
          <Button className={`${pillBg} text-white cursor-pointer px-3 py-1.5 text-sm`}>
            {ctaLabel}
          </Button>
        </Link>
      </div>
      {children}
    </section>
  );
}
