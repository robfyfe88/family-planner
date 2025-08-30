import { buildLegacyPayloadFromLocal } from "./buildLegacyPayloadFromLocal";

export async function runLegacyImportOnce() {
  if (typeof window === "undefined") return { ok: true };

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

  if (nothingToImport) return { ok: true };

  const res = await fetch("/api/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "Import failed");
    throw new Error(text);
  }

  return res.json();
}
