"use client";
import React from "react";

/** ---------------- Types ---------------- */
type Row = { id: string; label: string; amount: number };
type PotMonth = {
    month: string;            // "January"
    taxPot: number;           // “Tax Pot” from your sheet
    savingsPot: number;       // “Savings Pot”
};
type SavingsYear = PotMonth[];

type BudgetState = {
    incomes: Row[];
    expenses: Row[];
    monthlySavings: number;
    savingsYear: SavingsYear;
};

const STORE_KEY = "familyBudgetPlanner:v1";

/** ---------------- Utils ---------------- */
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
    "January", "Febuary", "March", "April", "May", "June",
    "July", "August", "September", "October", "Novermber", "December",
];

/** Sample data based on your workbook */
const defaultState: BudgetState = {
    incomes: [
        { id: uid(), label: "Rob Pay", amount: 3107.42 },
        { id: uid(), label: "Cat Pay", amount: 2070.97 },
        // keep your experiment line here but default to 0 so totals match your sheet unless you need it
        // { id: uid(), label: "Salary Est with EV", amount: 2762.59 },
    ],
    expenses: [
        { id: uid(), label: "Mortgage", amount: 798.2 },
        { id: uid(), label: "Personal Loan", amount: 573.3 },
        { id: uid(), label: "Nursery", amount: 476 },
        { id: uid(), label: "Child Maintenance", amount: 220 },
        { id: uid(), label: "Energy", amount: 216.33 },
        { id: uid(), label: "Council Tax", amount: 189 },
        { id: uid(), label: "Sky", amount: 109 },
        { id: uid(), label: "Car Insurance", amount: 46.64 },
        { id: uid(), label: "Mobile", amount: 39.9 },
        { id: uid(), label: "Amazon Prime", amount: 8.99 },
        { id: uid(), label: "ChatGPT", amount: 17.92 },
        { id: uid(), label: "Car Tax", amount: 16.62 },
        { id: uid(), label: "Boiler", amount: 150.86 },
        { id: uid(), label: "Spotify", amount: 11.99 },
        { id: uid(), label: "Disney+", amount: 8.99 },
        // your “Main account” style items:
        { id: uid(), label: "Groceries", amount: 465.13 },
        { id: uid(), label: "Car Payment", amount: 219.38 },
        { id: uid(), label: "Rob Money", amount: 125 },
        { id: uid(), label: "Cat Money", amount: 125 },
        { id: uid(), label: "Credit Card", amount: 81.49 },
        { id: uid(), label: "Petrol", amount: 80 },
        { id: uid(), label: "Train Travel", amount: 82 },
    ],
    monthlySavings: 967,
    savingsYear: MONTHS.map((m) => ({
        month: m,
        taxPot:
            m === "July" || m === "August" || m === "September" || m === "October"
                ? 554
                : m === "December"
                    ? 552.38
                    : 0,
        savingsPot:
            m === "July" ? 513 :
                m === "August" ? 245 :
                    m === "September" ? 233 :
                        m === "October" ? 233 :
                            0,
    })),
};

