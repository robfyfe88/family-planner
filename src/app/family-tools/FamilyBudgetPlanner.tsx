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
import { Trash } from "lucide-react";
import { } from "@/app/app/budget/pots-actions";

import {
    fetchBudgetRows,
    upsertBudgetRow,
    deleteBudgetRow,
} from "@/app/app/budget/actions";

import { fetchPots, upsertPot, deletePot, fetchPotPlans, upsertPotPlan } from "@/app/app/budget/pots-actions";

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
    allocationsYear: number;    
};

const STORE_KEY = "familyBudgetPlanner:v4";

const uid = () =>
    (typeof crypto !== "undefined" && "randomUUID" in crypto)
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2);

const tmpId = () => `tmp_${uid()}`;

const gbp = (n: number) =>
    (isFinite(n) ? n : 0).toLocaleString("en-GB", {
        style: "currency",
        currency: "GBP",
        maximumFractionDigits: 2,
    });

const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
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

function normalizeLabel(s: string) {
    return (s || "").trim().replace(/\s+/g, " ");
}

function useLocalStorageState<T>(
    key: string,
    initialValue: T,
    migrate?: (raw: any) => T
) {
    const [value, setValue] = React.useState<T>(() => {
        if (typeof window === "undefined") return initialValue;
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return initialValue;
            const parsed = JSON.parse(raw);
            return migrate ? migrate(parsed) : (parsed as T);
        } catch {
            return initialValue;
        }
    });

    React.useEffect(() => {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch { }
    }, [key, value]);

    return [value, setValue] as const;
}

function useStickyState<T>(key: string, initial: T) {
    const [value, setValue] = React.useState<T>(() => {
        if (typeof window === "undefined") return initial;
        try {
            const raw = localStorage.getItem(key);
            return raw ? (JSON.parse(raw) as T) : initial;
        } catch {
            return initial;
        }
    });

    React.useEffect(() => {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch { }
    }, [key, value]);

    return [value, setValue] as const;
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
                try { el.select(); } catch { }
            }, 0);
        }
    }, []);
    return { onFocus, onMouseUp, onTouchEnd };
}

function migrateBudgetState(parsed: Partial<BudgetState>): BudgetState {
    const mode: BudgetMode = parsed.mode === "split" ? "split" : "joint";
    const parentAName = parsed.parentAName || "Parent A";
    const parentBName = parsed.parentBName || "Parent B";

    const incomes: Row[] = Array.isArray(parsed.incomes)
        ? parsed.incomes.map((r) => ({ ...r, owner: (r.owner ?? "joint") as Owner }))
        : [];
    const expenses: Row[] = Array.isArray(parsed.expenses)
        ? parsed.expenses.map((r) => ({ ...r, owner: (r.owner ?? "joint") as Owner }))
        : [];

    const pots = Array.isArray(parsed.pots) && parsed.pots.length > 0
        ? parsed.pots
        : [{ id: uid(), name: "Savings" }];

    const allocationsYear = typeof parsed.allocationsYear === "number"
        ? parsed.allocationsYear
        : new Date().getFullYear();

    let savingsYear: SavingsYear;
    if (Array.isArray(parsed.savingsYear) && parsed.savingsYear.length === 12) {
        savingsYear = parsed.savingsYear.map((m, i) => ({
            month: MONTHS[i],
            values: pots.reduce<Record<string, number>>((acc, p) => {
                acc[p.id] = safe(m?.values?.[p.id]);
                return acc;
            }, {}),
        }));
    } else {
        savingsYear = MONTHS.map((m) => ({
            month: m,
            values: pots.reduce<Record<string, number>>((acc, p) => ((acc[p.id] = 0), acc), {}),
        }));
    }

    return { mode, parentAName, parentBName, incomes, expenses, pots, savingsYear, allocationsYear };
}

