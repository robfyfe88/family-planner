"use client";

import React from "react";
import AnnualLeavePlanner from "./AnnualLeavePlanner";
import NurseryPlannerPage from "./NurseryCostPlanner";
import FamilyBudgetPlanner from "./FamilyBudgetPlanner";
import ActivitiesPlanner from "./ActivitiesPlannner";
import HearthPlanLogo from "@/components/HearthPlanLogo";
import { UserMenu } from "@/components/ui/UserMenu";
import { useSession } from "next-auth/react";
import type { AnnualData } from "../app/annual/actions";

type TabKey = "nursery" | "leave" | "budget" | "activities";
const ALL_TABS: TabKey[] = ["budget", "nursery", "leave", "activities"] as const;

const isTab = (v: string): v is TabKey =>
  v === "nursery" || v === "leave" || v === "budget" || v === "activities";

const clampToAllowed = (wanted: TabKey, allowed: TabKey[]): TabKey =>
  allowed.includes(wanted) ? wanted : allowed[0];

export default function FamilyToolsClient({ initialAnnual }: { initialAnnual: AnnualData }) {
  const { data: session } = useSession();
  const role = (session as any)?.role ?? null;
  const isCaregiver = role === "caregiver";

  // caregivers: only leave + activities
  const allowedTabs = React.useMemo<TabKey[]>(
    () => (isCaregiver ? (["leave", "activities"] as TabKey[]) : ALL_TABS),
    [isCaregiver]
  );

  const [tab, setTab] = React.useState<TabKey>(allowedTabs[0]);
  const [mounted, setMounted] = React.useState(false);
  const hasSyncedRef = React.useRef(false);

  // Read initial tab from hash/LS but clamp to allowed
  React.useEffect(() => {
    const pickInitial = (): TabKey => {
      if (typeof window === "undefined") return allowedTabs[0];
      const h = window.location.hash?.slice(1);
      if (h && isTab(h)) return clampToAllowed(h, allowedTabs);
      const ls = localStorage.getItem("hearthplan:tab");
      if (ls && isTab(ls)) return clampToAllowed(ls, allowedTabs);
      return allowedTabs[0];
    };
    setTab(pickInitial());
    setMounted(true);
    hasSyncedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCaregiver]); // re-run if role changes

  // Keep URL hash + LS in sync
  React.useEffect(() => {
    if (!mounted || !hasSyncedRef.current) return;
    if (typeof window === "undefined") return;
    const wanted = `#${tab}`;
    if (window.location.hash !== wanted) {
      window.history.replaceState(null, "", wanted);
    }
    localStorage.setItem("hearthplan:tab", tab);
  }, [tab, mounted]);

  // React to manual hash changes (but clamp to allowed)
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const onHash = () => {
      const h = window.location.hash?.slice(1) || "";
      if (isTab(h)) setTab((prev) => clampToAllowed(h, allowedTabs));
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [allowedTabs]);

  const ids = {
    nurseryBtn: "tab-nursery",
    leaveBtn: "tab-leave",
    budgetBtn: "tab-budget",
    activitiesBtn: "tab-activities",
    activitiesPanel: "panel-activities",
    nurseryPanel: "panel-nursery",
    leavePanel: "panel-leave",
    budgetPanel: "panel-budget",
  };

  const nextTab = React.useCallback(
    (t: TabKey): TabKey => {
      const i = allowedTabs.indexOf(t);
      const next = allowedTabs[(i + 1) % allowedTabs.length];
      return next;
    },
    [allowedTabs]
  );

  const prevTab = React.useCallback(
    (t: TabKey): TabKey => {
      const i = allowedTabs.indexOf(t);
      const prev = allowedTabs[(i - 1 + allowedTabs.length) % allowedTabs.length];
      return prev;
    },
    [allowedTabs]
  );

  const tabListRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    const el = tabListRef.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) e.preventDefault();
      if (e.key === "ArrowRight") setTab(nextTab(tab));
      if (e.key === "ArrowLeft") setTab(prevTab(tab));
      if (e.key === "Home") setTab(allowedTabs[0]);
      if (e.key === "End") setTab(allowedTabs[allowedTabs.length - 1]);
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [tab, nextTab, prevTab, allowedTabs]);

  if (!mounted) {
    return <div className="max-w-6xl mx-auto px-2 sm:px-6 py-6" />;
  }

  // Helpers to decide visibility
  const showBudget = allowedTabs.includes("budget");
  const showNursery = allowedTabs.includes("nursery");

  return (
    <div className="max-w-6xl mx-auto px-2 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between w-full">
        <HearthPlanLogo size={50} variant="app" />
        {session?.user && <UserMenu user={session.user} />}
      </div>

      <header className="space-y-3 sm:space-y-0 sm:flex sm:items-center sm:justify-between sm:gap-4">
        {/* Mobile grid tabs */}
        <div className="block sm:hidden sticky top-0 z-30 -mx-4 px-4 py-2 bg-[var(--background)]/80 backdrop-blur">
          <nav aria-label="Planner tabs (mobile)">
            <div className="grid grid-cols-2 gap-2">
              {showBudget && (
                <GridTab
                  id={ids.budgetBtn}
                  active={tab === "budget"}
                  onClick={() => setTab("budget")}
                  ariaControls={ids.budgetPanel}
                  label="Family Budget"
                  accent="var(--accent-4)"
                />
              )}
              {showNursery && (
                <GridTab
                  id={ids.nurseryBtn}
                  active={tab === "nursery"}
                  onClick={() => setTab("nursery")}
                  ariaControls={ids.nurseryPanel}
                  label="Childcare Costs"
                  accent="var(--accent-2)"
                />
              )}
              <GridTab
                id={ids.leaveBtn}
                active={tab === "leave"}
                onClick={() => setTab("leave")}
                ariaControls={ids.leavePanel}
                label="Annual Leave"
                accent="var(--accent)"
              />
              <GridTab
                id={ids.activitiesBtn}
                active={tab === "activities"}
                onClick={() => setTab("activities")}
                ariaControls={ids.activitiesPanel}
                label="Activities"
                accent="var(--accent-5)"
              />
            </div>
          </nav>
        </div>

        {/* Desktop pills */}
        <nav
          role="tablist"
          aria-label="Planner tabs"
          ref={tabListRef}
          className="hidden sm:block sm:static sticky top-0 z-30 -mx-4 sm:mx-0 px-4 sm:px-0 py-2 sm:py-0 bg-[var(--background)]/80 backdrop-blur"
        >
          <div className="relative w-full sm:w-auto inline-flex gap-1 sm:gap-0 rounded-full border p-1">
            {showBudget && (
              <PillTab
                id={ids.budgetBtn}
                active={tab === "budget"}
                onClick={() => setTab("budget")}
                ariaControls={ids.budgetPanel}
                accent="var(--accent-4)"
              >
                Family Budget
              </PillTab>
            )}
            {showNursery && (
              <PillTab
                id={ids.nurseryBtn}
                active={tab === "nursery"}
                onClick={() => setTab("nursery")}
                ariaControls={ids.nurseryPanel}
                accent="var(--accent-2)"
              >
                Childcare Costs
              </PillTab>
            )}
            <PillTab
              id={ids.leaveBtn}
              active={tab === "leave"}
              onClick={() => setTab("leave")}
              ariaControls={ids.leavePanel}
              accent="var(--accent)"
            >
              Annual Leave
            </PillTab>
            <PillTab
              id={ids.activitiesBtn}
              active={tab === "activities"}
              onClick={() => setTab("activities")}
              ariaControls={ids.activitiesPanel}
              accent="var(--accent-5)"
            >
              Activities Planner
            </PillTab>
          </div>
        </nav>
      </header>

      <div className="space-y-4 sm:space-y-6">
        {showNursery && (
          <Panel id={ids.nurseryPanel} labelledBy={ids.nurseryBtn} hidden={tab !== "nursery"}>
            <section className="card">
              <NurseryPlannerPage />
            </section>
          </Panel>
        )}

        <Panel id={ids.leavePanel} labelledBy={ids.leaveBtn} hidden={tab !== "leave"}>
          <AnnualLeavePlanner initial={initialAnnual} />
        </Panel>

        {showBudget && (
          <Panel id={ids.budgetPanel} labelledBy={ids.budgetBtn} hidden={tab !== "budget"}>
            <FamilyBudgetPlanner />
          </Panel>
        )}

        <Panel id={ids.activitiesPanel} labelledBy={ids.activitiesBtn} hidden={tab !== "activities"}>
          <ActivitiesPlanner />
        </Panel>
      </div>
    </div>
  );
}