/** ---------------- Donut ---------------- */
function Donut({
    fraction,                      // 0..1 (spent)
    size = 180,
    stroke = 14,
    labelTop,
    labelBottom,
}: {
    fraction: number;
    size?: number;
    stroke?: number;
    labelTop?: string;
    labelBottom?: string;
}) {
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const spent = Math.max(0, Math.min(1, fraction));
    const dash = `${spent * c} ${c}`;
    return (
        <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--border-color)" strokeWidth={stroke} fill="none" />
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    stroke="var(--accent-2)"
                    strokeWidth={stroke}
                    fill="none"
                    strokeDasharray={dash}
                    strokeLinecap="round"
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
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

/** ---------------- Main ---------------- */
export default function FamilyBudgetPlanner() {
    const [state, setState] = React.useState<BudgetState>(defaultState);

    // restore
    React.useEffect(() => {
        try {
            const raw = localStorage.getItem(STORE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw) as BudgetState;
            // small guard rails
            if (!Array.isArray(parsed.incomes) || !Array.isArray(parsed.expenses)) return;
            setState(parsed);
        } catch { }
    }, []);

    // persist
    React.useEffect(() => {
        try {
            localStorage.setItem(STORE_KEY, JSON.stringify(state));
        } catch { }
    }, [state]);

    const totalIncome = React.useMemo(
        () => round2(state.incomes.reduce((s, r) => s + safe(r.amount), 0)),
        [state.incomes]
    );
    const totalExpenses = React.useMemo(
        () => round2(state.expenses.reduce((s, r) => s + safe(r.amount), 0)),
        [state.expenses]
    );
    const totalSavings = round2(safe(state.monthlySavings));
    const cashBalance = round2(totalIncome - totalExpenses - totalSavings);
    const pctSpent = totalIncome > 0 ? totalExpenses / totalIncome : 0;

    const ytdTax = round2(state.savingsYear.reduce((s, m) => s + safe(m.taxPot), 0));
    const ytdSavings = round2(state.savingsYear.reduce((s, m) => s + safe(m.savingsPot), 0));
    const ytdTotal = round2(ytdTax + ytdSavings);

    // handlers
    const setIncome = (id: string, patch: Partial<Row>) =>
        setState((st) => ({ ...st, incomes: st.incomes.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
    const addIncome = () => setState((st) => ({ ...st, incomes: [...st.incomes, { id: uid(), label: "", amount: 0 }] }));
    const rmIncome = (id: string) => setState((st) => ({ ...st, incomes: st.incomes.filter((r) => r.id !== id) }));

    const setExpense = (id: string, patch: Partial<Row>) =>
        setState((st) => ({ ...st, expenses: st.expenses.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
    const addExpense = () => setState((st) => ({ ...st, expenses: [...st.expenses, { id: uid(), label: "", amount: 0 }] }));
    const rmExpense = (id: string) => setState((st) => ({ ...st, expenses: st.expenses.filter((r) => r.id !== id) }));

    const setMonth = (idx: number, patch: Partial<PotMonth>) =>
        setState((st) => {
            const next = [...st.savingsYear];
            next[idx] = { ...next[idx], ...patch };
            return { ...st, savingsYear: next };
        });

    const resetDefaults = () => setState(defaultState);

    const exportCSV = () => {
        const lines: string[] = [];
        lines.push("Section,Label,Amount");
        for (const r of state.incomes) lines.push(`Income,"${csv(r.label)}",${safe(r.amount)}`);
        for (const r of state.expenses) lines.push(`Expense,"${csv(r.label)}",${safe(r.amount)}`);
        lines.push(`Savings,Monthly Savings,${safe(state.monthlySavings)}`);
        lines.push(""); lines.push("Month,Tax Pot,Savings Pot,Total");
        for (const m of state.savingsYear) lines.push(`"${csv(m.month)}",${safe(m.taxPot)},${safe(m.savingsPot)},${safe(m.taxPot) + safe(m.savingsPot)}`);
        downloadText("family-budget.csv", lines.join("\n"));
    };

    return (
        <div className="space-y-6">
            {/* Summary */}
            <section className="card">
                <div className="grid lg:grid-cols-5 gap-6 items-center">
                    <div className="lg:col-span-2">
                        <h2 className="text-lg font-medium mb-3">Summary</h2>
                        <div className="grid sm:grid-cols-2 gap-3">
                            <Stat label="Total monthly income" value={gbp(totalIncome)} />
                            <Stat label="Total monthly expenses" value={gbp(totalExpenses)} />
                            <Stat label="Monthly savings" value={`- ${gbp(totalSavings)}`} />
                            <Stat label="Cash balance" value={gbp(cashBalance)} />
                        </div>
                        <p className="text-xs opacity-70 mt-2">
                            % spent = expenses ÷ income (same as your sheet). Balance = income − expenses − savings.
                        </p>
                    </div>
                    <div className="flex items-center justify-center">
                        <Donut fraction={pctSpent} labelTop="Spent" labelBottom={`${gbp(totalIncome - totalExpenses)} left (pre-savings)`} />
                    </div>
                    <div className="lg:col-span-2">
                        <h2 className="text-lg font-medium mb-3">Savings</h2>
                        <div className="grid sm:grid-cols-2 gap-3">
                            <Stat label="YTD Tax Pot" value={gbp(ytdTax)} />
                            <Stat label="YTD Savings Pot" value={gbp(ytdSavings)} />
                            <Stat label="YTD Total" value={gbp(ytdTotal)} />
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

            {/* Savings Tracker (Year) */}
            <section className="card">
                <h3 className="font-medium mb-3">Savings tracker (Tax & Savings pots)</h3>
                <div className="overflow-auto -mx-2">
                    <table className="min-w-[560px] mx-2">
                        <thead>
                            <tr>
                                <th>Month</th>
                                <th className="text-right">Tax Pot</th>
                                <th className="text-right">Savings Pot</th>
                                <th className="text-right">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {state.savingsYear.map((m, idx) => {
                                const total = round2(safe(m.taxPot) + safe(m.savingsPot));
                                return (
                                    <tr key={m.month}>
                                        <td>{m.month}</td>
                                        <td className="text-right">
                                            <NumberCell
                                                value={m.taxPot}
                                                onChange={(v) => setMonth(idx, { taxPot: v })}
                                            />
                                        </td>
                                        <td className="text-right">
                                            <NumberCell
                                                value={m.savingsPot}
                                                onChange={(v) => setMonth(idx, { savingsPot: v })}
                                            />
                                        </td>
                                        <td className="text-right">{gbp(total)}</td>
                                    </tr>
                                );
                            })}
                            <tr>
                                <td className="font-semibold">YTD</td>
                                <td className="text-right font-semibold">{gbp(ytdTax)}</td>
                                <td className="text-right font-semibold">{gbp(ytdSavings)}</td>
                                <td className="text-right font-semibold">{gbp(ytdTotal)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}

/** ---------------- Tiny pieces ---------------- */
function RowEditor({
    row,
    onChange,
    onRemove,
}: {
    row: Row;
    onChange: (patch: Partial<Row>) => void;
    onRemove: () => void;
}) {
    return (
        <div className="flex items-center gap-2 border rounded-xl px-3 py-2">
            <input
                className="flex-1 min-w-0"
                placeholder="Label"
                value={row.label}
                onChange={(e) => onChange({ label: e.target.value })}
            />
            <input
                type="number"
                step={0.01}
                className="w-40 text-right"
                value={row.amount}
                onChange={(e) => onChange({ amount: parseFloat(e.target.value || "0") })}
            />
            <button
                className="px-2 py-1 rounded-lg border hover:bg-gray-50"
                onClick={onRemove}
                aria-label="Remove row"
                title="Remove"
            >
                ✖
            </button>
        </div>
    );
}

function NumberCell({ value, onChange }: { value: number; onChange: (v: number) => void }) {
    return (
        <input
            type="number"
            step={0.01}
            className="w-28 text-right px-2 py-1 border rounded-lg"
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

/** ---------------- helpers ---------------- */
function safe(n: any): number {
    const v = typeof n === "number" ? n : parseFloat(n ?? "0");
    return Number.isFinite(v) ? v : 0;
}
function round2(n: number) {
    return Math.round(n * 100) / 100;
}
function csv(s: string) {
    return (s ?? "").replace(/"/g, '""');
}
function downloadText(filename: string, text: string) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

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
      const match = !needle || r.label.toLowerCase().includes(needle);
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

        <div className="flex items-center gap-2 ml-auto">
          <div className="relative">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`Search ${tab === "income" ? "income" : "expenses"}…`}
              className="pl-12 pr-3 py-2 border rounded-xl w-64"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={hideZero} onChange={(e) => setHideZero(e.target.checked)} />
            Hide £0
          </label>
        </div>
      </div>

      <div className="rounded-xl border overflow-hidden">
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
                  autoFocus={idx === filtered.length - 1} // focus last added
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
          className="w-36 text-right bg-transparent outline-none border rounded-lg px-2 py-1"
          value={Number.isFinite(row.amount) ? row.amount : 0}
          onChange={(e) => onChange({ amount: parseFloat(e.target.value || "0") })}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp") {
              e.preventDefault();
              onChange({ amount: Number(row.amount || 0) + 1 });
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              onChange({ amount: Number(row.amount || 0) - 1 });
            }
          }}
        />
      </td>
      <td className="px-2 py-2 text-right">
        <button
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border opacity-0 group-hover:opacity-100 transition"
          onClick={onRemove}
          title="Remove"
          aria-label="Remove row"
        >
          <span aria-hidden>🗑️</span>
          <span className="text-xs">Remove</span>
        </button>
      </td>
    </tr>
  );
}

