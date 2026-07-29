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
    <section className={`dashboard-detail-section dashboard-tone-${tone} ${ring}`}>
      <div className="dashboard-detail-heading">
        <div><span>{tone === "violet" ? "Money" : tone === "green" ? "Childcare" : tone === "amber" ? "Leave" : "Activities"}</span><h2>{title}</h2></div>
        <Link href={ctaHref} passHref>
          <Button className={`${pillBg} dashboard-detail-action`}>
            {ctaLabel}
          </Button>
        </Link>
      </div>
      <div className="dashboard-detail-body">{children}</div>
    </section>
  );
}
