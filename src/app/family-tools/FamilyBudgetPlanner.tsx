"use client";
import React from "react";

/** ---------- Types ---------- */
type Row = { id: string; label: string; amount: number };

type Pot = { id: string; name: string };
type PotMonth = { month: string; values: Record<string, number> };
type SavingsYear = PotMonth[];

type BudgetState = {
  incomes: Row[];
  expenses: Row[];
  pots: Pot[];
  savingsYear: SavingsYear;
};

const STORE_KEY = "familyBudgetPlanner:v3";

/** ---------- Utils ---------- */
const uid = () =>
  (typeof crypto !== "undefined" && "randomUUID" in crypto)
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

const gbp = (n: number) =>
  (isFinite(n) ? n : 0).toLocaleString("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 2,
  });

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function safe(n: any): number {
  const v = typeof n === "number" ? n : parseFloat(n ?? "0");
  return Number.isFinite(v) ? v : 0;
}
function round2(n: number) { return Math.round(n * 100) / 100; }
function csv(s: string) { return (s ?? "").replace(/"/g, '""'); }
function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/** ---------- Defaults ---------- */
const initialPotId = uid();
const defaultState: BudgetState = {
  incomes: [],
  expenses: [],
  pots: [{ id: initialPotId, name: "Savings" }],
  savingsYear: MONTHS.map((m) => ({ month: m, values: { [initialPotId]: 0 } })),
};

/** ---------- Hooks ---------- */
function useMedia(query: string, fallback = true) {
  const get = () => (typeof window !== "undefined" ? window.matchMedia(query).matches : fallback);
  const [matches, setMatches] = React.useState(get);
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const m = window.matchMedia(query);
    const onChange = () => setMatches(m.matches);
    onChange();
    m.addEventListener?.("change", onChange);
    return () => m.removeEventListener?.("change", onChange);
  }, [query]);
  return matches;
}

/** ---------- Donut ---------- */
function Donut({
  fraction, size = 180, stroke = 14, labelTop, labelBottom,
}: {
  fraction: number; size?: number; stroke?: number;
  labelTop?: string; labelBottom?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const spent = Math.max(0, Math.min(1, fraction || 0));
  const dash = `${spent * c} ${c}`;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={r} stroke="var(--border-color)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size/2} cy={size/2} r={r}
          stroke="var(--accent-2)" strokeWidth={stroke} fill="none"
          strokeDasharray={dash} strokeLinecap="round"
          transform={`rotate(-90 ${size/2} ${size/2})`}
        />
      </svg>
      <div className="absolute text-center">
        <div className="text-xs opacity-70">{labelTop ?? "Spent"}</div>
        <div className="text-lg font-semibold">{Math.round(spent * 100)}%</div>
        {labelBottom && <div className="text-[11px] opacity-70">{labelBottom}</div>}
      </div>
    </div>
  );
}

