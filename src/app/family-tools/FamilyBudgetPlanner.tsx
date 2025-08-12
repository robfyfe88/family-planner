"use client";

import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

/** ---------- Types ---------- */
type Owner = "joint" | "A" | "B";
type Row = { id: string; label: string; amount: number; owner?: Owner };

type Pot = { id: string; name: string };
type PotMonth = { month: string; values: Record<string, number> };
type SavingsYear = PotMonth[];

type BudgetMode = "joint" | "split";

type BudgetState = {
  mode: BudgetMode;
  parentAName: string;
  parentBName: string;

  incomes: Row[];
  expenses: Row[];

  pots: Pot[];
  savingsYear: SavingsYear;
};

const STORE_KEY = "familyBudgetPlanner:v4";

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

function useSelectAllInputProps() {
  const onFocus = React.useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.select();
  }, []);

  const onMouseUp = React.useCallback((e: React.MouseEvent<HTMLInputElement>) => {
    e.preventDefault();
  }, []);

  const onTouchEnd = React.useCallback((e: React.TouchEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    if (el.selectionStart === el.selectionEnd) {
      setTimeout(() => {
        try { el.select(); } catch {}
      }, 0);
    }
  }, []);

  return { onFocus, onMouseUp, onTouchEnd };
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

function sumByOwner(rows: Row[]) {
  const acc = { joint: 0, A: 0, B: 0, total: 0 };
  for (const r of rows) {
    const owner: Owner = r.owner ?? "joint";
    const val = safe(r.amount);
    acc[owner] += val;
    acc.total += val;
  }
  return {
    joint: round2(acc.joint),
    A: round2(acc.A),
    B: round2(acc.B),
    total: round2(acc.total),
  };
}

