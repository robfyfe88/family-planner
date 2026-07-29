"use client";

import React from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CreditCard,
  FileUp,
  Filter,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  Trash2,
  WalletCards,
  X,
} from "lucide-react";
import {
  deleteBudgetRowScoped,
  fetchBudgetRowsForMonth,
  saveCommitment,
  upsertBudgetRowScoped,
  type Row as BudgetRow,
  type Scope,
} from "@/app/app/budget/actions";
import {
  addManualTransaction,
  deleteMoneyTransaction,
  fetchMoneyWorkspace,
  importStatementRows,
  removeCategoryRule,
  saveCategoryRule,
  setTransactionCategory,
} from "@/app/app/budget/workspace-actions";
import {
  fetchUnforeseenBuffer,
  saveUnforeseenBuffer,
} from "@/app/app/budget/freedom-actions";
import {
  allocateDebtOverpayment,
  canReceiveOverpayment,
  orderDebts,
  overpaymentCapacity,
} from "@/lib/debt-plan";

type Workspace = Awaited<ReturnType<typeof fetchMoneyWorkspace>>;
type WorkspaceTransaction = Workspace["transactions"][number];
type WorkspaceCategory = Workspace["categories"][number];
type WorkspaceView = "transactions" | "categories" | "plan" | "rules";
type Debt = { id: string; name: string; balance: number; apr: number; minimum: number; promotionalEndDate: string };
type Goal = { id: string; name: string; target: number; saved: number; monthly: number; targetDate: string };

type ModernMonthlyPlanProps = {
  debts?: Debt[];
  goals?: Goal[];
  strategy?: "avalanche" | "snowball";
  emergencyFundMonths?: number;
  forecastDebtExtra?: number;
  forecastSavingsContribution?: number;
  onFinanceChanged?: () => void;
};

const money = (value: number, digits = 2) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number.isFinite(value) ? value : 0);

const roundMoney = (value: number) => Math.round((Number(value) || 0) * 100) / 100;
const selectNumericValue = (event: React.FocusEvent<HTMLInputElement>) => event.currentTarget.select();

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const UNFORESEEN_LABEL = "Unforeseen monthly costs";
const FLEX_ALLOWANCES = [
  {
    label: "Joint family spending",
    note: "Treats, days out and shared extras for the boys.",
  },
] as const;

const COMMITMENT_CATEGORIES = [
  "Home & household",
  "Food & essentials",
  "Family & childcare",
  "Transport",
  "Subscriptions",
  "Personal spending",
  "Other commitments",
] as const;

const guessCommitmentCategory = (label: string) => {
  const value = label.trim().toLowerCase();
  if (/(mortgage|council tax|energy|octopus|boiler|insurance|ageas|water|virgin|broadband|mobile|phone)/.test(value)) return "Home & household";
  if (/(grocer|food|aldi|lidl|tesco|asda|sainsbury)/.test(value)) return "Food & essentials";
  if (/(child|school|nursery|maintenance|laura|club|lesson)/.test(value)) return "Family & childcare";
  if (/(travel|transport|fuel|car|dvla|train|bus)/.test(value)) return "Transport";
  if (/(spotify|disney|netflix|now tv|chat ?gpt|subscription|ps5|playstation)/.test(value)) return "Subscriptions";
  if (/(spending|pocket money|allowance)/.test(value)) return "Personal spending";
  return "Other commitments";
};

const isFlexAllowance = (label: string) =>
  label.trim().toLowerCase() === UNFORESEEN_LABEL.toLowerCase() ||
  FLEX_ALLOWANCES.some((item) => item.label.toLowerCase() === label.trim().toLowerCase());

