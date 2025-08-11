"use client";
import React, { useState } from "react";
import AnnualLeavePlanner from "./family-tools/AnnualLeavePlanner";
import NurseryPlannerPage from "./family-tools/NurseryCostPlanner";
import FamilyBudgetPlanner from "./family-tools/FamilyBudgetPlanner";

export default function FamilyToolsPage() {
  const [tab, setTab] = useState<"nursery" | "leave" | "budget">("nursery");

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold">Family Planner</h1>
        <nav className="inline-flex rounded-full border overflow-hidden" role="tablist" aria-label="Planner tabs">
                    <button
            role="tab"
            aria-selected={tab === "budget"}
            className={`px-4 py-2 text-sm ${tab === "budget" ? "bg-[var(--accent-4)] text-white" : ""}`}
            onClick={() => setTab("budget")}
          >
            Family Budget
          </button>
          <button
            role="tab"
            aria-selected={tab === "nursery"}
            className={`px-4 py-2 text-sm ${tab === "nursery" ? "bg-[var(--accent-2)] text-white" : ""}`}
            onClick={() => setTab("nursery")}
          >
            Nursery Costs
          </button>
          <button
            role="tab"
            aria-selected={tab === "leave"}
            className={`px-4 py-2 text-sm border-l ${tab === "leave" ? "bg-[var(--accent)] text-white" : ""}`}
            onClick={() => setTab("leave")}
          >
            Annual Leave
          </button>
        </nav>
      </header>

      <div
        role="tabpanel"
        aria-hidden={tab !== "nursery"}
        className={tab === "nursery" ? "block" : "hidden"}
      >
        <section className="card">
          <NurseryPlannerPage />
        </section>
      </div>

      <div
        role="tabpanel"
        aria-hidden={tab !== "leave"}
        className={tab === "leave" ? "block" : "hidden"}
      >
        <AnnualLeavePlanner />
      </div>

            <div
        role="tabpanel"
        aria-hidden={tab !== "budget"}
        className={tab === "budget" ? "block" : "hidden"}
      >
        <FamilyBudgetPlanner />
      </div>
    </div>
  );
}