/* ---------------- subcomponents ---------------- */

function GridTab({
  id, active, onClick, ariaControls, label, accent,
}: {
  id: string;
  active: boolean;
  onClick: () => void;
  ariaControls: string;
  label: string;
  accent: string;
}) {
  return (
    <button
      id={id}
      role="tab"
      aria-controls={ariaControls}
      aria-selected={active}
      onClick={onClick}
      className={`w-full h-12 rounded-xl text-sm font-medium transition shadow-sm focus-visible:outline-none focus-visible:ring-2 ${
        active ? "text-white" : "bg-[var(--card-bg)] hover:bg-[var(--card-bg)]/80"
      }`}
      style={{ background: active ? accent : undefined }}
    >
      {label}
    </button>
  );
}

function PillTab({
  id, active, onClick, ariaControls, children, accent,
}: {
  id: string;
  active: boolean;
  onClick: () => void;
  ariaControls: string;
  children: React.ReactNode;
  accent: string;
}) {
  return (
    <button
      id={id}
      role="tab"
      aria-controls={ariaControls}
      aria-selected={active}
      onClick={onClick}
      className={`shrink-0 inline-flex items-center justify-center px-3 sm:px-4 py-2 rounded-full text-sm transition focus-visible:outline-none focus-visible:ring-2 ${
        active ? "text-white" : "hover:bg-[var(--card-bg)]"
      }`}
      style={{ background: active ? accent : undefined }}
    >
      {children}
    </button>
  );
}

function Panel({
  id, labelledBy, hidden, children,
}: {
  id: string;
  labelledBy: string;
  hidden: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      id={id}
      role="tabpanel"
      aria-labelledby={labelledBy}
      aria-hidden={hidden}
      className={hidden ? "hidden" : "block"}
    >
      {children}
    </div>
  );
}