/** ---------- Defaults ---------- */
const initialPotId = uid();
const defaultState: BudgetState = {
  mode: "joint",
  parentAName: "Parent A",
  parentBName: "Parent B",

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

      // --- migration / guards ---
      const mode: BudgetMode = parsed.mode === "split" ? "split" : "joint";
      const parentAName = parsed.parentAName || "Parent A";
      const parentBName = parsed.parentBName || "Parent B";

      const incomes: Row[] = Array.isArray(parsed.incomes) ? parsed.incomes.map((r) => ({ ...r, owner: r.owner ?? "joint" })) : [];
      const expenses: Row[] = Array.isArray(parsed.expenses) ? parsed.expenses.map((r) => ({ ...r, owner: r.owner ?? "joint" })) : [];

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
        mode,
        parentAName,
        parentBName,
        incomes,
        expenses,
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
  const incomeTotals = React.useMemo(() => sumByOwner(state.incomes), [state.incomes]);
  const expenseTotals = React.useMemo(() => sumByOwner(state.expenses), [state.expenses]);

  const totalIncome = incomeTotals.total;
  const totalExpenses = expenseTotals.total;

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
  const addIncome = () => setState((st) => ({ ...st, incomes: [...st.incomes, { id: uid(), label: "", amount: 0, owner: st.mode === "split" ? "A" : "joint" }] }));
  const rmIncome = (id: string) => setState((st) => ({ ...st, incomes: st.incomes.filter((r) => r.id !== id) }));

  const setExpense = (id: string, patch: Partial<Row>) =>
    setState((st) => ({ ...st, expenses: st.expenses.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  const addExpense = () => setState((st) => ({ ...st, expenses: [...st.expenses, { id: uid(), label: "", amount: 0, owner: st.mode === "split" ? "A" : "joint" }] }));
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
    lines.push("Section,Owner,Label,Amount");
    const ownerLabel = (o?: Owner) => (o ?? "joint");
    for (const r of state.incomes) lines.push(`Income,${ownerLabel(r.owner)},"${csv(r.label)}",${safe(r.amount)}`);
    for (const r of state.expenses) lines.push(`Expense,${ownerLabel(r.owner)},"${csv(r.label)}",${safe(r.amount)}`);
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
              <div className="flex items-center gap-2">
                <label className="text-sm flex items-center gap-2">
                  <span>Summary month</span>
                  <Select
                    value={String(summaryMonthIdx)}
                    onValueChange={(v) => setSummaryMonthIdx(parseInt(v, 10))}
                  >
                    <SelectTrigger className="w-40 h-9">
                      <SelectValue placeholder="Select month" />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((m, i) => (
                        <SelectItem key={m} value={String(i)}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
              </div>
            </div>

            {/* Mode + names */}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <div className="inline-flex rounded-full border overflow-hidden">
                <Button
                  variant={state.mode === "joint" ? "default" : "ghost"}
                  className={`px-3 py-1.5 text-sm rounded-none ${state.mode === "joint" ? "" : "bg-transparent"}`}
                  onClick={() =>
                    setState((s) => ({
                      ...s,
                      mode: "joint",
                      incomes: s.incomes.map((r) => ({ ...r, owner: r.owner ?? "joint" })),
                      expenses: s.expenses.map((r) => ({ ...r, owner: r.owner ?? "joint" })),
                    }))
                  }
                >
                  Joint
                </Button>
                <Button
                  variant={state.mode === "split" ? "default" : "ghost"}
                  className={`px-3 py-1.5 text-sm rounded-none border-l ${state.mode === "split" ? "" : "bg-transparent"}`}
                  onClick={() => setState((s) => ({ ...s, mode: "split" }))}
                >
                  Split by person
                </Button>
              </div>

              {state.mode === "split" && (
                <div className="flex items-center gap-2">
                  <Input
                    className="px-2 py-1 h-9 w-36"
                    value={state.parentAName}
                    onChange={(e) => setState((s) => ({ ...s, parentAName: e.target.value || "Parent A" }))}
                    placeholder="Parent A"
                  />
                  <Input
                    className="px-2 py-1 h-9 w-36"
                    value={state.parentBName}
                    onChange={(e) => setState((s) => ({ ...s, parentBName: e.target.value || "Parent B" }))}
                    placeholder="Parent B"
                  />
                </div>
              )}
            </div>

            <div className="mt-3 grid grid-cols-2 sm:grid-cols-2 gap-3">
              <Stat label="Total monthly income" value={gbp(totalIncome)} />
              <Stat label="Total monthly expenses" value={gbp(totalExpenses)} />
              <Stat label={`Monthly savings (${MONTHS[summaryMonthIdx]})`} value={`- ${gbp(monthlySavings)}`} />
              <Stat label="Cash balance" value={gbp(cashBalance)} />
            </div>

            {state.mode === "split" && (
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Stat label={`${state.parentAName} income`} value={gbp(incomeTotals.A)} />
                <Stat label={`${state.parentBName} income`} value={gbp(incomeTotals.B)} />
                <Stat label={`Joint income`} value={gbp(incomeTotals.joint)} />

                <Stat label={`${state.parentAName} expenses`} value={gbp(expenseTotals.A)} />
                <Stat label={`${state.parentBName} expenses`} value={gbp(expenseTotals.B)} />
                <Stat label={`Joint expenses`} value={gbp(expenseTotals.joint)} />
              </div>
            )}

            <p className="text-xs opacity-70 mt-2">
              Balance = income − expenses − pots for the selected month. In split mode, rows are tagged per person or joint.
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
          mode={state.mode}
          parentAName={state.parentAName}
          parentBName={state.parentBName}
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
          <Button variant="outline" className="w-full sm:w-auto" onClick={addPot}>
            + Add pot
          </Button>
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
        <div className="hidden sm:block overflow-auto">
          <table className="">
            <thead>
              <tr>
                <th>Month</th>
                {state.pots.map((p) => (
                  <th key={p.id} className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Input
                        className="text-right w-40"
                        value={p.name}
                        onChange={(e) => renamePot(p.id, e.target.value)}
                      />
                      <Button variant="outline" size="icon" onClick={() => removePot(p.id)} aria-label={`Remove ${p.name}`}>
                        🗑️
                      </Button>
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
          <Button variant="outline" className="w-full sm:w-auto" onClick={exportCSV}>
            Export CSV
          </Button>
          <Button variant="outline" className="w-full sm:w-auto" onClick={resetDefaults}>
            Reset to defaults
          </Button>
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
  const selectAll = useSelectAllInputProps();

  return (
    <div className="space-y-3">
      {/* Pot headers inline editor */}
      <div className="p-3 border rounded-xl">
        <div className="text-sm font-medium mb-2">Pot names</div>
        <div className="grid grid-cols-1 gap-2">
          {pots.map((p) => (
            <div key={p.id} className="flex items-center gap-2">
              <Input
                className="flex-1"
                value={p.name}
                onChange={(e) => renamePot(p.id, e.target.value)}
              />
              <Button variant="outline" size="icon" onClick={() => removePot(p.id)} aria-label={`Remove ${p.name}`}>
                🗑️
              </Button>
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
                  <Input
                    type="number"
                    inputMode="decimal"
                    step={0.01}
                    className="w-32 text-right no-spinners"
                    value={Number.isFinite(m.values[p.id]) ? m.values[p.id] : 0}
                    onChange={(e) => setMonthValue(rowIdx, p.id, parseFloat(e.target.value || "0"))}
                    onWheel={(e) => { (e.target as HTMLInputElement).blur(); }}
                    onKeyDown={(e) => { if (e.key === "ArrowUp" || e.key === "ArrowDown") e.preventDefault(); }}
                    {...selectAll}
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
  mode,
  parentAName,
  parentBName,
  incomes,
  expenses,
  onIncomeChange,
  onExpenseChange,
  onAddIncome,
  onAddExpense,
  onRemoveIncome,
  onRemoveExpense,
}: {
  mode: BudgetMode;
  parentAName: string;
  parentBName: string;

  incomes: { id: string; label: string; amount: number; owner?: Owner }[];
  expenses: { id: string; label: string; amount: number; owner?: Owner }[];

  onIncomeChange: (id: string, patch: Partial<{ label: string; amount: number; owner: Owner }>) => void;
  onExpenseChange: (id: string, patch: Partial<{ label: string; amount: number; owner: Owner }>) => void;
  onAddIncome: () => void;
  onAddExpense: () => void;
  onRemoveIncome: (id: string) => void;
  onRemoveExpense: (id: string) => void;
}) {
  const [tab, setTab] = React.useState<"income" | "expense">("income");
  const [q, setQ] = React.useState("");
  const [hideZero, setHideZero] = React.useState(false);
  const [ownerFilter, setOwnerFilter] = React.useState<Owner | "all">("all");

  const rows = tab === "income" ? incomes : expenses;
  const onChange = tab === "income" ? onIncomeChange : onExpenseChange;
  const onAdd = tab === "income" ? onAddIncome : onAddExpense;
  const onRemove = tab === "income" ? onRemoveIncome : onRemoveExpense;
  const selectAll = useSelectAllInputProps();

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(r => {
      const match = !needle || (r.label || "").toLowerCase().includes(needle);
      const nonZero = !hideZero || Number(r.amount) !== 0;
      const owner = r.owner ?? "joint";
      const ownerOk = ownerFilter === "all" || owner === ownerFilter;
      return match && nonZero && ownerOk;
    });
  }, [rows, q, hideZero, ownerFilter]);

  const total = React.useMemo(
    () => Math.round(filtered.reduce((s, r) => s + (Number.isFinite(r.amount) ? r.amount : 0), 0) * 100) / 100,
    [filtered]
  );

  const OwnerBadge = ({ owner }: { owner: Owner }) => {
    const map: Record<Owner, string> = {
      joint: "bg-gray-100 text-gray-700",
      A: "bg-[var(--accent-2)]/15 text-[var(--accent-2)]",
      B: "bg-[var(--accent)]/15 text-[var(--accent)]",
    };
    const txt = owner === "joint" ? "Joint" : owner === "A" ? parentAName : parentBName;
    return <span className={`px-2 py-0.5 rounded-full text-[11px] ${map[owner]}`}>{txt}</span>;
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-full border overflow-hidden" role="tablist" aria-label="Budget editor tabs">
          <Button
            role="tab"
            variant={tab === "income" ? "default" : "ghost"}
            aria-selected={tab === "income"}
            className="px-4 py-2 text-sm rounded-none"
            onClick={() => setTab("income")}
          >
            Income
          </Button>
          <Button
            role="tab"
            variant={tab === "expense" ? "default" : "ghost"}
            aria-selected={tab === "expense"}
            className="px-4 py-2 text-sm rounded-none border-l"
            onClick={() => setTab("expense")}
          >
            Expenses
          </Button>
        </div>

        <div className="flex items-center gap-2 ml-auto w-full sm:w-auto">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${tab === "income" ? "income" : "expenses"}…`}
            className="pl-3 pr-3 py-2 w-full sm:w-64"
          />
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={hideZero}
              onCheckedChange={(v) => setHideZero(Boolean(v))}
              aria-label="Hide zero amounts"
            />
            Hide £0
          </label>
        </div>
      </div>

      {/* Owner filter (split mode only) */}
      {mode === "split" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm opacity-70">Filter:</span>
          <div className="inline-flex rounded-full border overflow-hidden">
            {(["all","joint","A","B"] as const).map((o) => (
              <Button
                key={o}
                variant={ownerFilter === o ? "default" : "ghost"}
                className="px-3 py-1.5 text-sm rounded-none"
                onClick={() => setOwnerFilter(o)}
              >
                {o === "all" ? "All" : o === "joint" ? "Joint" : o === "A" ? parentAName : parentBName}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Mobile card list */}
      <div className="sm:hidden space-y-2">
        {filtered.map((r, idx) => (
          <div key={r.id} className="border rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <Input
                className="flex-1 bg-transparent outline-none mr-2"
                placeholder="Label"
                value={r.label}
                onChange={(e) => onChange(r.id, { label: e.target.value })}
                autoFocus={idx === filtered.length - 1 && !r.label}
              />
              {mode === "split" && (
                <Select
                  value={(r.owner ?? "joint") as string}
                  onValueChange={(val) => onChange(r.id, { owner: val as Owner })}
                >
                  <SelectTrigger className="w-36 h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="joint">Joint</SelectItem>
                    <SelectItem value="A">{parentAName}</SelectItem>
                    <SelectItem value="B">{parentBName}</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                inputMode="decimal"
                step={0.01}
                className="flex-1 text-right bg-transparent no-spinners"
                value={Number.isFinite(r.amount) ? r.amount : 0}
                onChange={(e) => onChange(r.id, { amount: parseFloat(e.target.value || "0") })}
                onWheel={(e) => { (e.target as HTMLInputElement).blur(); }}
                onKeyDown={(e) => { if (e.key === "ArrowUp" || e.key === "ArrowDown") e.preventDefault(); }}
                {...selectAll}
              />
              <Button variant="outline" onClick={() => onRemove(r.id)} aria-label="Remove row">
                🗑️
              </Button>
            </div>
            {mode === "split" && (
              <div className="mt-2"><OwnerBadge owner={r.owner ?? "joint"} /></div>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="px-3 py-6 text-center text-sm opacity-70 border rounded-xl">No rows. Add one below.</div>
        )}
        <div className="flex items-center justify-between gap-3 px-1">
          <Button variant="outline" className="w-1/2" onClick={onAdd}>
            ➕ Add {tab === "income" ? "income" : "expense"}
          </Button>
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
                <th className="text-left px-3 py-2 w-[48%]">Label</th>
                {mode === "split" && <th className="text-left px-3 py-2 w-[22%]">Owner</th>}
                <th className="text-right px-3 py-2 w-[22%]">Amount (£)</th>
                <th className="px-2 py-2 w-[8%] text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="[&>tr:nth-child(even)]:bg-[rgba(0,0,0,0.02)]">
              {filtered.map((r, idx) => (
                <tr key={r.id} className="group">
                  <td className="px-3 py-2">
                    <Input
                      className="w-full bg-transparent"
                      placeholder="Label"
                      value={r.label}
                      onChange={(e) => onChange(r.id, { label: e.target.value })}
                      autoFocus={idx === filtered.length - 1 && !r.label}
                    />
                  </td>
                  {mode === "split" && (
                    <td className="px-3 py-2">
                      <Select
                        value={(r.owner ?? "joint") as string}
                        onValueChange={(val) => onChange(r.id, { owner: val as Owner })}
                      >
                        <SelectTrigger className="w-full h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="joint">Joint</SelectItem>
                          <SelectItem value="A">{parentAName}</SelectItem>
                          <SelectItem value="B">{parentBName}</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                  )}
                  <td className="px-3 py-2 text-right">
                    <Input
                      type="number"
                      inputMode="decimal"
                      step={0.01}
                      className="w-28 sm:w-36 text-right no-spinners"
                      value={Number.isFinite(r.amount) ? r.amount : 0}
                      onChange={(e) => onChange(r.id, { amount: parseFloat(e.target.value || "0") })}
                      onWheel={(e) => { (e.target as HTMLInputElement).blur(); }}
                      onKeyDown={(e) => { if (e.key === "ArrowUp" || e.key === "ArrowDown") e.preventDefault(); }}
                      {...selectAll}
                    />
                  </td>
                  <td className="px-2 py-2 text-right">
                    <Button
                      variant="outline"
                      size="icon"
                      className="opacity-0 group-hover:opacity-100 transition"
                      onClick={() => onRemove(r.id)}
                      aria-label="Remove row"
                    >
                      🗑️
                    </Button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={mode === "split" ? 4 : 3} className="px-3 py-6 text-center text-sm opacity-70">
                    No rows. Add one below.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-3 py-2 border-t bg-[var(--card-bg)]">
          <Button variant="outline" onClick={onAdd}>
            ➕ Add {tab === "income" ? "income" : "expense"}
          </Button>
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

function NumberCell({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const selectAll = useSelectAllInputProps();

  return (
    <Input
      type="number"
      inputMode="decimal"
      step={0.01}
      className="w-24 sm:w-28 text-right no-spinners"
      value={Number.isFinite(value) ? value : 0}
      onChange={(e) => onChange(parseFloat(e.target.value || "0"))}
      onWheel={(e) => {
        (e.target as HTMLInputElement).blur();
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowUp" || e.key === "ArrowDown") e.preventDefault();
      }}
      {...selectAll}
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