const categoryTone = (name: string) => {
  const tones = ["mint", "blue", "coral", "lavender", "gold", "slate"];
  return tones[[...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % tones.length];
};

function estimateDebtFreeMonths(
  debts: Debt[],
  strategy: "avalanche" | "snowball",
  extraPayment: number
) {
  const working = debts
    .filter((debt) => debt.balance > 0)
    .map((debt) => ({ ...debt }));
  if (working.length === 0) return 0;

  const monthlyBudget = working.reduce((sum, debt) => sum + debt.minimum, 0) + Math.max(0, extraPayment);
  if (monthlyBudget <= 0) return 600;

  let months = 0;
  while (working.some((debt) => debt.balance > 0.005) && months < 600) {
    months += 1;
    working.forEach((debt) => {
      if (debt.balance > 0) debt.balance += debt.balance * (debt.apr / 100 / 12);
    });
    let remaining = monthlyBudget;
    working.forEach((debt) => {
      if (debt.balance <= 0 || remaining <= 0) return;
      const payment = Math.min(debt.balance, debt.minimum, remaining);
      debt.balance -= payment;
      remaining -= payment;
    });
    const ordered = orderDebts(
      working.filter((debt) => debt.balance > 0 && canReceiveOverpayment(debt)),
      strategy
    );
    ordered.forEach((debt) => {
      if (remaining <= 0) return;
      const payment = Math.min(debt.balance, remaining);
      debt.balance -= payment;
      remaining -= payment;
    });
  }
  return months;
}

function projectDebtsForward(
  debts: Debt[],
  strategy: "avalanche" | "snowball",
  monthlyExtra: number,
  months: number
) {
  const working = debts.map((debt) => ({ ...debt }));
  const monthlyDebtBudget = roundMoney(
    working.reduce((sum, debt) => sum + debt.minimum, 0) + Math.max(0, monthlyExtra)
  );
  for (let month = 0; month < months; month += 1) {
    working.forEach((debt) => {
      if (debt.balance <= 0) return;
      debt.balance = roundMoney(debt.balance + debt.balance * (debt.apr / 100 / 12));
    });

    let remainingBudget = monthlyDebtBudget;
    working.forEach((debt) => {
      if (debt.balance <= 0 || remainingBudget <= 0) return;
      const payment = Math.min(debt.balance, debt.minimum, remainingBudget);
      debt.balance = roundMoney(Math.max(0, debt.balance - payment));
      remainingBudget = roundMoney(remainingBudget - payment);
    });

    const ordered = orderDebts(
      working.filter((debt) => debt.balance > 0 && canReceiveOverpayment(debt)),
      strategy
    );
    ordered.forEach((debt) => {
      if (remainingBudget <= 0) return;
      const payment = Math.min(debt.balance, remainingBudget);
      debt.balance = roundMoney(Math.max(0, debt.balance - payment));
      remainingBudget = roundMoney(remainingBudget - payment);
    });
  }

  return working.map((debt) => ({
    ...debt,
    balance: roundMoney(debt.balance),
    minimum: roundMoney(Math.min(debt.minimum, debt.balance)),
  }));
}

export default function ModernMonthlyPlan({
  debts = [],
  goals = [],
  strategy = "avalanche",
  emergencyFundMonths = 3,
  forecastDebtExtra = 0,
  forecastSavingsContribution = 0,
  onFinanceChanged,
}: ModernMonthlyPlanProps) {
  const now = new Date();
  const [cursor, setCursor] = React.useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [view, setView] = React.useState<WorkspaceView>("plan");
  const [data, setData] = React.useState<Workspace | null>(null);
  const [plannedIncome, setPlannedIncome] = React.useState(0);
  const [plannedExpenses, setPlannedExpenses] = React.useState(0);
  const [incomeRows, setIncomeRows] = React.useState<BudgetRow[]>([]);
  const [committedBills, setCommittedBills] = React.useState<BudgetRow[]>([]);
  const [flexAllowances, setFlexAllowances] = React.useState<BudgetRow[]>([]);
  const [unforeseenBuffer, setUnforeseenBuffer] = React.useState({ target: 0, balance: 0 });
  const [savingBuffer, setSavingBuffer] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [savingIncomeId, setSavingIncomeId] = React.useState<string | null>(null);
  const [savingCommitmentId, setSavingCommitmentId] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [categoryFilter, setCategoryFilter] = React.useState("all");
  const [reviewOnly, setReviewOnly] = React.useState(false);
  const [modal, setModal] = React.useState<"add" | "income" | "commitment" | "import" | null>(null);
  const [toast, setToast] = React.useState("");

  const load = React.useCallback(async (quiet = false) => {
    quiet ? setRefreshing(true) : setLoading(true);
    try {
      const fundedDate = new Date(Date.UTC(cursor.year, cursor.month, 1));
      const fundedYear = fundedDate.getUTCFullYear();
      const fundedMonth = fundedDate.getUTCMonth() + 1;
      const [workspace, payBudget, fundedBudget, savedBuffer] = await Promise.all([
        fetchMoneyWorkspace(cursor.year, cursor.month),
        fetchBudgetRowsForMonth(cursor.year, cursor.month),
        fetchBudgetRowsForMonth(fundedYear, fundedMonth),
        fetchUnforeseenBuffer(),
      ]);
      setData(workspace);
      setPlannedIncome(payBudget.incomes.reduce((sum, item) => sum + item.amount, 0));
      setIncomeRows(payBudget.incomes);
      const flexRows = FLEX_ALLOWANCES.map((allowance) => {
        const saved = fundedBudget.expenses.find((item) => item.label.trim().toLowerCase() === allowance.label.toLowerCase());
        return saved ?? {
          label: allowance.label,
          amount: 0,
          usualAmount: 0,
          owner: "joint" as const,
          recurrence: "recurring" as const,
        };
      });
      setFlexAllowances(flexRows);
      const legacyUnforeseen = fundedBudget.expenses.find(
        (item) => item.label.trim().toLowerCase() === UNFORESEEN_LABEL.toLowerCase()
      );
      const nextBuffer = {
        target: savedBuffer.exists ? savedBuffer.target : legacyUnforeseen?.amount ?? 0,
        balance: savedBuffer.balance,
      };
      const bufferTopUp = Math.max(0, nextBuffer.target - nextBuffer.balance);
      const regularExpenses = fundedBudget.expenses
        .filter((item) => !isFlexAllowance(item.label))
        .reduce((sum, item) => sum + item.amount, 0);
      setUnforeseenBuffer(nextBuffer);
      setPlannedExpenses(roundMoney(
        regularExpenses +
        flexRows.reduce((sum, item) => sum + item.amount, 0) +
        bufferTopUp
      ));
      setCommittedBills(fundedBudget.expenses.filter((item) => !isFlexAllowance(item.label)));
    } catch {
      setToast("We couldn’t load this month. Please refresh and try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [cursor]);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function moveMonth(delta: number) {
    const next = new Date(Date.UTC(cursor.year, cursor.month - 1 + delta, 1));
    setCursor({ year: next.getUTCFullYear(), month: next.getUTCMonth() + 1 });
  }

  if (loading || !data) {
    return <div className="money-workspace-loading"><Loader2 className="animate-spin" /> Building your monthly money view…</div>;
  }

  const spending = data.transactions
    .filter((item) => item.flow === "expense" && item.countsAsMoney)
    .reduce((sum, item) => sum + item.amount, 0);
  const actualIncome = data.transactions
    .filter((item) => item.flow === "income" && item.countsAsMoney)
    .reduce((sum, item) => sum + item.amount, 0);
  const countedExpenseTransactions = data.transactions.filter((item) => item.flow === "expense" && item.countsAsMoney).length;
  const reviewCount = data.transactions.filter((item) => item.needsReview).length;
  const selectedMonthStart = Date.UTC(cursor.year, cursor.month - 1, 1);
  const currentMonthStart = Date.UTC(now.getFullYear(), now.getMonth(), 1);
  const isCurrentMonth = selectedMonthStart === currentMonthStart;
  const isFutureMonth = selectedMonthStart > currentMonthStart;
  const monthProgress = isCurrentMonth
    ? Math.round((now.getDate() / new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()) * 100)
    : isFutureMonth ? 0 : 100;

  const filtered = data.transactions.filter((item) => {
    const matchesSearch = item.description.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = categoryFilter === "all" || item.categoryId === categoryFilter;
    return matchesSearch && matchesCategory && (!reviewOnly || item.needsReview);
  });

  const categoryTotals = data.categories
    .filter((category) => category.flow === "expense" && category.isSpending)
    .map((category) => ({
      ...category,
      spent: data.transactions
        .filter((item) => item.flow === "expense" && item.categoryId === category.id)
        .reduce((sum, item) => sum + item.amount, 0),
      transactionCount: data.transactions
        .filter((item) => item.flow === "expense" && item.categoryId === category.id)
        .length,
    }))
    .sort((a, b) => b.spent - a.spent || a.name.localeCompare(b.name));

  const currentPayMonthIndex = now.getFullYear() * 12 + now.getMonth();
  const selectedPayMonthIndex = cursor.year * 12 + cursor.month - 1;
  const forecastSteps = Math.max(0, selectedPayMonthIndex - currentPayMonthIndex);
  const projectedDebts = projectDebtsForward(debts, strategy, forecastDebtExtra, forecastSteps);
  const activeProjectedDebts = projectedDebts.filter((debt) => debt.balance > 0);
  const projectedDebtTotal = roundMoney(activeProjectedDebts.reduce((sum, debt) => sum + debt.balance, 0));
  const currentDebtTotal = roundMoney(debts.reduce((sum, debt) => sum + debt.balance, 0));
  const debtMinimums = roundMoney(activeProjectedDebts.reduce((sum, debt) => sum + debt.minimum, 0));
  const regularCommitmentTotal = roundMoney(committedBills.reduce((sum, item) => sum + item.amount, 0));
  const unforeseenTopUp = roundMoney(Math.max(0, unforeseenBuffer.target - unforeseenBuffer.balance));
  const flexAllowanceTotal = roundMoney(
    flexAllowances.reduce((sum, item) => sum + item.amount, 0) + unforeseenTopUp
  );
  const coreOutgoings = roundMoney(plannedExpenses + debtMinimums);
  const availableToAssign = roundMoney(plannedIncome - coreOutgoings);
  const emergencyGoal = goals.find((goal) => /emergency|rainy day|buffer/i.test(goal.name));
  const emergencySaved = roundMoney((emergencyGoal?.saved || 0) + forecastSavingsContribution * forecastSteps);
  const oneMonthBuffer = Math.max(0, coreOutgoings);
  const fullEmergencyTarget = oneMonthBuffer * Math.max(1, emergencyFundMonths);
  const needsStarterBuffer = emergencySaved < oneMonthBuffer;
  const orderedDebts = orderDebts(
    activeProjectedDebts.filter((debt) => debt.balance > debt.minimum && canReceiveOverpayment(debt)),
    strategy
  );
  const priorityDebt = orderedDebts[0];
  const fixedZeroDebts = activeProjectedDebts.filter((debt) => !canReceiveOverpayment(debt));
  const positiveAvailable = Math.max(0, availableToAssign);
  const baseEmergencyContribution = needsStarterBuffer && positiveAvailable > 0
    ? Math.min(
        roundMoney(oneMonthBuffer - emergencySaved),
        priorityDebt ? Math.ceil(positiveAvailable * 100 / 2) / 100 : positiveAvailable
      )
    : 0;
  const proposedDebtOverpayment = priorityDebt ? roundMoney(Math.max(0, positiveAvailable - baseEmergencyContribution)) : 0;
  const debtOverpayment = roundMoney(Math.min(proposedDebtOverpayment, overpaymentCapacity(activeProjectedDebts)));
  const emergencyContribution = roundMoney(baseEmergencyContribution + proposedDebtOverpayment - debtOverpayment);
  const futureContribution = priorityDebt ? 0 : roundMoney(Math.max(0, positiveAvailable - emergencyContribution));
  const debtAllocations = allocateDebtOverpayment(activeProjectedDebts, strategy, debtOverpayment).allocations;
  const debtFreeMonths = estimateDebtFreeMonths(activeProjectedDebts, strategy, debtOverpayment);
  const debtFreeDate = debtFreeMonths > 0 && debtFreeMonths < 600
    ? new Date(Date.UTC(cursor.year, cursor.month - 1 + debtFreeMonths, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric" })
    : "";
  const nextCursorDate = new Date(Date.UTC(cursor.year, cursor.month, 1));
  const nextCursor = { year: nextCursorDate.getUTCFullYear(), month: nextCursorDate.getUTCMonth() + 1 };
  const fundedPlanDate = new Date(Date.UTC(cursor.year, cursor.month, 1));
  const fundedPlanMonth = MONTHS[fundedPlanDate.getUTCMonth()];
  const fundedPlanYear = fundedPlanDate.getUTCFullYear();
  const payPeriodLabel = `${MONTHS[cursor.month - 1]} ${cursor.year} pay → ${fundedPlanMonth} ${fundedPlanYear} plan`;
  const regularBills = committedBills.filter((item) => !item.id?.startsWith("activity:"));
  const activityBills = committedBills.filter((item) => item.id?.startsWith("activity:"));
  const commitmentGroups = COMMITMENT_CATEGORIES.map((category) => {
    const items = regularBills.filter((item) =>
      (COMMITMENT_CATEGORIES.includes(item.categoryName as typeof COMMITMENT_CATEGORIES[number])
        ? item.categoryName
        : guessCommitmentCategory(item.label)) === category
    );
    return {
      category,
      items,
      total: roundMoney(items.reduce((sum, item) => sum + item.amount, 0)),
    };
  }).filter((group) => group.items.length > 0);

  async function categorise(transaction: WorkspaceTransaction, categoryId: string, learn = true) {
    const category = data?.categories.find((item) => item.id === categoryId);
    setData((current) => current ? {
      ...current,
      transactions: current.transactions.map((item) => item.id === transaction.id
        ? { ...item, categoryId, categoryName: category?.name || "Other", countsAsMoney: category?.isSpending ?? true, needsReview: false }
        : item),
    } : current);
    await setTransactionCategory(transaction.id, categoryId, learn);
    if (learn) setToast(`Categorised as ${category?.name}. Future matches will follow this rule.`);
  }

  function updateIncome(id: string | undefined, patch: Partial<BudgetRow>) {
    const next = incomeRows.map((item) => item.id === id ? { ...item, ...patch } : item);
    setIncomeRows(next);
    setPlannedIncome(roundMoney(next.reduce((sum, item) => sum + item.amount, 0)));
  }

  async function persistIncome(row: BudgetRow) {
    if (!row.id || savingIncomeId) return;
    setSavingIncomeId(row.id);
    try {
      const usualAmount = row.usualAmount ?? row.amount;
      await upsertBudgetRowScoped("income", {
        id: row.id,
        label: row.label,
        amount: usualAmount,
        owner: row.owner,
        year: cursor.year,
        month1to12: cursor.month,
        scope: "from-now-on",
        expectedDay: row.expectedDay,
      });
      if (roundMoney(row.amount) !== roundMoney(usualAmount)) {
        await upsertBudgetRowScoped("income", {
          id: row.id,
          label: row.label,
          amount: row.amount,
          owner: row.owner,
          year: cursor.year,
          month1to12: cursor.month,
          scope: "this-month",
          expectedDay: row.expectedDay,
        });
      }
      onFinanceChanged?.();
      await load(true);
      setToast(`${row.label} saved · ${money(row.amount)} for this pay cycle, ${money(usualAmount)} usual pay.`);
    } catch {
      setToast("That income did not save. Please try again.");
    } finally {
      setSavingIncomeId(null);
    }
  }

  function updateFlexAllowance(label: string, patch: Partial<BudgetRow>) {
    const next = flexAllowances.map((item) => item.label === label ? { ...item, ...patch } : item);
    setFlexAllowances(next);
    setPlannedExpenses(roundMoney(
      committedBills.reduce((sum, item) => sum + item.amount, 0) +
      next.reduce((sum, item) => sum + item.amount, 0) +
      unforeseenTopUp
    ));
  }

  function updateUnforeseenBuffer(patch: Partial<typeof unforeseenBuffer>) {
    const next = { ...unforeseenBuffer, ...patch };
    next.balance = Math.min(next.target, next.balance);
    setUnforeseenBuffer(next);
    setPlannedExpenses(roundMoney(
      committedBills.reduce((sum, item) => sum + item.amount, 0) +
      flexAllowances.reduce((sum, item) => sum + item.amount, 0) +
      Math.max(0, next.target - next.balance)
    ));
  }

  async function persistUnforeseenBuffer() {
    if (savingBuffer) return;
    setSavingBuffer(true);
    try {
      const saved = await saveUnforeseenBuffer(unforeseenBuffer);
      setUnforeseenBuffer(saved);
      onFinanceChanged?.();
      await load(true);
      setToast(`Unforeseen costs buffer saved. This pay cycle will top it up by ${money(Math.max(0, saved.target - saved.balance))}.`);
    } catch {
      setToast("That buffer did not save. Please try again.");
    } finally {
      setSavingBuffer(false);
    }
  }

  async function persistFlexAllowance(row: BudgetRow) {
    const usualAmount = row.usualAmount ?? row.amount;
    try {
      const saved = await upsertBudgetRowScoped("expense", {
        id: row.id,
        label: row.label,
        amount: usualAmount,
        owner: "joint",
        year: fundedPlanYear,
        month1to12: fundedPlanDate.getUTCMonth() + 1,
        scope: "from-now-on",
      });
      if (roundMoney(row.amount) !== roundMoney(usualAmount)) {
        await upsertBudgetRowScoped("expense", {
          id: saved.id,
          label: row.label,
          amount: row.amount,
          owner: "joint",
          year: fundedPlanYear,
          month1to12: fundedPlanDate.getUTCMonth() + 1,
          scope: "this-month",
        });
      }
      onFinanceChanged?.();
      await load(true);
      setToast(`${row.label} saved at ${money(row.amount)} for this plan.`);
    } catch {
      setToast("That monthly allowance did not save. Please try again.");
    }
  }

  function updateCommitment(id: string | undefined, patch: Partial<BudgetRow>) {
    const next = committedBills.map((item) => item.id === id ? { ...item, ...patch } : item);
    setCommittedBills(next);
    setPlannedExpenses(roundMoney(
      next.reduce((sum, item) => sum + item.amount, 0) +
      flexAllowances.reduce((sum, item) => sum + item.amount, 0) +
      unforeseenTopUp
    ));
  }

  async function persistCommitment(row: BudgetRow) {
    if (!row.id || row.id.startsWith("activity:") || savingCommitmentId) return;
    setSavingCommitmentId(row.id);
    const usualAmount = row.usualAmount ?? row.amount;
    const categoryName = row.categoryName || guessCommitmentCategory(row.label);
    try {
      const result = await saveCommitment({
        id: row.id,
        label: row.label,
        amount: usualAmount,
        owner: row.owner,
        year: fundedPlanYear,
        month1to12: fundedPlanDate.getUTCMonth() + 1,
        scope: "from-now-on",
        expectedDay: row.expectedDay,
        categoryName,
      });
      if (result.kind === "debt") {
        await deleteBudgetRowScoped(row.id, "entire-range", fundedPlanYear, fundedPlanDate.getUTCMonth() + 1);
        setCommittedBills((items) => items.filter((item) => item.id !== row.id));
        onFinanceChanged?.();
        setToast(`${row.label} moved to Debt freedom.`);
      } else {
        if (roundMoney(row.amount) !== roundMoney(usualAmount)) {
          await upsertBudgetRowScoped("expense", {
            id: result.row.id,
            label: row.label,
            amount: row.amount,
            owner: row.owner,
            year: fundedPlanYear,
            month1to12: fundedPlanDate.getUTCMonth() + 1,
            scope: "this-month",
            categoryName,
          });
        }
        onFinanceChanged?.();
        setToast(`${row.label} saved · ${money(row.amount)} for ${fundedPlanMonth}, ${money(usualAmount)} usual target.`);
      }
      await load(true);
    } catch {
      setToast("That commitment did not save. Please try again.");
    } finally {
      setSavingCommitmentId(null);
    }
  }

  return (
    <section className="money-workspace">
      {toast && <div className="workspace-toast"><Check size={15} /> {toast}</div>}

      <header className="workspace-header">
        <div>
          <span className="section-kicker">Pay-cycle plan</span>
          <h2>Use this pay to fund next month</h2>
          <p>Your {MONTHS[cursor.month - 1]} pay covers {fundedPlanMonth} commitments, realistic family spending, savings and debt overpayments.</p>
        </div>
        <div className="workspace-actions">
          <button className="soft-button" onClick={() => setModal("income")}><ArrowDownLeft size={16} /> Add income</button>
          <button className="primary-button workspace-primary" onClick={() => setModal("commitment")}><Plus size={16} /> Add commitment</button>
        </div>
      </header>

      <div className="workspace-monthbar">
        <div className="month-stepper">
          <button onClick={() => moveMonth(-1)} aria-label="Previous month"><ChevronLeft /></button>
          <strong>{payPeriodLabel}</strong>
          <button onClick={() => moveMonth(1)} aria-label="Next month"><ChevronRight /></button>
        </div>
        <button className="soft-button forecast-button" onClick={() => { setCursor(nextCursor); setView("plan"); }}>
          See next pay-cycle forecast
        </button>
        <button className="icon-button" onClick={() => load(true)} aria-label="Refresh month">
          <RefreshCw className={refreshing ? "animate-spin" : ""} size={16} />
        </button>
      </div>

      <div className="workspace-pulse">
        <button className="pulse-button" onClick={() => setModal("income")} aria-label="Add or update monthly income">
          <PulseCard tone="green" icon={<ArrowDownLeft />} label={`${MONTHS[cursor.month - 1]} take-home pay`} value={money(plannedIncome)} note={`Available to fund the ${fundedPlanMonth} plan`} />
        </button>
        <PulseCard tone="coral" icon={<ArrowUpRight />} label="Planned outgoings" value={money(coreOutgoings)} note={`${money(regularCommitmentTotal)} commitments · ${money(flexAllowanceTotal)} flexible costs · ${money(debtMinimums)} debt minimums`} />
        <PulseCard tone="blue" icon={<WalletCards />} label="For savings + debt" value={money(availableToAssign)} note={availableToAssign >= 0 ? "Automatically allocated in the plan below" : "Your planned costs are over income"} />
      </div>

      {view === "transactions" && (
        <div className="workspace-surface">
          <div className="transaction-tools">
            <label className="workspace-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search merchant or description" /></label>
            <label className="workspace-select"><Filter size={14} /><select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
              <option value="all">All categories</option>
              {data.categories.filter((category) => category.flow === "expense").map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select></label>
            <button className={reviewOnly ? "filter-chip active" : "filter-chip"} onClick={() => setReviewOnly((value) => !value)}>
              <CircleAlert size={14} /> Needs review {reviewCount > 0 && <b>{reviewCount}</b>}
            </button>
            <button className="soft-button add-transaction-button" onClick={() => setModal("add")}><Plus size={15} /> Add transaction</button>
          </div>

          {filtered.length === 0 ? (
            <WorkspaceEmpty
              icon={<Building2 />}
              title={data.transactions.length ? "Nothing matches those filters" : "Bring in your first transactions"}
              text={data.transactions.length ? "Try clearing your search or category filters." : "Import a CSV statement or add a transaction manually."}
              actions={<><button className="primary-button" onClick={() => setModal("import")}><FileUp size={15} /> Import statement</button><button className="soft-button" onClick={() => setModal("add")}><Plus size={15} /> Add manually</button></>}
            />
          ) : (
            <div className="transaction-list">
              <div className="transaction-list-head"><span>Date & merchant</span><span>Account</span><span>Category</span><span>Amount</span><span /></div>
              {filtered.map((transaction) => (
                <article className={transaction.needsReview ? "transaction-row needs-review" : "transaction-row"} key={transaction.id}>
                  <div className="transaction-merchant">
                    <span className={`transaction-avatar ${categoryTone(transaction.categoryName)}`}>{transaction.description.slice(0, 1).toUpperCase()}</span>
                    <div><strong>{transaction.description}</strong><small>{new Date(`${transaction.date}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</small></div>
                  </div>
                  <span className="transaction-account">{transaction.accountName}</span>
                  <label className="category-picker">
                    <select value={transaction.categoryId} onChange={(event) => categorise(transaction, event.target.value)} aria-label={`Category for ${transaction.description}`}>
                      <option value="">Needs review</option>
                      {data.categories.filter((category) => category.flow === transaction.flow || category.name === "Transfers").map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                    </select>
                  </label>
                  <strong className={transaction.flow === "expense" ? "transaction-amount expense" : "transaction-amount income"}>
                    {transaction.flow === "expense" ? "−" : "+"}{money(transaction.amount)}
                  </strong>
                  <button className="row-delete" onClick={async () => {
                    setData((current) => current ? { ...current, transactions: current.transactions.filter((item) => item.id !== transaction.id) } : current);
                    await deleteMoneyTransaction(transaction.id);
                  }} aria-label={`Delete ${transaction.description}`}><Trash2 size={15} /></button>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {view === "categories" && (
        <div className="workspace-surface">
          <div className="surface-heading">
            <div><span className="section-kicker">Spending by category</span><h3>See the pattern, not just the purchases</h3></div>
            <span className="surface-total">{money(spending)} spent</span>
          </div>
          <div className="category-grid">
            {categoryTotals.map((category) => {
              const share = spending > 0 ? (category.spent / spending) * 100 : 0;
              return (
                <article className="category-card" key={category.id}>
                  <div className="category-card-head">
                    <span className={`category-dot ${categoryTone(category.name)}`} />
                    <div><strong>{category.name}</strong><small>{category.group}</small></div>
                    <b>{money(category.spent)}</b>
                  </div>
                  <div className="category-budget-row"><span>{category.transactionCount} transactions</span><span>{Math.round(share)}% of spending</span></div>
                  <div className="category-track"><i style={{ width: `${Math.min(100, share)}%` }} /></div>
                </article>
              );
            })}
          </div>
        </div>
      )}

      {view === "plan" && (
        <div className="workspace-surface">
          <div className="surface-heading">
            <div><span className="section-kicker">{payPeriodLabel}</span><h3>Cover the whole month before it begins</h3><p>Start with take-home pay, cover commitments and realistic family spending, then follow the savings and debt split.</p></div>
            <div className={availableToAssign >= 0 ? "plan-balance" : "plan-balance negative"}><span>{availableToAssign >= 0 ? "For savings + debt" : "Plan shortfall"}</span><strong>{money(Math.abs(availableToAssign))}</strong></div>
          </div>
          <div className="payday-routine">
            <div><CalendarDays /><span><strong>Your once-a-month pay check-in</strong><small>1. Confirm both pays &nbsp; 2. Cover next month&apos;s commitments &nbsp; 3. Allow for real life &nbsp; 4. Save and reduce debt</small></span></div>
            <button className="soft-button" onClick={() => { setCursor(nextCursor); setView("plan"); }}>See next pay-cycle forecast</button>
          </div>
          {forecastSteps > 0 && (
            <div className="forecast-position">
              <span><small>Projected debt remaining</small><strong>{money(projectedDebtTotal)}</strong><em>{money(Math.max(0, currentDebtTotal - projectedDebtTotal))} lower than today</em></span>
              <span><small>Projected emergency savings</small><strong>{money(emergencySaved)}</strong><em>After earlier planned contributions</em></span>
              <span><small>Debt minimums this cycle</small><strong>{money(debtMinimums)}</strong><em>Cleared debts automatically drop out</em></span>
            </div>
          )}
          <div className="money-order">
            <section className="order-card income-order">
              <div className="order-number">1</div>
              <div className="order-heading">
                <span className="section-kicker">Take-home income</span>
                <h3>{money(plannedIncome)}</h3>
                <p>The pay received in {MONTHS[cursor.month - 1]} that funds your {fundedPlanMonth} plan.</p>
              </div>
              <button className="soft-button" onClick={() => setModal("income")}><Plus size={15} /> Add income</button>
              <div className="income-editor">
                {incomeRows.map((income) => (
                  <article key={income.id || income.label}>
                    <label><span>Income</span><input value={income.label} onChange={(event) => updateIncome(income.id, { label: event.target.value })} /></label>
                    <label><span>{MONTHS[cursor.month - 1]} pay</span><div className="currency-input">£<input type="number" min="0" step=".01" value={income.amount} onFocus={selectNumericValue} onChange={(event) => updateIncome(income.id, { amount: Math.max(0, Number(event.target.value) || 0) })} /></div></label>
                    <label><span>Usual monthly pay</span><div className="currency-input">£<input type="number" min="0" step=".01" value={income.usualAmount ?? income.amount} onFocus={selectNumericValue} onChange={(event) => updateIncome(income.id, { usualAmount: Math.max(0, Number(event.target.value) || 0) })} /></div></label>
                    <button className="soft-button income-save-button" disabled={Boolean(savingIncomeId)} onClick={() => persistIncome(income)}>
                      {savingIncomeId === income.id ? <Loader2 className="animate-spin" size={15} /> : <Check size={15} />}
                      {savingIncomeId === income.id ? "Saving" : "Save income"}
                    </button>
                    <button className="icon-button danger" aria-label={`Remove ${income.label}`} onClick={async () => {
                      if (!income.id) return;
                      await deleteBudgetRowScoped(income.id, "entire-range", cursor.year, cursor.month);
                      setIncomeRows((items) => items.filter((item) => item.id !== income.id));
                      setPlannedIncome((value) => roundMoney(Math.max(0, value - income.amount)));
                      onFinanceChanged?.();
                    }}><Trash2 size={15} /></button>
                  </article>
                ))}
                {incomeRows.length === 0 && <button className="empty-order-action" onClick={() => setModal("income")}>Add salary, benefits or other regular income</button>}
              </div>
            </section>

            <section className="order-card">
              <div className="order-number">2</div>
              <div className="order-heading">
                <span className="section-kicker">Cover commitments</span>
                <h3>{money(regularCommitmentTotal + debtMinimums)}</h3>
                <p>
                  Your {fundedPlanMonth} bills plus the minimum payments from Debt freedom.
                  {forecastSteps > 0 && ` Debt balances reflect ${forecastSteps} previous ${forecastSteps === 1 ? "pay cycle" : "pay cycles"} of planned payments.`}
                </p>
              </div>
              <button className="soft-button" onClick={() => setModal("commitment")}><Plus size={15} /> Add commitment</button>
              <div className="commitment-editor">
                {commitmentGroups.map((group) => (
                  <details className="commitment-group" key={group.category}>
                    <summary>
                      <span className="commitment-group-icon"><ChevronRight size={15} /></span>
                      <span><b>{group.category}</b><small>{group.items.length} {group.items.length === 1 ? "commitment" : "commitments"}</small></span>
                      <strong>{money(group.total)}</strong>
                    </summary>
                    <div className="commitment-group-body">
                      {group.items.map((bill) => (
                        <article key={bill.id || bill.label}>
                          <label><span>Commitment</span><input value={bill.label} onChange={(event) => updateCommitment(bill.id, { label: event.target.value })} /></label>
                          <label>
                            <span>Category</span>
                            <select
                              value={COMMITMENT_CATEGORIES.includes(bill.categoryName as typeof COMMITMENT_CATEGORIES[number]) ? bill.categoryName : guessCommitmentCategory(bill.label)}
                              onChange={(event) => updateCommitment(bill.id, { categoryName: event.target.value })}
                            >
                              {COMMITMENT_CATEGORIES.map((category) => <option value={category} key={category}>{category}</option>)}
                            </select>
                          </label>
                          <label><span>{fundedPlanMonth} plan</span><div className="currency-input">£<input type="number" min="0" step=".01" value={bill.amount} onFocus={selectNumericValue} onChange={(event) => updateCommitment(bill.id, { amount: Math.max(0, Number(event.target.value) || 0) })} /></div></label>
                          <label><span>Usual monthly target</span><div className="currency-input">£<input type="number" min="0" step=".01" value={bill.usualAmount ?? bill.amount} onFocus={selectNumericValue} onChange={(event) => updateCommitment(bill.id, { usualAmount: Math.max(0, Number(event.target.value) || 0) })} /></div></label>
                          <button className="soft-button commitment-save-button" disabled={Boolean(savingCommitmentId)} onClick={() => persistCommitment(bill)}>
                            {savingCommitmentId === bill.id ? <Loader2 className="animate-spin" size={15} /> : <Check size={15} />}
                            {savingCommitmentId === bill.id ? "Saving" : "Save"}
                          </button>
                          <button className="icon-button danger" aria-label={`Remove ${bill.label}`} onClick={async () => {
                            if (!bill.id) return;
                            await deleteBudgetRowScoped(bill.id, "from-now-on", fundedPlanYear, fundedPlanDate.getUTCMonth() + 1);
                            setCommittedBills((items) => items.filter((item) => item.id !== bill.id));
                            setPlannedExpenses((value) => Math.max(0, value - bill.amount));
                            onFinanceChanged?.();
                          }}><Trash2 size={15} /></button>
                        </article>
                      ))}
                    </div>
                  </details>
                ))}
                {activityBills.length > 0 && (
                  <details className="commitment-group activity-total">
                    <summary>
                      <span className="commitment-group-icon"><ChevronRight size={15} /></span>
                      <span><b>Family activities</b><small>{activityBills.length} {activityBills.length === 1 ? "activity" : "activities"}</small></span>
                      <strong>{money(activityBills.reduce((sum, item) => sum + item.amount, 0))}</strong>
                    </summary>
                    <div className="commitment-group-body">
                      {activityBills.map((bill) => <article className="commitment-static" key={bill.id}><span><b>{bill.label}</b><small>Managed in family activities</small></span><strong>{money(bill.amount)}</strong></article>)}
                    </div>
                  </details>
                )}
                {debtMinimums > 0 && (
                  <details className="commitment-group debt-total">
                    <summary>
                      <span className="commitment-group-icon"><ChevronRight size={15} /></span>
                      <span><b>Debt minimum payments</b><small>{activeProjectedDebts.length} {activeProjectedDebts.length === 1 ? "debt" : "debts"} · {forecastSteps > 0 ? "projected after earlier payments" : "managed in Debt freedom"}</small></span>
                      <strong>{money(debtMinimums)}</strong>
                    </summary>
                    <div className="commitment-group-body">
                      {activeProjectedDebts.map((debt) => <article className="commitment-static" key={debt.id}><span><b>{debt.name}</b><small>{money(debt.balance)} projected balance</small></span><strong>{money(debt.minimum)}</strong></article>)}
                    </div>
                  </details>
                )}
                {committedBills.length === 0 && debtMinimums === 0 && <button className="empty-order-action" onClick={() => setModal("commitment")}>Add mortgage, council tax, utilities, childcare and other must-pay bills</button>}
              </div>
            </section>

            <section className="order-card flex-order">
              <div className="order-number">3</div>
              <div className="order-heading">
                <span className="section-kicker">Allow for real life</span>
                <h3>{money(flexAllowanceTotal)}</h3>
                <p>Plan for the spending that is never truly random instead of taking it from savings later.</p>
              </div>
              <div className="flex-allowance-editor">
                <article className="rolling-pot-editor">
                  <span>
                    <b>Unforeseen costs buffer</b>
                    <small>Keep a set amount ready for birthdays, family trips, school costs and the surprises that crop up. Whatever is left rolls into the next pay cycle.</small>
                  </span>
                  <label><span>Keep available</span><div className="currency-input">£<input type="number" min="0" step=".01" value={unforeseenBuffer.target} onFocus={selectNumericValue} onChange={(event) => updateUnforeseenBuffer({ target: Math.max(0, Number(event.target.value) || 0) })} /></div></label>
                  <label><span>Left in pot now</span><div className="currency-input">£<input type="number" min="0" max={unforeseenBuffer.target} step=".01" value={unforeseenBuffer.balance} onFocus={selectNumericValue} onChange={(event) => updateUnforeseenBuffer({ balance: Math.max(0, Number(event.target.value) || 0) })} /></div></label>
                  <span className="pot-top-up"><small>Top up from this pay</small><strong>{money(unforeseenTopUp)}</strong></span>
                  <button className="soft-button" disabled={savingBuffer} onClick={persistUnforeseenBuffer}>
                    {savingBuffer ? <Loader2 className="animate-spin" size={15} /> : <Check size={15} />}
                    {savingBuffer ? "Saving" : "Save buffer"}
                  </button>
                </article>
                {flexAllowances.map((allowance) => {
                  const definition = FLEX_ALLOWANCES.find((item) => item.label === allowance.label);
                  return (
                    <article key={allowance.label}>
                      <span><b>{allowance.label}</b><small>{definition?.note}</small></span>
                      <label><span>{fundedPlanMonth} plan</span><div className="currency-input">£<input type="number" min="0" step=".01" value={allowance.amount} onFocus={selectNumericValue} onChange={(event) => updateFlexAllowance(allowance.label, { amount: Math.max(0, Number(event.target.value) || 0) })} /></div></label>
                      <label><span>Usual monthly</span><div className="currency-input">£<input type="number" min="0" step=".01" value={allowance.usualAmount ?? allowance.amount} onFocus={selectNumericValue} onChange={(event) => updateFlexAllowance(allowance.label, { usualAmount: Math.max(0, Number(event.target.value) || 0) })} /></div></label>
                      <button className="soft-button" onClick={() => persistFlexAllowance(allowance)}><Check size={15} /> Save</button>
                    </article>
                  );
                })}
              </div>
            </section>

            <section className={`order-card recommendation-card ${availableToAssign < 0 ? "warning" : ""}`}>
              <div className="order-number">4</div>
              <div className="order-heading">
                <span className="section-kicker">Recommended next move</span>
                <h3>{availableToAssign < 0 ? "Close the gap before overpaying" : priorityDebt ? `Focus on ${priorityDebt.name}` : fixedZeroDebts.length ? "Keep 0% plans on schedule" : "Build your financial future"}</h3>
                <p>
                  {availableToAssign < 0
                    ? `Your planned commitments are ${money(Math.abs(availableToAssign))} above income. Review the commitments or update expected pay before adding extra debt or savings payments.`
                    : priorityDebt
                      ? `${strategy === "avalanche" ? "Highest APR first saves the most interest." : "Smallest balance first creates the quickest win."} Every pound left after commitments and real-life allowances is assigned below.`
                      : fixedZeroDebts.length
                        ? "These debts are permanently interest-free. Keep paying their minimums and direct the remaining money to savings."
                        : "With no debts to overpay, direct the remaining money to your emergency fund."}
                </p>
              </div>
              <div className="recommendation-split">
                <RecommendationLine icon={<ShieldCheck />} label="Emergency buffer" value={emergencyContribution} note={fullEmergencyTarget > 0 ? `${money(emergencySaved)} of ${money(fullEmergencyTarget)} target saved` : "Set after essential costs are entered"} />
                {priorityDebt ? debtAllocations.map((allocation, index) => {
                  const debt = activeProjectedDebts.find((item) => item.id === allocation.id);
                  return (
                    <RecommendationLine
                      key={allocation.id}
                      icon={<Target />}
                      label={`Extra to ${allocation.name}`}
                      value={allocation.amount}
                      note={`${index === 0 ? "Pay first" : "Remainder rolls here"} · ${money(debt?.balance || 0)} balance${debtFreeDate ? ` · all debts forecast clear ${debtFreeDate}` : ""}`}
                    />
                  );
                }) : (
                  <RecommendationLine icon={<Sparkles />} label="Additional savings" value={futureContribution} note={fixedZeroDebts.length ? "Permanent 0% plans remain on their minimum payments" : "After this month’s costs and safety buffer"} />
                )}
              </div>
              <small className="recommendation-note">Until one month of commitments is saved, available money is split between your emergency buffer and eligible debts. Permanent 0% plans receive only their minimum payment. No debt is allocated more than its remaining balance.</small>
            </section>
          </div>
        </div>
      )}

      {view === "rules" && (
        <RulesView
          rules={data.rules}
          categories={data.categories.filter((category) => category.flow === "expense")}
          onAdded={() => load(true)}
          onRemoved={async (id) => {
            setData((current) => current ? { ...current, rules: current.rules.filter((rule) => rule.id !== id) } : current);
            await removeCategoryRule(id);
          }}
        />
      )}

      {modal === "add" && <AddTransactionModal categories={data.categories} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(true); setToast("Transaction added."); }} />}
      {modal === "income" && <IncomeModal year={cursor.year} month={cursor.month} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(true); onFinanceChanged?.(); setToast("Income added to your monthly plan."); }} />}
      {modal === "commitment" && <CommitmentModal year={fundedPlanYear} month={fundedPlanDate.getUTCMonth() + 1} onClose={() => setModal(null)} onSaved={(kind) => {
        setModal(null);
        load(true);
        onFinanceChanged?.();
        setToast(kind === "debt" ? "Debt payment added to Debt freedom." : "Commitment added.");
      }} />}
      {modal === "import" && <ImportModal onClose={() => setModal(null)} onImported={(message) => { setModal(null); load(true); onFinanceChanged?.(); setToast(message); }} />}
    </section>
  );
}

function PulseCard({ tone, icon, label, value, note }: { tone: string; icon: React.ReactNode; label: string; value: string; note: string }) {
  return <article className={`workspace-pulse-card ${tone}`}><div>{icon}</div><span>{label}</span><strong>{value}</strong><small>{note}</small></article>;
}

function RecommendationLine({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: number; note: string }) {
  return <article><div>{icon}</div><span><b>{label}</b><small>{note}</small></span><strong>{money(value)}</strong></article>;
}

function WorkspaceTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return <button className={active ? "active" : ""} onClick={onClick}>{label}</button>;
}

function WorkspaceEmpty({ icon, title, text, actions }: { icon: React.ReactNode; title: string; text: string; actions: React.ReactNode }) {
  return <div className="workspace-empty"><div>{icon}</div><h3>{title}</h3><p>{text}</p><span>{actions}</span></div>;
}

function RulesView({ rules, categories, onAdded, onRemoved }: {
  rules: Workspace["rules"];
  categories: WorkspaceCategory[];
  onAdded: () => void;
  onRemoved: (id: string) => void;
}) {
  const [match, setMatch] = React.useState("");
  const [categoryId, setCategoryId] = React.useState(categories[0]?.id || "");
  return (
    <div className="workspace-surface">
      <div className="surface-heading">
        <div><span className="section-kicker">Optional automation</span><h3>Categorise once, remember next month</h3><p>You do not need to set this up before importing. When you change a transaction&apos;s category, HearthPlan remembers that merchant automatically.</p></div>
      </div>
      <form className="rule-builder" onSubmit={async (event) => {
        event.preventDefault();
        if (!match.trim() || !categoryId) return;
        await saveCategoryRule(match, categoryId);
        setMatch("");
        onAdded();
      }}>
        <label><span>If description contains</span><input value={match} onChange={(event) => setMatch(event.target.value)} placeholder="e.g. Tesco, Netflix, nursery" /></label>
        <label><span>Categorise as</span><select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
        <button className="primary-button"><Sparkles size={15} /> Add rule</button>
      </form>
      <div className="rules-list">
        {rules.length === 0 ? <WorkspaceEmpty icon={<SlidersHorizontal />} title="Nothing to manage yet" text="Import your statement and categorise purchases normally. Your automatic matches will appear here." actions={null} /> :
          rules.map((rule) => <article key={rule.id}><span>If merchant contains <strong>“{rule.matchText}”</strong></span><ChevronRight size={14} /><b>{rule.categoryName}</b><button onClick={() => onRemoved(rule.id)}><Trash2 size={15} /></button></article>)}
      </div>
    </div>
  );
}

function ModalFrame({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="workspace-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <section className="workspace-modal" role="dialog" aria-modal="true" aria-label={title}>
      <button className="modal-close" onClick={onClose} aria-label="Close"><X /></button>
      <span className="section-kicker">{subtitle}</span>
      <h2>{title}</h2>
      {children}
    </section>
  </div>;
}

function IncomeModal({ year, month, onClose, onSaved }: { year: number; month: number; onClose: () => void; onSaved: () => void }) {
  const [label, setLabel] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [scope, setScope] = React.useState<Scope>("from-now-on");
  const [saving, setSaving] = React.useState(false);

  return <ModalFrame title="Add take-home income" subtitle="Step one" onClose={onClose}>
    <p className="modal-intro">Enter the amount that reaches your account after tax. Add each salary, benefit or regular income separately.</p>
    <form className="workspace-form" onSubmit={async (event) => {
      event.preventDefault();
      setSaving(true);
      await upsertBudgetRowScoped("income", {
        label,
        amount: Number(amount) || 0,
        owner: "joint",
        year,
        month1to12: month,
        scope,
      });
      onSaved();
    }}>
      <label className="wide"><span>Income name</span><input required value={label} onChange={(event) => setLabel(event.target.value)} placeholder="e.g. Rob salary, Laura salary, Child Benefit" /></label>
      <label><span>Monthly take-home amount</span><div className="currency-input">£<input type="number" required min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></div></label>
      <label className="wide"><span>Use this amount</span><select value={scope} onChange={(event) => setScope(event.target.value as Scope)}><option value="from-now-on">{MONTHS[month - 1]} and future months</option><option value="this-month">Only {MONTHS[month - 1]}</option></select></label>
      <button className="primary-button wide" disabled={saving}>{saving ? <Loader2 className="animate-spin" size={16} /> : <ArrowDownLeft size={16} />} Save income</button>
    </form>
  </ModalFrame>;
}

function CommitmentModal({ year, month, onClose, onSaved }: {
  year: number;
  month: number;
  onClose: () => void;
  onSaved: (kind: "commitment" | "debt") => void;
}) {
  const [label, setLabel] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [categoryName, setCategoryName] = React.useState<typeof COMMITMENT_CATEGORIES[number]>("Home & household");
  const [scope, setScope] = React.useState<Extract<Scope, "this-month" | "from-now-on">>("from-now-on");
  const [saving, setSaving] = React.useState(false);
  const debtLike = /\b(credit\s*card|loan)\b/i.test(label);

  return <ModalFrame title="Add a monthly commitment" subtitle="Must-pay outgoings" onClose={onClose}>
    <p className="modal-intro">Add fixed bills you need to cover before saving or making debt overpayments.</p>
    {debtLike && <div className="debt-detection-note"><CreditCard size={16} /><span>This looks like debt. It will be added to Debt freedom as a minimum payment, where you can enter the balance and APR.</span></div>}
    <form className="workspace-form" onSubmit={async (event) => {
      event.preventDefault();
      setSaving(true);
      const result = await saveCommitment({
        label,
        amount: Number(amount) || 0,
        owner: "joint",
        year,
        month1to12: month,
        scope,
        categoryName,
      });
      onSaved(result.kind);
    }}>
      <label className="wide"><span>Commitment name</span><input required value={label} onChange={(event) => setLabel(event.target.value)} placeholder="e.g. Mortgage, Council tax, Octopus Energy" /></label>
      <label><span>Monthly amount</span><div className="currency-input">£<input type="number" required min="0.01" step=".01" value={amount} onChange={(event) => setAmount(event.target.value)} /></div></label>
      <label><span>Category</span><select value={categoryName} onChange={(event) => setCategoryName(event.target.value as typeof COMMITMENT_CATEGORIES[number])}>{COMMITMENT_CATEGORIES.map((category) => <option value={category} key={category}>{category}</option>)}</select></label>
      <label className="wide"><span>How long does this apply?</span><select value={scope} onChange={(event) => setScope(event.target.value as typeof scope)}><option value="from-now-on">{MONTHS[month - 1]} and future funded months</option><option value="this-month">Only {MONTHS[month - 1]}</option></select></label>
      <button className="primary-button wide" disabled={saving}>{saving ? <Loader2 className="animate-spin" size={16} /> : debtLike ? <CreditCard size={16} /> : <Plus size={16} />} {debtLike ? "Add to Debt freedom" : "Save commitment"}</button>
    </form>
  </ModalFrame>;
}

function AddTransactionModal({ categories, onClose, onSaved }: { categories: WorkspaceCategory[]; onClose: () => void; onSaved: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = React.useState({ date: today, description: "", amount: "", flow: "expense" as "income" | "expense", categoryId: "", accountName: "Manual" });
  const [saving, setSaving] = React.useState(false);
  return <ModalFrame title="Add a transaction" subtitle="Manual entry" onClose={onClose}>
    <form className="workspace-form" onSubmit={async (event) => {
      event.preventDefault();
      setSaving(true);
      await addManualTransaction({ ...form, amount: Number(form.amount) || 0 });
      onSaved();
    }}>
      <label className="wide"><span>Description</span><input required value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="e.g. Weekly food shop" /></label>
      <label><span>Date</span><input type="date" required value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
      <label><span>Amount</span><div className="currency-input">£<input type="number" required min="0.01" step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></div></label>
      <label><span>Type</span><select value={form.flow} onChange={(event) => setForm({ ...form, flow: event.target.value as "income" | "expense", categoryId: "" })}><option value="expense">Money out</option><option value="income">Money in</option></select></label>
      <label><span>Category</span><select value={form.categoryId} onChange={(event) => setForm({ ...form, categoryId: event.target.value })}><option value="">Needs review</option>{categories.filter((category) => category.flow === form.flow || category.name === "Transfers").map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
      <label className="wide"><span>Account</span><input value={form.accountName} onChange={(event) => setForm({ ...form, accountName: event.target.value })} /></label>
      <button className="primary-button wide" disabled={saving}>{saving ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />} Add transaction</button>
    </form>
  </ModalFrame>;
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') { value += '"'; index += 1; } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(value.trim());
      value = "";
    } else value += char;
  }
  cells.push(value.trim());
  return cells;
}

function normaliseHeader(value: string) {
  return value.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[_-]+/g, " ");
}

function findCsvColumn(header: string[], options: RegExp[]) {
  return header.findIndex((cell) => options.some((option) => option.test(cell)));
}

function parseStatementDate(value: string) {
  const cleaned = value.trim();
  const ukDate = cleaned.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (ukDate) {
    const [, day, month, year] = ukDate;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const isoDate = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoDate) {
    const [, year, month, day] = isoDate;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const parsed = new Date(cleaned);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function parseStatementAmount(value: string) {
  const cleaned = value.trim().replace(/[£,\s]/g, "");
  const negative = cleaned.startsWith("(") && cleaned.endsWith(")");
  const parsed = Number(cleaned.replace(/[()]/g, ""));
  return negative ? -Math.abs(parsed) : parsed;
}

function ImportModal({ onClose, onImported }: { onClose: () => void; onImported: (message: string) => void }) {
  const [file, setFile] = React.useState<File | null>(null);
  const [account, setAccount] = React.useState("Current account");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  async function runImport() {
    if (!file) return;
    setBusy(true);
    try {
      const text = await file.text();
      const lines = text.replace(/\r/g, "").split("\n").filter(Boolean);
      if (lines.length < 2) throw new Error("That CSV does not contain any transactions.");
      const header = parseCsvLine(lines[0]).map(normaliseHeader);
      const dateIndex = findCsvColumn(header, [/^date$/, /transaction date/, /booking date/, /posted date/]);
      const descriptionIndex = findCsvColumn(header, [/^description$/, /counter party/, /counterparty/, /merchant/, /payee/, /narrative/, /details/]);
      const referenceIndex = findCsvColumn(header, [/^reference$/, /payment reference/, /^memo$/, /^notes?$/]);
      const amountIndex = findCsvColumn(header, [/^amount(?:\s*\(.+\))?$/, /^value(?:\s*\(.+\))?$/, /transaction amount/]);
      const categoryIndex = findCsvColumn(header, [/spending category/, /^category$/]);
      if (dateIndex < 0 || descriptionIndex < 0 || amountIndex < 0) {
        throw new Error(`We found: ${header.join(", ")}. HearthPlan needs a date, merchant/counter party and amount column.`);
      }
      const rows = lines.slice(1).map(parseCsvLine).map((cells) => ({
        date: parseStatementDate(cells[dateIndex] || ""),
        description: referenceIndex >= 0 && cells[referenceIndex]?.trim()
          ? `${cells[descriptionIndex]?.trim()} — ${cells[referenceIndex].trim()}`
          : cells[descriptionIndex]?.trim(),
        amount: parseStatementAmount(cells[amountIndex] || ""),
        bankCategory: categoryIndex >= 0 ? cells[categoryIndex]?.trim() : "",
      })).filter((row) => row.date && row.description && Number.isFinite(row.amount) && row.amount !== 0);
      if (rows.length === 0) throw new Error("We recognised the columns but could not find any valid transaction rows.");
      const result = await importStatementRows(rows, account);
      onImported(`${result.imported} transactions imported${result.skipped ? ` · ${result.skipped} duplicates skipped` : ""}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We couldn’t read that statement.");
      setBusy(false);
    }
  }
  return <ModalFrame title="Import a bank statement" subtitle="Works immediately" onClose={onClose}>
    <p className="modal-intro">Download a CSV from your bank. HearthPlan will detect duplicates and apply any category rules you’ve taught it.</p>
    <div className="import-drop">
      <FileUp />
      <strong>{file ? file.name : "Choose a CSV statement"}</strong>
      <span>Supports Date, Counter Party, Reference, Amount (GBP) and Spending Category</span>
      <input type="file" accept=".csv,text/csv" onChange={(event) => setFile(event.target.files?.[0] || null)} />
    </div>
    <label className="modal-field"><span>Account name</span><input value={account} onChange={(event) => setAccount(event.target.value)} /></label>
    {error && <div className="modal-error"><CircleAlert size={15} /> {error}</div>}
    <button className="primary-button modal-submit" disabled={!file || busy} onClick={runImport}>{busy ? <Loader2 className="animate-spin" size={16} /> : <FileUp size={16} />} Import transactions</button>
  </ModalFrame>;
}
