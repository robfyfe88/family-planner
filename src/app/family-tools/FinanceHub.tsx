"use client";

import React from "react";
import {
  ArrowRight,
  Banknote,
  CalendarDays,
  Check,
  ChevronRight,
  CreditCard,
  Flag,
  Gauge,
  Landmark,
  Loader2,
  PiggyBank,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  WalletCards,
} from "lucide-react";
import ModernMonthlyPlan from "./ModernMonthlyPlan";
import { fetchBudgetRowsForMonth } from "@/app/app/budget/actions";
import {
  allocateDebtOverpayment,
  canReceiveOverpayment,
  orderDebts,
  overpaymentCapacity,
} from "@/lib/debt-plan";
import {
  fetchFreedomData,
  removeDebt,
  saveDebt,
  saveFinancialProfile,
  saveGoal,
} from "@/app/app/budget/freedom-actions";

type View = "overview" | "plan" | "debt" | "savings";
type Strategy = "avalanche" | "snowball";
type Debt = { id: string; name: string; balance: number; apr: number; minimum: number; promotionalEndDate: string };
type Goal = { id: string; name: string; target: number; saved: number; monthly: number; targetDate: string };
type Profile = { strategy: Strategy; extraPayment: number; fireTarget: number; emergencyFundMonths: number };

const money = (value: number, compact = false) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: compact ? 0 : 2,
    notation: compact && Math.abs(value) >= 10000 ? "compact" : "standard",
  }).format(Number.isFinite(value) ? value : 0);

const number = (value: string) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

const roundMoney = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

const monthName = new Intl.DateTimeFormat("en-GB", { month: "long" }).format(new Date());
const flexLabels = new Set(["unforeseen monthly costs", "joint family spending"]);

function calculatePayoff(debts: Debt[], strategy: Strategy, extra: number) {
  const working = debts
    .filter((debt) => debt.balance > 0)
    .map((debt) => ({ ...debt, original: debt.balance }));
  const monthlyBudget = working.reduce((sum, debt) => sum + debt.minimum, 0) + Math.max(0, extra);
  let interest = 0;
  let months = 0;
  const cleared: Array<{ name: string; month: number }> = [];

  while (working.some((debt) => debt.balance > 0.005) && months < 600 && monthlyBudget > 0) {
    months += 1;
    for (const debt of working) {
      if (debt.balance <= 0) continue;
      const charged = debt.balance * (debt.apr / 100 / 12);
      debt.balance += charged;
      interest += charged;
    }

    let remaining = monthlyBudget;
    for (const debt of working) {
      if (debt.balance <= 0 || remaining <= 0) continue;
      const payment = Math.min(debt.balance, debt.minimum, remaining);
      debt.balance -= payment;
      remaining -= payment;
    }

    const ordered = orderDebts(working.filter(canReceiveOverpayment), strategy);
    for (const debt of ordered) {
      if (debt.balance <= 0 || remaining <= 0) continue;
      const payment = Math.min(debt.balance, remaining);
      debt.balance -= payment;
      remaining -= payment;
    }

    for (const debt of working) {
      if (debt.balance <= 0.005 && !cleared.some((item) => item.name === debt.name)) {
        cleared.push({ name: debt.name, month: months });
      }
    }
  }

  return {
    months,
    interest,
    monthlyBudget,
    cleared,
    possible: working.length === 0 || working.every((debt) => debt.balance <= 0.005),
  };
}