/** ---------- Main ---------- */
export default function FamilyBudgetPlanner() {
  const [state, setState] = React.useState<BudgetState>(defaultState);
  const [summaryMonthIdx, setSummaryMonthIdx] = React.useState<number>(new Date().getMonth());
  const isSmUp = useMedia("(min-width: 640px)", true);

  // restore
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<BudgetState>;

      let pots = parsed.pots && Array.isArray(parsed.pots) && parsed.pots.length > 0
        ? parsed.pots
        : [{ id: uid(), name: "Savings" }];

      let savingsYear: SavingsYear;
      if (Array.isArray(parsed.savingsYear) && parsed.savingsYear.length === 12) {
        savingsYear = parsed.savingsYear.map((m, i) => ({
          month: MONTHS[i],
          values: pots.reduce<Record<string, number>>((acc, p) => {
            acc[p.id] = safe(m?.values?.[p.id]);
            return acc;
          }, {})
        }));
      } else {
        savingsYear = MONTHS.map((_, i) => ({
          month: MONTHS[i],
          values: pots.reduce<Record<string, number>>((acc, p) => (acc[p.id] = 0, acc), {})
        }));
      }

      setState({
        incomes: Array.isArray(parsed.incomes) ? parsed.incomes as Row[] : [],
        expenses: Array.isArray(parsed.expenses) ? parsed.expenses as Row[] : [],
        pots,
        savingsYear,
      });
    } catch {}
  }, []);

  // persist
  React.useEffect(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch {}
  }, [state]);

  /** Totals */
  const totalIncome = React.useMemo(
    () => round2(state.incomes.reduce((s, r) => s + safe(r.amount), 0)),
    [state.incomes]
  );
  const totalExpenses = React.useMemo(
    () => round2(state.expenses.reduce((s, r) => s + safe(r.amount), 0)),
    [state.expenses]
  );

  const monthRow = state.savingsYear[summaryMonthIdx] ?? state.savingsYear[0];
  const monthlySavings = React.useMemo(() => {
    if (!monthRow) return 0;
    return round2(state.pots.reduce((s, p) => s + safe(monthRow.values[p.id]), 0));
  }, [state.pots, monthRow]);

  const cashBalance = round2(totalIncome - totalExpenses - monthlySavings);
  const pctSpent = totalIncome > 0 ? totalExpenses / totalIncome : 0;

  const ytdByPot = React.useMemo(() => {
    const totals: Record<string, number> = {};
    for (const p of state.pots) totals[p.id] = 0;
    for (const m of state.savingsYear) {
      for (const p of state.pots) totals[p.id] += safe(m.values[p.id]);
    }
    for (const id of Object.keys(totals)) totals[id] = round2(totals[id]);
    return totals;
  }, [state.pots, state.savingsYear]);
  const ytdTotal = round2(Object.values(ytdByPot).reduce((s, v) => s + v, 0));

  /** Income/Expense handlers */
  const setIncome = (id: string, patch: Partial<Row>) =>
    setState((st) => ({ ...st, incomes: st.incomes.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  const addIncome = () => setState((st) => ({ ...st, incomes: [...st.incomes, { id: uid(), label: "", amount: 0 }] }));
  const rmIncome = (id: string) => setState((st) => ({ ...st, incomes: st.incomes.filter((r) => r.id !== id) }));

  const setExpense = (id: string, patch: Partial<Row>) =>
    setState((st) => ({ ...st, expenses: st.expenses.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  const addExpense = () => setState((st) => ({ ...st, expenses: [...st.expenses, { id: uid(), label: "", amount: 0 }] }));
  const rmExpense = (id: string) => setState((st) => ({ ...st, expenses: st.expenses.filter((r) => r.id !== id) }));

  /** Pots handlers */
  const addPot = () => {
    const newId = uid();
    const idx = state.pots.length + 1;
    setState((st) => ({
      ...st,
      pots: [...st.pots, { id: newId, name: `Pot ${idx}` }],
      savingsYear: st.savingsYear.map((m) => ({ ...m, values: { ...m.values, [newId]: 0 } })),
    }));
  };
  const renamePot = (id: string, name: string) =>
    setState((st) => ({ ...st, pots: st.pots.map((p) => (p.id === id ? { ...p, name } : p)) }));
  const removePot = (id: string) =>
    setState((st) => ({
      ...st,
      pots: st.pots.filter((p) => p.id !== id),
      savingsYear: st.savingsYear.map((m) => {
        const { [id]: _, ...rest } = m.values;
        return { ...m, values: rest };
      }),
    }));

  const setMonthValue = (monthIdx: number, potId: string, value: number) =>
    setState((st) => {
      const next = [...st.savingsYear];
      const row = { ...next[monthIdx], values: { ...next[monthIdx].values, [potId]: value } };
      next[monthIdx] = row;
      return { ...st, savingsYear: next };
    });

  const resetDefaults = () => setState(defaultState);

  /** Export */
  const exportCSV = () => {
    const lines: string[] = [];
    lines.push("Section,Label,Amount");
    for (const r of state.incomes) lines.push(`Income,"${csv(r.label)}",${safe(r.amount)}`);
    for (const r of state.expenses) lines.push(`Expense,"${csv(r.label)}",${safe(r.amount)}`);
    lines.push("");
    const potNames = state.pots.map((p) => `"${csv(p.name)}"`).join(",");
    lines.push(`Month,${potNames},Total`);
    for (let i = 0; i < state.savingsYear.length; i++) {
      const row = state.savingsYear[i];
      const vals = state.pots.map((p) => safe(row.values[p.id]));
      const total = vals.reduce((s, v) => s + v, 0);
      lines.push(`"${row.month}",${vals.join(",")},${round2(total)}`);
    }
    downloadText("family-budget.csv", lines.join("\n"));
  };

  const donutSize = isSmUp ? 180 : 140;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Summary */}
      <section className="card">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-6 items-center">
          <div className="lg:col-span-2">
            <div className="flex flex-wrap items-center gap-2 justify-between">
              <h2 className="text-lg font-medium">Summary</h2>
              <label className="text-sm flex items-center gap-2">
                <span>Summary month</span>
                <select
                  className="px-2 py-1 border rounded"
                  value={summaryMonthIdx}
                  onChange={(e) => setSummaryMonthIdx(parseInt(e.target.value, 10))}
                >
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i}>{m}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-3 grid grid-cols-2 sm:grid-cols-2 gap-3">
              <Stat label="Total monthly income" value={gbp(totalIncome)} />
              <Stat label="Total monthly expenses" value={gbp(totalExpenses)} />
              <Stat label={`Monthly savings (${MONTHS[summaryMonthIdx]})`} value={`- ${gbp(monthlySavings)}`} />
              <Stat label="Cash balance" value={gbp(cashBalance)} />
            </div>
            <p className="text-xs opacity-70 mt-2">
              Balance = income − expenses − pots for the selected month.
            </p>
          </div>

          <div className="flex items-center justify-center">
            <Donut
              fraction={pctSpent}
              size={donutSize}
              labelTop="Spent"
              labelBottom={`${gbp(totalIncome - totalExpenses)} left (pre-savings)`}
            />
          </div>

          <div className="lg:col-span-2 w-full">
            <h2 className="text-lg font-medium mb-3">YTD Pots</h2>
            <div className="grid grid-cols-2 gap-3">
              {state.pots.map((p) => (
                <Stat key={p.id} label={`YTD ${p.name}`} value={gbp(ytdByPot[p.id] || 0)} />
              ))}
              <div className="col-span-2 sm:col-span-2">
                <Stat label="YTD Total" value={gbp(ytdTotal)} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Editor (compact) */}
      <section className="card">
        <BudgetEditorCompact
          incomes={state.incomes}
          expenses={state.expenses}
          onIncomeChange={(id, patch) => setIncome(id, patch)}
          onExpenseChange={(id, patch) => setExpense(id, patch)}
          onAddIncome={addIncome}
          onAddExpense={addExpense}
          onRemoveIncome={rmIncome}
          onRemoveExpense={rmExpense}
        />
      </section>

      {/* Pots tracker */}
      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="font-medium">Pots tracker (by month)</h3>
          <button className="px-3 py-2 rounded-lg border hover:bg-gray-50 w-full sm:w-auto" onClick={addPot}>
            + Add pot
          </button>
        </div>

        {/* Mobile cards */}
        <div className="sm:hidden">
          <PotsCardsMobile
            months={state.savingsYear}
            pots={state.pots}
            renamePot={renamePot}
            removePot={removePot}
            setMonthValue={setMonthValue}
            ytdByPot={ytdByPot}
            ytdTotal={ytdTotal}
          />
        </div>

        {/* Desktop table */}
        <div className="hidden sm:block overflow-auto -mx-2">
          <table className="min-w-[680px] mx-2">
            <thead>
              <tr>
                <th>Month</th>
                {state.pots.map((p) => (
                  <th key={p.id} className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <input
                        className="text-right w-40 px-2 py-1 border rounded-lg"
                        value={p.name}
                        onChange={(e) => renamePot(p.id, e.target.value)}
                      />
                      <button
                        className="px-2 py-1 rounded-lg border hover:bg-gray-50"
                        onClick={() => removePot(p.id)}
                        aria-label={`Remove ${p.name}`}
                      >
                        🗑️
                      </button>
                    </div>
                  </th>
                ))}
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {state.savingsYear.map((m, rowIdx) => {
                const rowTotal = round2(state.pots.reduce((s, p) => s + safe(m.values[p.id]), 0));
                return (
                  <tr key={m.month}>
                    <td>{m.month}</td>
                    {state.pots.map((p) => (
                      <td key={p.id} className="text-right">
                        <NumberCell
                          value={safe(m.values[p.id])}
                          onChange={(v) => setMonthValue(rowIdx, p.id, v)}
                        />
                      </td>
                    ))}
                    <td className="text-right">{gbp(rowTotal)}</td>
                  </tr>
                );
              })}
              <tr>
                <td className="font-semibold">YTD</td>
                {state.pots.map((p) => (
                  <td key={p.id} className="text-right font-semibold">{gbp(ytdByPot[p.id] || 0)}</td>
                ))}
                <td className="text-right font-semibold">{gbp(ytdTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex flex-col sm:flex-row gap-2 items-stretch sm:items-center justify-between">
          <button className="px-3 py-2 rounded-lg border hover:bg-gray-50 w-full sm:w-auto" onClick={exportCSV}>
            Export CSV
          </button>
          <button className="px-3 py-2 rounded-lg border hover:bg-gray-50 w-full sm:w-auto" onClick={resetDefaults}>
            Reset to defaults
          </button>
        </div>
      </section>
    </div>
  );
}

/** ---------- Mobile Pots Cards ---------- */
function PotsCardsMobile({
  months,
  pots,
  renamePot,
  removePot,
  setMonthValue,
  ytdByPot,
  ytdTotal,
}: {
  months: SavingsYear;
  pots: Pot[];
  renamePot: (id: string, name: string) => void;
  removePot: (id: string) => void;
  setMonthValue: (monthIdx: number, potId: string, value: number) => void;
  ytdByPot: Record<string, number>;
  ytdTotal: number;
}) {
  return (
    <div className="space-y-3">
      {/* Pot headers inline editor */}
      <div className="p-3 border rounded-xl">
        <div className="text-sm font-medium mb-2">Pot names</div>
        <div className="grid grid-cols-1 gap-2">
          {pots.map((p) => (
            <div key={p.id} className="flex items-center gap-2">
              <input
                className="flex-1 px-2 py-1 border rounded-lg"
                value={p.name}
                onChange={(e) => renamePot(p.id, e.target.value)}
              />
              <button
                className="px-2 py-1 rounded-lg border hover:bg-gray-50"
                onClick={() => removePot(p.id)}
                aria-label={`Remove ${p.name}`}
              >
                🗑️
              </button>
            </div>
          ))}
        </div>
      </div>

      {months.map((m, rowIdx) => {
        const total = round2(pots.reduce((s, p) => s + safe(m.values[p.id]), 0));
        return (
          <div key={m.month} className="p-3 border rounded-xl">
            <div className="font-medium mb-2">{m.month}</div>
            <div className="grid grid-cols-1 gap-2">
              {pots.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2">
                  <div className="text-sm opacity-80">{p.name}</div>
                  <input
                    type="number"
                    step={0.01}
                    className="w-32 text-right px-2 py-1 border rounded-lg"
                    value={Number.isFinite(m.values[p.id]) ? m.values[p.id] : 0}
                    onChange={(e) => setMonthValue(rowIdx, p.id, parseFloat(e.target.value || "0"))}
                  />
                </div>
              ))}
            </div>
            <div className="mt-2 text-right text-sm">
              <span className="opacity-70 mr-2">Total</span>
              <span className="font-semibold">{gbp(total)}</span>
            </div>
          </div>
        );
      })}

      <div className="p-3 border rounded-xl">
        <div className="font-semibold flex items-center justify-between">
          <span>YTD Total</span>
          <span>{gbp(ytdTotal)}</span>
        </div>
        <div className="mt-2 grid grid-cols-1 gap-1 text-sm">
          {pots.map((p) => (
            <div key={p.id} className="flex items-center justify-between">
              <span className="opacity-80">YTD {p.name}</span>
              <span className="font-medium">{gbp(ytdByPot[p.id] || 0)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** ---------- Editor (table + mobile list) ---------- */
function BudgetEditorCompact({
  incomes,
  expenses,
  onIncomeChange,
  onExpenseChange,
  onAddIncome,
  onAddExpense,
  onRemoveIncome,
  onRemoveExpense,
}: {
  incomes: { id: string; label: string; amount: number }[];
  expenses: { id: string; label: string; amount: number }[];
  onIncomeChange: (id: string, patch: Partial<{ label: string; amount: number }>) => void;
  onExpenseChange: (id: string, patch: Partial<{ label: string; amount: number }>) => void;
  onAddIncome: () => void;
  onAddExpense: () => void;
  onRemoveIncome: (id: string) => void;
  onRemoveExpense: (id: string) => void;
}) {
  const [tab, setTab] = React.useState<"income" | "expense">("income");
  const [q, setQ] = React.useState("");
  const [hideZero, setHideZero] = React.useState(false);
  const rows = tab === "income" ? incomes : expenses;
  const onChange = tab === "income" ? onIncomeChange : onExpenseChange;
  const onAdd = tab === "income" ? onAddIncome : onAddExpense;
  const onRemove = tab === "income" ? onRemoveIncome : onRemoveExpense;

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(r => {
      const match = !needle || (r.label || "").toLowerCase().includes(needle);
      const nonZero = !hideZero || Number(r.amount) !== 0;
      return match && nonZero;
    });
  }, [rows, q, hideZero]);

  const total = React.useMemo(
    () => Math.round(filtered.reduce((s, r) => s + (Number.isFinite(r.amount) ? r.amount : 0), 0) * 100) / 100,
    [filtered]
  );

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-full border overflow-hidden" role="tablist" aria-label="Budget editor tabs">
          <button
            role="tab"
            aria-selected={tab === "income"}
            className={`px-4 py-2 text-sm ${tab === "income" ? "bg-[var(--accent-2)] text-white" : ""}`}
            onClick={() => setTab("income")}
          >
            Income
          </button>
          <button
            role="tab"
            aria-selected={tab === "expense"}
            className={`px-4 py-2 text-sm border-l ${tab === "expense" ? "bg-[var(--accent)] text-white" : ""}`}
            onClick={() => setTab("expense")}
          >
            Expenses
          </button>
        </div>

        <div className="flex items-center gap-2 ml-auto w-full sm:w-auto">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${tab === "income" ? "income" : "expenses"}…`}
            className="pl-3 pr-3 py-2 border rounded-xl w-full sm:w-64"
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={hideZero} onChange={(e) => setHideZero(e.target.checked)} />
            Hide £0
          </label>
        </div>
      </div>

      {/* Mobile card list */}
      <div className="sm:hidden space-y-2">
        {filtered.map((r, idx) => (
          <div key={r.id} className="border rounded-xl p-3">
            <input
              className="w-full bg-transparent outline-none mb-2"
              placeholder="Label"
              value={r.label}
              onChange={(e) => onChange(r.id, { label: e.target.value })}
              autoFocus={idx === filtered.length - 1 && !r.label}
            />
            <div className="flex items-center gap-2">
              <input
                type="number"
                step={0.01}
                className="flex-1 text-right bg-transparent outline-none border rounded-lg px-2 py-2"
                value={Number.isFinite(r.amount) ? r.amount : 0}
                onChange={(e) => onChange(r.id, { amount: parseFloat(e.target.value || "0") })}
              />
              <button
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border"
                onClick={() => onRemove(r.id)}
              >
                <span aria-hidden>🗑️</span>
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="px-3 py-6 text-center text-sm opacity-70 border rounded-xl">No rows. Add one below.</div>
        )}
        <div className="flex items-center justify-between gap-3 px-1">
          <button
            className="inline-flex items-center justify-center gap-2 px-3 py-3 rounded-lg border w-full"
            onClick={onAdd}
          >
            <span aria-hidden>➕</span>
            <span>Add {tab === "income" ? "income" : "expense"}</span>
          </button>
          <div className="text-sm whitespace-nowrap">
            <span className="opacity-70 mr-2">Total</span>
            <span className="font-semibold">
              {total.toLocaleString("en-GB", { style: "currency", currency: "GBP" })}
            </span>
          </div>
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block rounded-xl border overflow-hidden">
        <div className="max-h-80 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr>
                <th className="text-left px-3 py-2 w-[60%]">Label</th>
                <th className="text-right px-3 py-2 w-[30%]">Amount (£)</th>
                <th className="px-2 py-2 w-[10%] text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="[&>tr:nth-child(even)]:bg-[rgba(0,0,0,0.02)]">
              {filtered.map((r, idx) => (
                <CompactRow
                  key={r.id}
                  row={r}
                  autoFocus={idx === filtered.length - 1}
                  onChange={(patch) => onChange(r.id, patch)}
                  onRemove={() => onRemove(r.id)}
                />
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-center text-sm opacity-70">
                    No rows. Add one below.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-3 py-2 border-t bg-[var(--card-bg)]">
          <button
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border hover:bg-gray-50"
            onClick={onAdd}
          >
            <span aria-hidden>➕</span>
            <span>Add {tab === "income" ? "income" : "expense"}</span>
          </button>
          <div className="text-sm">
            <span className="opacity-70 mr-2">Total</span>
            <span className="font-semibold">
              {total.toLocaleString("en-GB", { style: "currency", currency: "GBP" })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function CompactRow({
  row,
  autoFocus,
  onChange,
  onRemove,
}: {
  row: { id: string; label: string; amount: number };
  autoFocus?: boolean;
  onChange: (patch: Partial<{ label: string; amount: number }>) => void;
  onRemove: () => void;
}) {
  return (
    <tr className="group">
      <td className="px-3 py-2">
        <input
          className="w-full bg-transparent outline-none"
          placeholder="Label"
          value={row.label}
          onChange={(e) => onChange({ label: e.target.value })}
          autoFocus={autoFocus && !row.label}
        />
      </td>
      <td className="px-3 py-2 text-right">
        <input
          type="number"
          step={0.01}
          className="w-28 sm:w-36 text-right bg-transparent outline-none border rounded-lg px-2 py-1"
          value={Number.isFinite(row.amount) ? row.amount : 0}
          onChange={(e) => onChange({ amount: parseFloat(e.target.value || "0") })}
        />
      </td>
      <td className="px-2 py-2 text-right">
        <button
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border opacity-0 group-hover:opacity-100 transition"
          onClick={onRemove}
          aria-label="Remove row"
        >
          <span aria-hidden>🗑️</span>
        </button>
      </td>
    </tr>
  );
}

/** ---------- Small pieces ---------- */
function NumberCell({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      step={0.01}
      className="w-24 sm:w-28 text-right px-2 py-1 border rounded-lg"
      value={Number.isFinite(value) ? value : 0}
      onChange={(e) => onChange(parseFloat(e.target.value || "0"))}
    />
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 border rounded-2xl bg-[var(--card-bg)]">
      <div className="text-xs opacity-70">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
