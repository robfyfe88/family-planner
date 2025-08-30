"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import HearthPlanLogo from "@/components/HearthPlanLogo";
import { signOut, useSession } from "next-auth/react";

function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href || (href !== "/app" && pathname.startsWith(href));
  return (
    <Link
      href={href}
      className={`px-3 py-1.5 rounded-full text-sm transition
        ${active ? "bg-black text-white" : "hover:bg-[var(--card-bg)]"}`}
    >
      {label}
    </Link>
  );
}

export default function AppHeader() {
  const { data: session } = useSession();

  return (
    <header className="sticky top-0 z-40 bg-white/85 backdrop-blur border-b">
      <div className="max-w-6xl mx-auto px-2 sm:px-6 h-14 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/app" className="inline-flex items-center gap-2">
            <HearthPlanLogo size={40} variant="app" />
          </Link>
          <nav className="hidden sm:flex items-center gap-1">
            <NavLink href="/app" label="Dashboard" />
            <NavLink href="/app/family-tools" label="Planner" />
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/app/family-tools" className="sm:hidden px-3 py-1.5 rounded-full text-sm border bg-white">
            Planner
          </Link>

          {session ? (
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/" })}
              className="px-3 py-1.5 rounded-full text-sm border bg-white hover:bg-gray-50"
            >
              Sign out
            </button>
          ) : (
            <Link href="/" className="px-3 py-1.5 rounded-full text-sm border bg-white">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