export default function FinanceHub() {
  const [view, setView] = React.useState<View>("overview");
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [savingDebtId, setSavingDebtId] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState("");
  const [income, setIncome] = React.useState(0);
  const [expenses, setExpenses] = React.useState(0);
  const [flexibleCosts, setFlexibleCosts] = React.useState(0);
  const [debts, setDebts] = React.useState<Debt[]>([]);
  const [goals, setGoals] = React.useState<Goal[]>([]);
  const [profile, setProfile] = React.useState<Profile>({
    strategy: "avalanche",
    extraPayment: 0,
    fireTarget: 0,
    emergencyFundMonths: 3,
  });

  const load = React.useCallback(async (quiet = false) => {
    quiet ? setRefreshing(true) : setLoading(true);
    const now = new Date();
    const fundedPlanDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    try {
      const [payBudget, fundedBudget, freedom] = await Promise.all([
        fetchBudgetRowsForMonth(now.getFullYear(), now.getMonth() + 1),
        fetchBudgetRowsForMonth(fundedPlanDate.getFullYear(), fundedPlanDate.getMonth() + 1),
        fetchFreedomData(),
      ]);
      setIncome(payBudget.incomes.reduce((sum, row) => sum + row.amount, 0));
      setExpenses(fundedBudget.expenses.reduce((sum, row) => sum + row.amount, 0));
      setFlexibleCosts(fundedBudget.expenses
        .filter((row) => flexLabels.has(row.label.trim().toLowerCase()))
        .reduce((sum, row) => sum + row.amount, 0));
      setDebts(freedom.debts);
      setGoals(freedom.goals);
      setProfile(freedom.profile);
    } catch {
      setMessage("We couldn’t refresh the household figures. Your current view is still safe.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const debtTotal = roundMoney(debts.reduce((sum, debt) => sum + debt.balance, 0));
  const attackableDebtTotal = roundMoney(debts.filter(canReceiveOverpayment).reduce((sum, debt) => sum + debt.balance, 0));
  const debtMinimums = roundMoney(debts.reduce((sum, debt) => sum + debt.minimum, 0));
  const emergencyGoal = goals.find((goal) => /emergency|rainy day|buffer/i.test(goal.name));
  const emergencySaved = emergencyGoal?.saved || 0;
  const extraAfterCommitments = roundMoney(Math.max(0, income - expenses - debtMinimums));
  const starterEmergencyTarget = roundMoney(expenses + debtMinimums);
  const fullEmergencyTarget = roundMoney(starterEmergencyTarget * Math.max(1, profile.emergencyFundMonths));
  const baseSuggestedSavings = emergencySaved < starterEmergencyTarget
    ? Math.min(
        roundMoney(starterEmergencyTarget - emergencySaved),
        attackableDebtTotal > 0 ? Math.ceil(extraAfterCommitments * 100 / 2) / 100 : extraAfterCommitments
      )
    : attackableDebtTotal === 0 ? extraAfterCommitments : 0;
  const proposedDebtExtra = attackableDebtTotal > 0
    ? roundMoney(Math.max(0, extraAfterCommitments - baseSuggestedSavings))
    : 0;
  const suggestedDebtExtra = roundMoney(Math.min(proposedDebtExtra, overpaymentCapacity(debts)));
  const suggestedSavings = roundMoney(baseSuggestedSavings + proposedDebtExtra - suggestedDebtExtra);
  const shortfall = roundMoney(Math.max(0, expenses + debtMinimums - income));
  const debtAllocations = React.useMemo(
    () => allocateDebtOverpayment(debts, profile.strategy, suggestedDebtExtra).allocations,
    [debts, profile.strategy, suggestedDebtExtra]
  );
  const payoff = React.useMemo(
    () => calculatePayoff(debts, profile.strategy, suggestedDebtExtra),
    [debts, profile.strategy, suggestedDebtExtra]
  );

  async function updateProfile(patch: Partial<Profile>) {
    const next = { ...profile, ...patch };
    setProfile(next);
    try {
      await saveFinancialProfile(next);
    } catch {
      setMessage("That setting didn’t save. Please try again.");
    }
  }

  async function persistDebt(debt: Debt) {
    if (savingDebtId) return;
    setSavingDebtId(debt.id);
    try {
      const saved = await saveDebt({ ...debt, id: debt.id.startsWith("new-") ? undefined : debt.id });
      if (debt.id.startsWith("new-")) {
        setDebts((items) => items.map((item) => item.id === debt.id ? { ...debt, id: saved.id } : item));
      }
      setMessage(`${debt.name.trim() || "Debt"} saved.`);
    } catch {
      setMessage("That debt didn’t save. Please try again.");
    } finally {
      setSavingDebtId(null);
    }
  }

  async function persistGoal(goal: Goal) {
    try {
      const saved = await saveGoal(goal);
      if (goal.id.startsWith("new-")) {
        setGoals((items) => items.map((item) => item.id === goal.id ? { ...goal, id: saved.id } : item));
      }
    } catch {
      setMessage("That goal didn’t save. Please try again.");
    }
  }

  if (loading) {
    return (
      <div className="finance-loading">
        <Loader2 className="animate-spin" size={24} />
        <span>Bringing your household money picture together…</span>
      </div>
    );
  }

  return (
    <div className="finance-shell">
      <header className="finance-hero">
        <div>
          <div className="finance-eyebrow"><Sparkles size={14} /> Family money plan</div>
          <h1>Know what to pay, save and clear</h1>
          <p>A simple shared plan for income, commitments, emergency savings and becoming debt free.</p>
        </div>
        <button className="soft-button" onClick={() => load(true)} disabled={refreshing}>
          <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
          Refresh figures
        </button>
      </header>

      {message && (
        <button className="finance-message" onClick={() => setMessage("")} aria-label="Dismiss message">
          {message}
        </button>
      )}

      <nav className="finance-nav" aria-label="Money sections">
        <FinanceNavItem active={view === "overview"} onClick={() => setView("overview")} icon={<Gauge />} label="Overview" />
        <FinanceNavItem active={view === "plan"} onClick={() => setView("plan")} icon={<WalletCards />} label="Monthly plan" />
        <FinanceNavItem active={view === "debt"} onClick={() => setView("debt")} icon={<CreditCard />} label="Debt freedom" />
        <FinanceNavItem active={view === "savings"} onClick={() => setView("savings")} icon={<PiggyBank />} label="Emergency savings" />
      </nav>

      {view === "overview" && (
        <Overview
          income={income}
          expenses={expenses}
          flexibleCosts={flexibleCosts}
          debtMinimums={debtMinimums}
          suggestedSavings={suggestedSavings}
          suggestedDebtExtra={suggestedDebtExtra}
          shortfall={shortfall}
          emergencySaved={emergencySaved}
          starterEmergencyTarget={starterEmergencyTarget}
          debtTotal={debtTotal}
          attackableDebtTotal={attackableDebtTotal}
          payoffMonths={payoff.months}
          onNavigate={setView}
        />
      )}

      {view === "plan" && (
        <ModernMonthlyPlan
          debts={debts}
          goals={goals}
          strategy={profile.strategy}
          emergencyFundMonths={profile.emergencyFundMonths}
          onFinanceChanged={() => load(true)}
        />
      )}

      {view === "debt" && (
        <DebtFreedom
          debts={debts}
          setDebts={setDebts}
          profile={profile}
          updateProfile={updateProfile}
          persistDebt={persistDebt}
          savingDebtId={savingDebtId}
          payoff={payoff}
          suggestedExtra={suggestedDebtExtra}
          allocations={debtAllocations}
          onRemove={async (id) => {
            setDebts((items) => items.filter((item) => item.id !== id));
            if (!id.startsWith("new-")) await removeDebt(id);
          }}
        />
      )}

      {view === "savings" && (
        <EmergencySavings
          goal={emergencyGoal}
          profile={profile}
          updateProfile={updateProfile}
          persistGoal={persistGoal}
          target={fullEmergencyTarget}
          starterTarget={starterEmergencyTarget}
          suggestedMonthly={suggestedSavings}
        />
      )}
    </div>
  );
}

function FinanceNavItem({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button className={active ? "active" : ""} onClick={onClick}>
      {icon}<span>{label}</span>
    </button>
  );
}

function Overview(props: {
  income: number;
  expenses: number;
  flexibleCosts: number;
  debtMinimums: number;
  suggestedSavings: number;
  suggestedDebtExtra: number;
  shortfall: number;
  emergencySaved: number;
  starterEmergencyTarget: number;
  debtTotal: number;
  attackableDebtTotal: number;
  payoffMonths: number;
  onNavigate: (view: View) => void;
}) {
  const {
    income, expenses, flexibleCosts, debtMinimums, suggestedSavings, suggestedDebtExtra, shortfall,
    emergencySaved, starterEmergencyTarget, debtTotal, attackableDebtTotal, payoffMonths, onNavigate,
  } = props;
  const regularExpenses = roundMoney(Math.max(0, expenses - flexibleCosts));
  const budgetHealth = income <= 0
    ? "Add your income to get started"
    : shortfall > 0
      ? "Your commitments are above income"
      : "Every extra pound has a job";
  const extra = suggestedSavings + suggestedDebtExtra;

  return (
    <div className="finance-overview">
      <section className="money-scorecard">
        <div className="scorecard-copy">
          <span className="section-kicker">{monthName} pay cycle</span>
          <h2>{budgetHealth}</h2>
          <p>
            {income <= 0
              ? "Enter both take-home pays, then add the bills and debt minimums you must cover."
              : shortfall > 0
                ? `You are ${money(shortfall)} short before savings or debt overpayments. Check the monthly plan first.`
                : `${money(extra)} remains after commitments. HearthPlan assigns it to emergency savings and debt below.`}
          </p>
          <button className="primary-button" onClick={() => onNavigate("plan")}>
            Review this pay cycle <ArrowRight size={17} />
          </button>
        </div>
        <div className="overview-allocation">
          <span><small>Expected income</small><strong>{money(income)}</strong></span>
          <span><small>Bills + debt minimums</small><strong>{money(expenses + debtMinimums)}</strong></span>
          <span><small>For savings + debt</small><strong>{money(extra)}</strong></span>
        </div>
      </section>

      <section className="stat-grid">
        <MetricCard icon={<Banknote />} tone="mint" label="Expected income" value={money(income)} note="Both take-home pays" />
        <MetricCard icon={<CalendarDays />} tone="sand" label="Planned outgoings" value={money(expenses + debtMinimums)} note={`${money(regularExpenses)} commitments · ${money(flexibleCosts)} flexible costs · ${money(debtMinimums)} debt minimums`} />
        <MetricCard icon={<PiggyBank />} tone="blue" label="Save from this pay" value={money(suggestedSavings)} note={`${money(emergencySaved)} currently in your emergency fund`} />
        <MetricCard
          icon={<CreditCard />}
          tone="lavender"
          label="Debt overpayment"
          value={money(suggestedDebtExtra)}
          note={attackableDebtTotal > 0 ? `${money(attackableDebtTotal)} eligible for overpayments` : debtTotal > 0 ? "Fixed 0% plans stay on minimums" : "No debt balance entered"}
        />
      </section>

      <section className="overview-grid">
        <article className="finance-panel action-panel">
          <div className="panel-title-row">
            <div><span className="section-kicker">Three checks</span><h3>Complete this pay cycle in order</h3></div>
            <Flag size={20} />
          </div>
          <ActionRow
            done={income > 0 && (expenses > 0 || debtMinimums > 0)}
            title="Confirm income and commitments"
            detail={income > 0 && (expenses > 0 || debtMinimums > 0) ? "Your starting numbers are in place." : "Add both pays and every must-pay bill."}
            onClick={() => onNavigate("plan")}
          />
          <ActionRow
            done={debtTotal === 0}
            title={attackableDebtTotal > 0 ? "Check the priority debt" : debtTotal > 0 ? "Keep fixed 0% plans on schedule" : "Add your debt balances"}
            detail={attackableDebtTotal > 0 ? `${money(suggestedDebtExtra)} extra from this pay · projected ${formatMonths(payoffMonths)}` : debtTotal > 0 ? "Minimum payments only; no overpayments are assigned." : "Add balances, minimums and APR where known."}
            onClick={() => onNavigate("debt")}
          />
          <ActionRow
            done={starterEmergencyTarget > 0 && emergencySaved >= starterEmergencyTarget}
            title="Keep a monthly safety contribution"
            detail={starterEmergencyTarget > 0 ? `${money(emergencySaved)} of ${money(starterEmergencyTarget)} starter buffer saved.` : "Your starter target appears once commitments are entered."}
            onClick={() => onNavigate("savings")}
          />
        </article>

        <article className="finance-panel cashflow-panel">
          <div className="panel-title-row">
            <div><span className="section-kicker">Fully allocated</span><h3>Where this pay goes</h3></div>
            <CalendarDays size={20} />
          </div>
          <FlowRow label="Income" value={income} total={income || 1} color="var(--money-mint)" />
          <FlowRow label="Regular commitments" value={regularExpenses} total={income || Math.max(regularExpenses, 1)} color="var(--money-coral)" />
          <FlowRow label="Real-life allowances" value={flexibleCosts} total={income || Math.max(flexibleCosts, 1)} color="#c9a86a" />
          <FlowRow label="Debt minimums" value={debtMinimums} total={income || Math.max(debtMinimums, 1)} color="#b98a72" />
          <FlowRow label="Emergency savings" value={suggestedSavings} total={income || Math.max(suggestedSavings, 1)} color="var(--money-blue)" />
          <FlowRow label="Extra debt payment" value={suggestedDebtExtra} total={income || Math.max(suggestedDebtExtra, 1)} color="#836ca7" />
          <div className={`cashflow-balance ${shortfall > 0 ? "negative" : ""}`}>
            <span>{shortfall > 0 ? "Plan shortfall" : "Remaining after plan"}</span><strong>{money(shortfall)}</strong>
          </div>
        </article>
      </section>
    </div>
  );
}

function MetricCard({ icon, tone, label, value, note }: {
  icon: React.ReactNode; tone: string; label: string; value: string; note: string;
}) {
  return (
    <article className={`metric-card ${tone}`}>
      <div className="metric-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

function ActionRow({ done, title, detail, onClick }: { done: boolean; title: string; detail: string; onClick: () => void }) {
  return (
    <button className="action-row" onClick={onClick}>
      <span className={done ? "action-check done" : "action-check"}>{done ? <Check size={15} /> : null}</span>
      <span><strong>{title}</strong><small>{detail}</small></span>
      <ChevronRight size={18} />
    </button>
  );
}

function FlowRow({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const width = Math.min(100, Math.max(value > 0 ? 4 : 0, (value / total) * 100));
  return (
    <div className="flow-row">
      <div><span>{label}</span><strong>{money(value)}</strong></div>
      <div className="flow-track"><span style={{ width: `${width}%`, background: color }} /></div>
    </div>
  );
}

function DebtFreedom({ debts, setDebts, profile, updateProfile, persistDebt, savingDebtId, payoff, suggestedExtra, allocations, onRemove }: {
  debts: Debt[]; setDebts: React.Dispatch<React.SetStateAction<Debt[]>>; profile: Profile;
  updateProfile: (patch: Partial<Profile>) => Promise<void>; persistDebt: (debt: Debt) => Promise<void>;
  savingDebtId: string | null;
  payoff: ReturnType<typeof calculatePayoff>; suggestedExtra: number; onRemove: (id: string) => Promise<void>;
  allocations: Array<{ id: string; name: string; amount: number }>;
}) {
  const total = debts.reduce((sum, debt) => sum + debt.balance, 0);
  const update = (id: string, patch: Partial<Debt>) =>
    setDebts((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));

  return (
    <div className="debt-layout">
      <section className="finance-panel debt-summary">
        <div className="section-heading">
          <div><span className="section-kicker">Your exit plan</span><h2>Pay debts down with purpose</h2><p>Enter each balance, minimum and APR. Add an end date only for a temporary 0% deal; permanent 0% plans stay on minimum payments.</p></div>
        </div>
        <div className="debt-kpis">
          <div><span>Total remaining</span><strong>{money(total)}</strong></div>
          <div><span>Planned debt payment</span><strong>{money(payoff.monthlyBudget)}</strong></div>
          <div><span>Projected debt-free</span><strong>{total === 0 ? "Today" : formatMonths(payoff.months)}</strong></div>
          <div><span>Projected interest</span><strong>{money(payoff.interest)}</strong></div>
        </div>
        <div className="debt-maths" aria-label="How this pay cycle's debt payment is calculated">
          <span><small>Debt minimums</small><strong>{money(payoff.monthlyBudget - suggestedExtra)}</strong></span>
          <b>+</b>
          <span><small>Affordable overpayment</small><strong>{money(suggestedExtra)}</strong></span>
          <b>=</b>
          <span><small>Total debt payment</small><strong>{money(payoff.monthlyBudget)}</strong></span>
        </div>
        <div className="strategy-box">
          <div>
            <span className="section-kicker">Payoff strategy</span>
            <div className="segmented">
              <button className={profile.strategy === "avalanche" ? "active" : ""} onClick={() => updateProfile({ strategy: "avalanche" })}>Avalanche</button>
              <button className={profile.strategy === "snowball" ? "active" : ""} onClick={() => updateProfile({ strategy: "snowball" })}>Snowball</button>
            </div>
            <p>{profile.strategy === "avalanche" ? "Highest APR first — usually saves the most interest." : "Smallest eligible balance first — fixed 0% plans stay on minimum payments."}</p>
          </div>
          <div className="recommended-extra"><span>From this pay-cycle plan</span><strong>{money(suggestedExtra)}</strong><small>extra after commitments, flexible costs and emergency saving</small></div>
        </div>
        {allocations.length > 0 && (
          <div className="debt-allocation">
            <span className="section-kicker">This month&apos;s overpayment split</span>
            {allocations.map((allocation, index) => (
              <div key={allocation.id}>
                <span>{index + 1}. {allocation.name}</span>
                <strong>{money(allocation.amount)}</strong>
              </div>
            ))}
            <small>Each debt receives only what it needs after its minimum payment; any remainder rolls to the next eligible debt.</small>
          </div>
        )}
      </section>

      <section className="finance-panel">
        <div className="panel-title-row">
          <div><span className="section-kicker">Household debts</span><h3>Balances, rates and minimum payments</h3></div>
          <button className="soft-button" onClick={() => setDebts((items) => [...items, { id: `new-${Date.now()}`, name: "New debt", balance: 0, apr: 0, minimum: 0, promotionalEndDate: "" }])}><Plus size={16} /> Add debt</button>
        </div>
        {debts.length === 0 ? (
          <EmptyState icon={<Landmark />} title="No debts added" text="If you’re already debt free, brilliant. Otherwise add each balance to build your plan." />
        ) : (
          <div className="debt-list">
            {orderDebts(debts, profile.strategy).map((debt, index) => (
              <article className={`editable-row ${canReceiveOverpayment(debt) ? "" : "fixed-zero"}`} key={debt.id}>
                <div className="row-order">{index + 1}</div>
                <label><span>Name</span><input value={debt.name} onChange={(e) => update(debt.id, { name: e.target.value })} /></label>
                <MoneyInput label="Balance" value={debt.balance} onChange={(balance) => update(debt.id, { balance })} />
                <label><span>APR</span><div className="suffix-input"><input type="number" min="0" step=".01" value={debt.apr} onChange={(e) => update(debt.id, { apr: number(e.target.value) })} /><b>%</b></div></label>
                <MoneyInput label="Minimum" value={debt.minimum} onChange={(minimum) => update(debt.id, { minimum })} />
                <label className="promo-date-field">
                  <span>0% ends (optional)</span>
                  <input type="date" value={debt.promotionalEndDate} onChange={(event) => update(debt.id, { promotionalEndDate: event.target.value })} />
                  {debt.apr === 0 && !debt.promotionalEndDate && <small>Minimum only</small>}
                </label>
                <button className="soft-button debt-save-button" disabled={Boolean(savingDebtId)} onClick={() => persistDebt(debt)}>
                  {savingDebtId === debt.id ? <Loader2 className="animate-spin" size={15} /> : <Check size={15} />}
                  {savingDebtId === debt.id ? "Saving" : "Save"}
                </button>
                <button className="icon-button danger" onClick={() => onRemove(debt.id)} aria-label={`Remove ${debt.name}`}><Trash2 size={16} /></button>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function EmergencySavings({ goal, profile, updateProfile, persistGoal, target, starterTarget, suggestedMonthly }: {
  goal?: Goal;
  profile: Profile;
  updateProfile: (patch: Partial<Profile>) => Promise<void>;
  persistGoal: (goal: Goal) => Promise<void>;
  target: number;
  starterTarget: number;
  suggestedMonthly: number;
}) {
  const [saved, setSaved] = React.useState(goal?.saved || 0);
  React.useEffect(() => setSaved(goal?.saved || 0), [goal?.saved]);
  const starterPercent = starterTarget > 0 ? Math.min(100, (saved / starterTarget) * 100) : 0;
  const fullPercent = target > 0 ? Math.min(100, (saved / target) * 100) : 0;

  async function persistSaved() {
    if (!goal) return;
    await persistGoal({ ...goal, saved, target, monthly: suggestedMonthly });
  }

  return (
    <div className="savings-layout">
      <section className="finance-panel emergency-panel">
        <div className="section-heading">
          <div><span className="section-kicker">Your safety net</span><h2>Save something every month</h2><p>The first milestone is one month of commitments. Until then, HearthPlan splits your extra money equally between this fund and your priority debt.</p></div>
        </div>
        <div className="emergency-kpis">
          <div><span>Saved now</span><strong>{money(saved)}</strong></div>
          <div><span>Save from this pay</span><strong>{money(suggestedMonthly)}</strong></div>
          <div><span>Starter buffer</span><strong>{money(starterTarget)}</strong></div>
          <div><span>Full target</span><strong>{money(target)}</strong></div>
        </div>
        <div className="emergency-progress-block">
          <div className="panel-title-row"><span>One-month starter buffer</span><strong>{Math.round(starterPercent)}%</strong></div>
          <div className="goal-progress"><span style={{ width: `${starterPercent}%` }} /></div>
          <small>{money(Math.max(0, starterTarget - saved))} left to reach the first safety milestone.</small>
        </div>
        <div className="emergency-fields">
          <MoneyInput label="Emergency savings balance" value={saved} onChange={setSaved} onBlur={persistSaved} />
          <label><span>Longer-term target</span><div className="suffix-input"><input type="number" min="1" max="6" value={profile.emergencyFundMonths} onChange={(event) => updateProfile({ emergencyFundMonths: number(event.target.value) })} /><b>months</b></div></label>
        </div>
      </section>

      <section className="finance-panel emergency-explainer">
        <PiggyBank />
        <div><span className="section-kicker">Simple rule</span><h3>Buffer first, without pausing debt progress</h3></div>
        <ol>
          <li><b>Cover commitments</b><span>Mortgage, bills and every debt minimum are protected first.</span></li>
          <li><b>Build one month of safety</b><span>Half of the extra goes here and half attacks the priority debt.</span></li>
          <li><b>Accelerate debt</b><span>After the starter buffer, all extra goes to debt until it is cleared.</span></li>
          <li><b>Finish the full buffer</b><span>Once debt is gone, the whole surplus builds towards {profile.emergencyFundMonths} months.</span></li>
        </ol>
        <div className="target-progress"><div><span style={{ width: `${fullPercent}%` }} /></div><p>{Math.round(fullPercent)}% of the full emergency target saved</p></div>
      </section>
    </div>
  );
}

function MoneyInput({ label, value, onChange, onBlur }: { label: string; value: number; onChange: (value: number) => void; onBlur?: () => void }) {
  return (
    <label className="money-field">
      <span>{label}</span>
      <div><b>£</b><input type="number" min="0" step=".01" value={value} onChange={(e) => onChange(number(e.target.value))} onBlur={onBlur} /></div>
    </label>
  );
}

function EmptyState({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="finance-empty"><div>{icon}</div><strong>{title}</strong><p>{text}</p></div>;
}

function formatMonths(months: number) {
  if (!Number.isFinite(months) || months <= 0) return "not yet forecast";
  if (months >= 600) return "50+ years";
  const years = Math.floor(months / 12);
  const remainder = months % 12;
  if (!years) return `${months} month${months === 1 ? "" : "s"}`;
  return `${years}y${remainder ? ` ${remainder}m` : ""}`;
}