const initialPotId = uid();
const defaultState: BudgetState = {
    mode: "joint",
    parentAName: "Parent A",
    parentBName: "Parent B",

    incomes: [],
    expenses: [],

    pots: [{ id: initialPotId, name: "Savings" }],
    savingsYear: MONTHS.map((m) => ({ month: m, values: { [initialPotId]: 0 } })),
    allocationsYear: new Date().getFullYear(),
};

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
                <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--border-color)" strokeWidth={stroke} fill="none" />
                <circle
                    cx={size / 2} cy={size / 2} r={r}
                    stroke="var(--accent-2)" strokeWidth={stroke} fill="none"
                    strokeDasharray={dash} strokeLinecap="round"
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

export default function FamilyBudgetPlanner() {
    const [state, setState] = useLocalStorageState<BudgetState>(
        STORE_KEY,
        defaultState,
        migrateBudgetState
    );

    const [summaryMonthIdx, setSummaryMonthIdx] = useLocalStorageState<number>(
        `${STORE_KEY}:summaryMonthIdx`,
        new Date().getMonth()
    );

    const isSmUp = useMedia("(min-width: 640px)", true);
    const currentMonthIndex = new Date().getMonth();
    const currentYear = new Date().getFullYear();

React.useEffect(() => {
  let cancelled = false;

  (async () => {
    try {
      const [rows, pots, plans] = await Promise.all([
        fetchBudgetRows(),
        fetchPots(),
        fetchPotPlans(currentYear), 
      ]);
      if (cancelled) return;

      setState((s) => ({
        ...s,
        incomes: rows.incomes
          .filter((r) => typeof r.id === "string")
          .map((r) => ({ id: r.id as string, label: r.label, amount: r.amount, owner: "joint" as const })),
        expenses: rows.expenses
          .filter((r) => typeof r.id === "string")
          .map((r) => ({ id: r.id as string, label: r.label, amount: r.amount, owner: "joint" as const })),
      }));

      const potList: Pot[] = pots.map((p: any) => ({ id: p.id, name: p.name }));

      const savingsYear: SavingsYear = MONTHS.map((m, i) => ({
        month: m,
        values: Object.fromEntries(
          potList.map((p) => {
            const byMonth = (plans as any)?.byPot?.[p.id] ?? {};
            const val = byMonth[i + 1] ?? 0; 
            return [p.id, round2(val)];
          })
        ) as Record<string, number>,
      }));

      for (const p of pots as any[]) {
        const byMonth = (plans as any)?.byPot?.[p.id];
        const hasAny = byMonth && Object.keys(byMonth).length > 0;
        if (!hasAny) {
          const seed = round2((p.balancePence ?? 0) / 100);
          if (seed !== 0) {
            savingsYear[currentMonthIndex].values[p.id] = seed;
          }
        }
      }

      setState((s) => ({
        ...s,
        pots: potList,
        savingsYear,
        allocationsYear: currentYear,
      }));
    } catch (e) {
      console.warn("Failed to bootstrap budget state; staying with local where needed.", e);
    }
  })();

  return () => { cancelled = true; };
}, [setState, currentMonthIndex, currentYear]);


    React.useEffect(() => {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { }
    }, [state]);

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

    const saveTimers = React.useRef(new Map<string, number>()).current;
    function debounceSave(key: string, fn: () => void, ms = 500) {
        const prev = saveTimers.get(key);
        if (prev) window.clearTimeout(prev);
        const id = window.setTimeout(fn, ms);
        saveTimers.set(key, id);
    }

    const setIncomeLocal = (id: string, patch: Partial<Row>) =>
        setState((st) => ({ ...st, incomes: st.incomes.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));

    const commitIncomeLabel = (id: string, rawLabel: string) => {
        const finalLabel = normalizeLabel(rawLabel);
        if (!finalLabel) return; 
        const curr = state.incomes.find((r) => r.id === id) || { id, label: finalLabel, amount: 0 };
        const nextAmount = curr.amount ?? 0;

        (async () => {
            const saved = await upsertBudgetRow("income", {
                id: id.startsWith("tmp_") ? undefined : id,
                label: finalLabel,
                amount: nextAmount,
            });
            if (saved?.id) {
                setState((s) => ({
                    ...s,
                    incomes: s.incomes.map((r) =>
                        r.id === id ? { ...r, id: saved.id as string, label: saved.label, amount: saved.amount } : r
                    ),
                }));
            }
        })().catch(() => { });
    };

    const setIncomeAmount = (id: string, amount: number) => {
        setIncomeLocal(id, { amount });
        const row = state.incomes.find((r) => r.id === id);
        const label = normalizeLabel(row?.label ?? "");
        if (!label) return; 
        debounceSave(`income:${id}:amount`, async () => {
            try {
                const saved = await upsertBudgetRow("income", {
                    id: id.startsWith("tmp_") ? undefined : id,
                    label,
                    amount,
                });
                if (saved?.id && id.startsWith("tmp_")) {
                    setState((s) => ({
                        ...s,
                        incomes: s.incomes.map((r) =>
                            r.id === id ? { ...r, id: saved.id as string, label: saved.label, amount: saved.amount } : r
                        ),
                    }));
                }
            } catch { }
        }, 500);
    };

    const addIncome = () => {
        const id = tmpId();
        setState((st) => ({
            ...st,
            incomes: [...st.incomes, { id, label: "", amount: 0, owner: st.mode === "split" ? "A" : "joint" }],
        }));
    };

    const rmIncome = async (id: string) => {
        setState((st) => ({ ...st, incomes: st.incomes.filter((r) => r.id !== id) }));
        if (!id.startsWith("tmp_")) {
            try { await deleteBudgetRow(id); } catch { }
        }
    };

    const setExpenseLocal = (id: string, patch: Partial<Row>) =>
        setState((st) => ({ ...st, expenses: st.expenses.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));

    const commitExpenseLabel = (id: string, rawLabel: string) => {
        const finalLabel = normalizeLabel(rawLabel);
        if (!finalLabel) return;
        const curr = state.expenses.find((r) => r.id === id) || { id, label: finalLabel, amount: 0 };
        const nextAmount = curr.amount ?? 0;

        (async () => {
            const saved = await upsertBudgetRow("expense", {
                id: id.startsWith("tmp_") ? undefined : id,
                label: finalLabel,
                amount: nextAmount,
            });
            if (saved?.id) {
                setState((s) => ({
                    ...s,
                    expenses: s.expenses.map((r) =>
                        r.id === id ? { ...r, id: saved.id as string, label: saved.label, amount: saved.amount } : r
                    ),
                }));
            }
        })().catch(() => { });
    };

    const setExpenseAmount = (id: string, amount: number) => {
        setExpenseLocal(id, { amount });
        const row = state.expenses.find((r) => r.id === id);
        const label = normalizeLabel(row?.label ?? "");
        if (!label) return; 
        debounceSave(`expense:${id}:amount`, async () => {
            try {
                const saved = await upsertBudgetRow("expense", {
                    id: id.startsWith("tmp_") ? undefined : id,
                    label,
                    amount,
                });
                if (saved?.id && id.startsWith("tmp_")) {
                    setState((s) => ({
                        ...s,
                        expenses: s.expenses.map((r) =>
                            r.id === id ? { ...r, id: saved.id as string, label: saved.label, amount: saved.amount } : r
                        ),
                    }));
                }
            } catch { }
        }, 500);
    };

    const addExpense = () => {
        const id = tmpId();
        setState((st) => ({
            ...st,
            expenses: [...st.expenses, { id, label: "", amount: 0, owner: st.mode === "split" ? "A" : "joint" }],
        }));
    };

    const rmExpense = async (id: string) => {
        setState((st) => ({ ...st, expenses: st.expenses.filter((r) => r.id !== id) }));
        if (!id.startsWith("tmp_")) {
            try { await deleteBudgetRow(id); } catch { }
        }
    };

    const addPot = async () => {
        try {
            const created = await upsertPot({ name: "New pot" });
            if (!created?.id) return;
            const newId = created.id as string;
            setState((st) => ({
                ...st,
                pots: [...st.pots, { id: newId, name: created.name ?? "New pot" }],
                savingsYear: st.savingsYear.map((m) => ({ ...m, values: { ...m.values, [newId]: 0 } })),
            }));
        } catch { }
    };

    const renamePotLocal = (id: string, name: string) =>
        setState((st) => ({ ...st, pots: st.pots.map((p) => (p.id === id ? { ...p, name } : p)) }));

    const commitPotRename = async (id: string, name: string) => {
        const finalName = normalizeLabel(name);
        if (!finalName) return;
        try { await upsertPot({ id, name: finalName }); } catch { }
    };

    const removePotLocalAndPersist = async (id: string) => {
        setState((st) => ({
            ...st,
            pots: st.pots.filter((p) => p.id !== id),
            savingsYear: st.savingsYear.map((m) => {
                const { [id]: _drop, ...rest } = m.values;
                return { ...m, values: rest };
            }),
        }));
        try { await deletePot(id); } catch { }
    };

    const setMonthValue = (monthIdx: number, potId: string, value: number) => {
        setState((st) => {
            const next = [...st.savingsYear];
            const row = { ...next[monthIdx], values: { ...next[monthIdx].values, [potId]: value } };
            next[monthIdx] = row;
            return { ...st, savingsYear: next };
        });

        debounceSave(`pot:${potId}:${state.allocationsYear}:${monthIdx}`, async () => {
            try {
                await upsertPotPlan({
                    potId,
                    month: monthIdx + 1,
                    year: state.allocationsYear,
                    amount: value,
                });
            } catch { }
        }, 400);
    };

    const resetDefaults = () => setState(defaultState);

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

                        <div className="mt-3 flex flex-wrap items-center gap-3">
                            <div className="inline-flex rounded-full border overflow-hidden">
                                <Button
                                    variant={state.mode === "joint" ? "default" : "ghost"}
                                    className={`px-3 py-1.5 text-sm rounded-none ${state.mode === "joint" ? "" : "bg-transparent"}`}
                                    onClick={() =>
                                        setState((s) => ({
                                            ...s,
                                            mode: "joint",
                                            incomes: s.incomes.map((r) => ({ ...r, owner: (r.owner ?? "joint") as Owner })),
                                            expenses: s.expenses.map((r) => ({ ...r, owner: (r.owner ?? "joint") as Owner })),
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

            <section className="card">
                <BudgetEditorCompact
                    mode={state.mode}
                    parentAName={state.parentAName}
                    parentBName={state.parentBName}
                    incomes={state.incomes}
                    expenses={state.expenses}
                    onIncomeChange={(id, patch) => setIncomeLocal(id, patch)}
                    onExpenseChange={(id, patch) => setExpenseLocal(id, patch)}
                    onIncomeLabelCommit={commitIncomeLabel}
                    onExpenseLabelCommit={commitExpenseLabel}
                    onIncomeAmountChange={setIncomeAmount}
                    onExpenseAmountChange={setExpenseAmount}
                    onAddIncome={addIncome}
                    onAddExpense={addExpense}
                    onRemoveIncome={rmIncome}
                    onRemoveExpense={rmExpense}
                />
            </section>

            <section className="card">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <h3 className="font-medium">Pots tracker (by month) — {state.allocationsYear}</h3>
                    <Button variant="outline" className="w-full sm:w-auto" onClick={addPot}>
                        + Add pot
                    </Button>
                </div>

                <div className="sm:hidden">
                    <PotsCardsMobile
                        months={state.savingsYear}
                        pots={state.pots}
                        renamePot={(id, name) => renamePotLocal(id, name)}
                        removePot={removePotLocalAndPersist}
                        setMonthValue={setMonthValue}
                        ytdByPot={ytdByPot}
                        ytdTotal={ytdTotal}
                    />
                </div>

                <div className="hidden sm:block overflow-auto">
                    <table className="">
                        <thead>
                            <tr>
                                <th>Month</th>
                                {state.pots.map((p) => (
                                    <th key={p.id} className="text-right w-12">
                                        <div className="flex items-center justify-end gap-2">
                                            <Input
                                                className="text-right w-40 bg-white"
                                                value={p.name}
                                                onChange={(e) => renamePotLocal(p.id, e.target.value)}
                                                onBlur={(e) => commitPotRename(p.id, e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                                }}
                                            />
                                            <Button variant="outline" size="icon" onClick={() => removePotLocalAndPersist(p.id)} aria-label={`Remove ${p.name}`}>
                                                <Trash />
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
                                                <Input
                                                    type="number"
                                                    inputMode="decimal"
                                                    step={0.01}
                                                    className="text-right no-spinners"
                                                    value={safe(m.values[p.id])}
                                                    onChange={(e) => setMonthValue(rowIdx, p.id, parseFloat(e.target.value || "0"))}
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
            onWheel={(e) => { (e.target as HTMLInputElement).blur(); }}
            onKeyDown={(e) => { if (e.key === "ArrowUp" || e.key === "ArrowDown") e.preventDefault(); }}
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

function BudgetEditorCompact({
    mode,
    parentAName,
    parentBName,
    incomes,
    expenses,
    onIncomeChange,
    onExpenseChange,
    onIncomeLabelCommit,
    onExpenseLabelCommit,
    onIncomeAmountChange,
    onExpenseAmountChange,
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

    onIncomeLabelCommit: (id: string, label: string) => void;
    onExpenseLabelCommit: (id: string, label: string) => void;
    onIncomeAmountChange: (id: string, amount: number) => void;
    onExpenseAmountChange: (id: string, amount: number) => void;

    onAddIncome: () => void;
    onAddExpense: () => void;
    onRemoveIncome: (id: string) => void;
    onRemoveExpense: (id: string) => void;
}) {
    const [tab, setTab] = useStickyState<"income" | "expense">(`${STORE_KEY}:editor:tab`, "income");
    const [q, setQ] = useStickyState<string>(`${STORE_KEY}:editor:q`, "");
    const [hideZero, setHideZero] = useStickyState<boolean>(`${STORE_KEY}:editor:hideZero`, false);
    const [ownerFilter, setOwnerFilter] = useStickyState<Owner | "all">(`${STORE_KEY}:editor:owner`, "all");

    const rows = tab === "income" ? incomes : expenses;
    const onChange = tab === "income" ? onIncomeChange : onExpenseChange;
    const onLabelCommit = tab === "income" ? onIncomeLabelCommit : onExpenseLabelCommit;
    const onAmountChange = tab === "income" ? onIncomeAmountChange : onExpenseAmountChange;
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

            <div className="sm:hidden space-y-2">
                {filtered.map((r, idx) => (
                    <div key={r.id} className="border rounded-xl p-3">
                        <div className="flex items-center justify-between mb-2">
                            <Input
                                className="flex-1 bg-transparent outline-none mr-2"
                                placeholder="Label"
                                value={r.label}
                                onChange={(e) => onChange(r.id, { label: e.target.value })}
                                onBlur={(e) => onLabelCommit(r.id, e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
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
                                onChange={(e) => onAmountChange(r.id, parseFloat(e.target.value || "0"))}
                                onWheel={(e) => { (e.target as HTMLInputElement).blur(); }}
                                onKeyDown={(e) => { if (e.key === "ArrowUp" || e.key === "ArrowDown") e.preventDefault(); }}
                            />
                            <Button variant="outline" onClick={() => onRemove(r.id)} aria-label="Remove row">
                                <Trash />
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
                                            onBlur={(e) => onLabelCommit(r.id, e.target.value)}
                                            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
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
                                        <NumberCell
                                            value={Number.isFinite(r.amount) ? r.amount : 0}
                                            onChange={(v) => onAmountChange(r.id, v)}
                                        />
                                    </td>
                                    <td className="px-2 py-2 text-right">
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            onClick={() => onRemove(r.id)}
                                            aria-label="Remove row"
                                        >
                                            <Trash />
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
            <div className="p-3 border rounded-xl">
                <div className="text-sm font-medium mb-2">Pot names</div>
                <div className="grid grid-cols-1 gap-2">
                    {pots.map((p) => (
                        <div key={p.id} className="flex items-center gap-2">
                            <Input
                                className="flex-1"
                                value={p.name}
                                onChange={(e) => renamePot(p.id, e.target.value)}
                                onBlur={(e) => {
                                    const ev = new Event("commit"); ev;
                                }}
                            />
                            <Button variant="outline" size="icon" onClick={() => removePot(p.id)} aria-label={`Remove ${p.name}`}>
                                <Trash />
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
