"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { runLegacyImportOnce } from "@/lib/runLegacyImportOnce";
import { buildLegacyPayloadFromLocal } from "@/lib/buildLegacyPayloadFromLocal";

export default function LegacyImportGate() {
  const ranRef = useRef(false);

useEffect(() => {
  if (ranRef.current) return;
  ranRef.current = true;

  const payload = buildLegacyPayloadFromLocal();

  const nothingToImport =
    (!payload.members || payload.members.length === 0) &&
    (!payload.activities || payload.activities.length === 0) &&
    (!payload.schoolDays || payload.schoolDays.length === 0) &&
    (!payload.budget || ( 
      (payload.budget.incomes?.length ?? 0) === 0 &&
      (payload.budget.expenses?.length ?? 0) === 0 &&
      (payload.budget.pots?.length ?? 0) === 0
    ));

  if (typeof window === "undefined") return;
  if (localStorage.getItem("__hp_migrated_v2") === "1") return;

  if (nothingToImport) return;

  const tId = toast.loading("Importing your existing data…");
  runLegacyImportOnce()
    .then((res: any) => {
      toast.success("Import complete", { id: tId, description: `Household: ${res?.householdId ?? "created"}` });
      localStorage.setItem("__hp_migrated_v2", "1"); 
    })
    .catch((err: any) => {
      console.error(err);
      toast.error("Import failed", { id: tId, description: err?.message ?? "See console for details." });
    });
}, []);

  return null;
}
