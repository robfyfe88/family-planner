"use client";
import React, { useState } from "react";
import AnnualLeavePlanner from "./AnnualLeavePlanner";
import NurseryPlannerPage from "./NurseryCostPlanner";
import FamilyBudgetPlanner from "./FamilyBudgetPlanner";

export default function FamilyToolsPage() {
  const [tab, setTab] = useState<"nursery" | "leave" | "budget">("nursery");

  const ids = {
    nurseryBtn: "tab-nursery",
    leaveBtn: "tab-leave",
    budgetBtn: "tab-budget",
    nurseryPanel: "panel-nursery",
    leavePanel: "panel-leave",
    budgetPanel: "panel-budget",
  };

  return (
    <div className="max-w-6xl mx-auto px-2 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6">

      <header className="space-y-3 sm:space-y-0 sm:flex sm:items-center sm:justify-between sm:gap-4">
        <nav
          role="tablist"
          aria-label="Planner tabs"
          className="
            sm:static sticky top-0 z-30
            -mx-4 sm:mx-0 px-4 sm:px-0 py-2 sm:py-0
            bg-[var(--background)]/80 backdrop-blur
          "
        >
          <div
            className="
              w-full sm:w-auto
              inline-flex gap-1 sm:gap-0
              overflow-x-auto no-scrollbar
              rounded-full border
              p-1
            "
          >
            <button
              id={ids.budgetBtn}
              role="tab"
              aria-controls={ids.budgetPanel}
              aria-selected={tab === "budget"}
              className={`shrink-0 inline-flex items-center justify-center px-3 sm:px-4 py-2 rounded-full text-sm transition
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-4)]
                ${tab === "budget" ? "bg-[var(--accent-4)] text-white" : "hover:bg-[var(--card-bg)]"}
              `}
              onClick={() => setTab("budget")}
            >
              Family Budget
            </button>

            <button
              id={ids.nurseryBtn}
              role="tab"
              aria-controls={ids.nurseryPanel}
              aria-selected={tab === "nursery"}
              className={`shrink-0 inline-flex items-center justify-center px-3 sm:px-4 py-2 rounded-full text-sm transition
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-2)]
                ${tab === "nursery" ? "bg-[var(--accent-2)] text-white" : "hover:bg-[var(--card-bg)]"}
              `}
              onClick={() => setTab("nursery")}
            >
              Childcare Costs
            </button>

            <button
              id={ids.leaveBtn}
              role="tab"
              aria-controls={ids.leavePanel}
              aria-selected={tab === "leave"}
              className={`shrink-0 inline-flex items-center justify-center px-3 sm:px-4 py-2 rounded-full text-sm transition
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]
                ${tab === "leave" ? "bg-[var(--accent)] text-white" : "hover:bg-[var(--card-bg)]"}
              `}
              onClick={() => setTab("leave")}
            >
              Annual Leave
            </button>
          </div>
        </nav>
      </header>

      <div
        id={ids.nurseryPanel}
        role="tabpanel"
        aria-labelledby={ids.nurseryBtn}
        aria-hidden={tab !== "nursery"}
        className={tab === "nursery" ? "block" : "hidden"}
      >
        <section className="card">
          <NurseryPlannerPage />
        </section>
      </div>

      <div
        id={ids.leavePanel}
        role="tabpanel"
        aria-labelledby={ids.leaveBtn}
        aria-hidden={tab !== "leave"}
        className={tab === "leave" ? "block" : "hidden"}
      >
        <AnnualLeavePlanner />
      </div>

      <div
        id={ids.budgetPanel}
        role="tabpanel"
        aria-labelledby={ids.budgetBtn}
        aria-hidden={tab !== "budget"}
        className={tab === "budget" ? "block" : "hidden"}
      >
        <FamilyBudgetPlanner />
      </div>
    </div>
  );
}
