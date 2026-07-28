"use client";

import React from "react";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
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
  Target,
  Trash2,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import ModernMonthlyPlan from "./ModernMonthlyPlan";
import { fetchBudgetRowsForMonth } from "@/app/app/budget/actions";
import { fetchPotPlans, fetchPots } from "@/app/app/budget/pots-actions";
import {
  fetchFreedomData,
  removeDebt,
  removeGoal,
  saveDebt,
  saveFinancialProfile,
  saveGoal,
} from "@/app/app/budget/freedom-actions";

type View = "overview" | "plan" | "debt" | "goals";
type Strategy = "avalanche" | "snowball";
type Debt = { id: string; name: string; balance: number; apr: number; minimum: number };
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

const monthName = new Intl.DateTimeFormat("en-GB", { month: "long" }).format(new Date());

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

    const ordered = [...working].sort((a, b) =>
      strategy === "avalanche" ? b.apr - a.apr : a.balance - b.balance
    );
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
  const [message, setMessage] = React.useState("");
  const [income, setIncome] = React.useState(0);
  const [expenses, setExpenses] = React.useState(0);
  const [monthlySavings, setMonthlySavings] = React.useState(0);
  const [potsTotal, setPotsTotal] = React.useState(0);
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
    try {
      const [budget, pots, potPlans, freedom] = await Promise.all([
        fetchBudgetRowsForMonth(now.getFullYear(), now.getMonth() + 1),
        fetchPots(),
        fetchPotPlans(now.getFullYear()),
        fetchFreedomData(),
      ]);
      setIncome(budget.incomes.reduce((sum, row) => sum + row.amount, 0));
      setExpenses(budget.expenses.reduce((sum, row) => sum + row.amount, 0));
      setPotsTotal(pots.reduce((sum, pot) => sum + pot.balancePence / 100, 0));
      setMonthlySavings(
        pots.reduce((sum, pot) => sum + ((potPlans.byPot[pot.id]?.[now.getMonth() + 1] ?? 0) as number), 0)
      );
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

  const debtTotal = debts.reduce((sum, debt) => sum + debt.balance, 0);
  const goalSaved = goals.reduce((sum, goal) => sum + goal.saved, 0);
  const goalMonthly = goals.reduce((sum, goal) => sum + goal.monthly, 0);
  const available = income - expenses - monthlySavings;
  const savingsRate = income > 0 ? ((monthlySavings + Math.max(0, available)) / income) * 100 : 0;
  const freedomBase = Math.max(0, potsTotal + goalSaved - debtTotal);
  const freedomPercent = profile.fireTarget > 0 ? Math.min(100, (freedomBase / profile.fireTarget) * 100) : 0;
  const payoff = React.useMemo(
    () => calculatePayoff(debts, profile.strategy, profile.extraPayment),
    [debts, profile.strategy, profile.extraPayment]
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
    try {
      const saved = await saveDebt(debt);
      if (debt.id.startsWith("new-")) {
        setDebts((items) => items.map((item) => item.id === debt.id ? { ...debt, id: saved.id } : item));
      }
    } catch {
      setMessage("That debt didn’t save. Please try again.");
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
          <h1>Your path to financial freedom</h1>
          <p>One shared view of today’s cash, every debt, and the future you’re building together.</p>
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
        <FinanceNavItem active={view === "goals"} onClick={() => setView("goals")} icon={<Target />} label="Goals & future" />
      </nav>

      {view === "overview" && (
        <Overview
          income={income}
          expenses={expenses}
          monthlySavings={monthlySavings}
          available={available}
          savingsRate={savingsRate}
          debtTotal={debtTotal}
          payoffMonths={payoff.months}
          goalMonthly={goalMonthly}
          freedomPercent={freedomPercent}
          freedomBase={freedomBase}
          fireTarget={profile.fireTarget}
          onNavigate={setView}
        />
      )}

      {view === "plan" && (
        <ModernMonthlyPlan
          debts={debts}
          goals={goals}
          strategy={profile.strategy}
          emergencyFundMonths={profile.emergencyFundMonths}
        />
      )}

      {view === "debt" && (
        <DebtFreedom
          debts={debts}
          setDebts={setDebts}
          profile={profile}
          updateProfile={updateProfile}
          persistDebt={persistDebt}
          payoff={payoff}
          onRemove={async (id) => {
            setDebts((items) => items.filter((item) => item.id !== id));
            if (!id.startsWith("new-")) await removeDebt(id);
          }}
        />
      )}

      {view === "goals" && (
        <Goals
          goals={goals}
          setGoals={setGoals}
          profile={profile}
          updateProfile={updateProfile}
          persistGoal={persistGoal}
          freedomBase={freedomBase}
          onRemove={async (id) => {
            setGoals((items) => items.filter((item) => item.id !== id));
            if (!id.startsWith("new-")) await removeGoal(id);
          }}
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
  income: number; expenses: number; monthlySavings: number; available: number; savingsRate: number;
  debtTotal: number; payoffMonths: number; goalMonthly: number; freedomPercent: number;
  freedomBase: number; fireTarget: number; onNavigate: (view: View) => void;
}) {
  const {
    income, expenses, monthlySavings, available, savingsRate, debtTotal, payoffMonths,
    goalMonthly, freedomPercent, freedomBase, fireTarget, onNavigate,
  } = props;
  const budgetHealth = income <= 0 ? "Add your income to get started" : available >= 0 ? "Your plan is in the green" : "Your plan needs attention";

  return (
    <div className="finance-overview">
      <section className="money-scorecard">
        <div className="scorecard-copy">
          <span className="section-kicker">{monthName} pulse</span>
          <h2>{budgetHealth}</h2>
          <p>
            {income <= 0
              ? "Start with your take-home pay, then work through essentials, debt and the future."
              : available >= 0
                ? `${money(available)} remains after planned costs and savings. Decide where it can make the biggest difference.`
                : `Planned outgoings are ${money(Math.abs(available))} above income. A few changes now protect your bigger goals.`}
          </p>
          <button className="primary-button" onClick={() => onNavigate("plan")}>
            Review this month <ArrowRight size={17} />
          </button>
        </div>
        <div className="freedom-ring" style={{ "--progress": `${freedomPercent * 3.6}deg` } as React.CSSProperties}>
          <div>
            <strong>{Math.round(freedomPercent)}%</strong>
            <span>of freedom target</span>
          </div>
        </div>
      </section>

      <section className="stat-grid">
        <MetricCard icon={<Banknote />} tone="mint" label="Monthly income" value={money(income)} note="Take-home household income" trend="up" />
        <MetricCard icon={<ArrowDownRight />} tone="sand" label="Planned spending" value={money(expenses)} note={`${income > 0 ? Math.round((expenses / income) * 100) : 0}% of household income`} />
        <MetricCard icon={<PiggyBank />} tone="blue" label="Future you" value={money(monthlySavings + goalMonthly)} note="Monthly pots and goal contributions" trend="up" />
        <MetricCard icon={<TrendingUp />} tone="lavender" label="Savings rate" value={`${Math.max(0, savingsRate).toFixed(1)}%`} note="Target 20%+ for momentum" trend="up" />
      </section>

      <section className="overview-grid">
        <article className="finance-panel action-panel">
          <div className="panel-title-row">
            <div><span className="section-kicker">Next best moves</span><h3>This month’s focus</h3></div>
            <Flag size={20} />
          </div>
          <ActionRow
            done={income > 0 && expenses > 0}
            title="Complete your monthly plan"
            detail={income > 0 && expenses > 0 ? "Income and spending are mapped." : "Add income and essential costs to reveal your true surplus."}
            onClick={() => onNavigate("plan")}
          />
          <ActionRow
            done={debtTotal === 0}
            title={debtTotal > 0 ? "Aim your debt overpayment" : "You’re debt free"}
            detail={debtTotal > 0 ? `${money(debtTotal)} remaining · projected ${formatMonths(payoffMonths)}` : "Keep the momentum going towards your future goals."}
            onClick={() => onNavigate("debt")}
          />
          <ActionRow
            done={fireTarget > 0}
            title="Define your freedom number"
            detail={fireTarget > 0 ? `${money(freedomBase, true)} of ${money(fireTarget, true)} built.` : "Set the long-term number you’re working towards together."}
            onClick={() => onNavigate("goals")}
          />
        </article>

        <article className="finance-panel cashflow-panel">
          <div className="panel-title-row">
            <div><span className="section-kicker">Cash flow</span><h3>Where this month goes</h3></div>
            <CalendarDays size={20} />
          </div>
          <FlowRow label="Income" value={income} total={income || 1} color="var(--money-mint)" />
          <FlowRow label="Household costs" value={expenses} total={income || Math.max(expenses, 1)} color="var(--money-coral)" />
          <FlowRow label="Savings & pots" value={monthlySavings} total={income || Math.max(monthlySavings, 1)} color="var(--money-blue)" />
          <div className={`cashflow-balance ${available < 0 ? "negative" : ""}`}>
            <span>Left to decide</span><strong>{money(available)}</strong>
          </div>
        </article>
      </section>
    </div>
  );
}

function MetricCard({ icon, tone, label, value, note, trend }: {
  icon: React.ReactNode; tone: string; label: string; value: string; note: string; trend?: "up";
}) {
  return (
    <article className={`metric-card ${tone}`}>
      <div className="metric-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{trend && <ArrowUpRight size={13} />} {note}</small>
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

function DebtFreedom({ debts, setDebts, profile, updateProfile, persistDebt, payoff, onRemove }: {
  debts: Debt[]; setDebts: React.Dispatch<React.SetStateAction<Debt[]>>; profile: Profile;
  updateProfile: (patch: Partial<Profile>) => Promise<void>; persistDebt: (debt: Debt) => Promise<void>;
  payoff: ReturnType<typeof calculatePayoff>; onRemove: (id: string) => Promise<void>;
}) {
  const total = debts.reduce((sum, debt) => sum + debt.balance, 0);
  const update = (id: string, patch: Partial<Debt>) =>
    setDebts((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));

  return (
    <div className="debt-layout">
      <section className="finance-panel debt-summary">
        <div className="section-heading">
          <div><span className="section-kicker">Your exit plan</span><h2>Turn debt into a finish line</h2><p>Choose a strategy, add what you can, and see the date move closer.</p></div>
        </div>
        <div className="debt-kpis">
          <div><span>Total remaining</span><strong>{money(total)}</strong></div>
          <div><span>Monthly attack</span><strong>{money(payoff.monthlyBudget)}</strong></div>
          <div><span>Projected debt-free</span><strong>{total === 0 ? "Today" : formatMonths(payoff.months)}</strong></div>
          <div><span>Projected interest</span><strong>{money(payoff.interest)}</strong></div>
        </div>
        <div className="strategy-box">
          <div>
            <span className="section-kicker">Payoff strategy</span>
            <div className="segmented">
              <button className={profile.strategy === "avalanche" ? "active" : ""} onClick={() => updateProfile({ strategy: "avalanche" })}>Avalanche</button>
              <button className={profile.strategy === "snowball" ? "active" : ""} onClick={() => updateProfile({ strategy: "snowball" })}>Snowball</button>
            </div>
            <p>{profile.strategy === "avalanche" ? "Highest APR first — usually saves the most interest." : "Smallest balance first — creates faster psychological wins."}</p>
          </div>
          <label className="money-field">
            <span>Extra monthly payment</span>
            <div><b>£</b><input type="number" min="0" step="10" value={profile.extraPayment} onChange={(e) => setTimeout(() => updateProfile({ extraPayment: number(e.target.value) }), 0)} /></div>
          </label>
        </div>
      </section>

      <section className="finance-panel">
        <div className="panel-title-row">
          <div><span className="section-kicker">Household debts</span><h3>Everything in one place</h3></div>
          <button className="soft-button" onClick={() => setDebts((items) => [...items, { id: `new-${Date.now()}`, name: "New debt", balance: 0, apr: 0, minimum: 0 }])}><Plus size={16} /> Add debt</button>
        </div>
        {debts.length === 0 ? (
          <EmptyState icon={<Landmark />} title="No debts added" text="If you’re already debt free, brilliant. Otherwise add each balance to build your plan." />
        ) : (
          <div className="debt-list">
            {debts.map((debt, index) => (
              <article className="editable-row" key={debt.id}>
                <div className="row-order">{index + 1}</div>
                <label><span>Name</span><input value={debt.name} onChange={(e) => update(debt.id, { name: e.target.value })} onBlur={() => persistDebt(debt)} /></label>
                <MoneyInput label="Balance" value={debt.balance} onChange={(balance) => update(debt.id, { balance })} onBlur={() => persistDebt(debt)} />
                <label><span>APR</span><div className="suffix-input"><input type="number" min="0" step=".1" value={debt.apr} onChange={(e) => update(debt.id, { apr: number(e.target.value) })} onBlur={() => persistDebt(debt)} /><b>%</b></div></label>
                <MoneyInput label="Minimum" value={debt.minimum} onChange={(minimum) => update(debt.id, { minimum })} onBlur={() => persistDebt(debt)} />
                <button className="icon-button danger" onClick={() => onRemove(debt.id)} aria-label={`Remove ${debt.name}`}><Trash2 size={16} /></button>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Goals({ goals, setGoals, profile, updateProfile, persistGoal, freedomBase, onRemove }: {
  goals: Goal[]; setGoals: React.Dispatch<React.SetStateAction<Goal[]>>; profile: Profile;
  updateProfile: (patch: Partial<Profile>) => Promise<void>; persistGoal: (goal: Goal) => Promise<void>;
  freedomBase: number; onRemove: (id: string) => Promise<void>;
}) {
  const update = (id: string, patch: Partial<Goal>) =>
    setGoals((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
  const percent = profile.fireTarget > 0 ? Math.min(100, (freedomBase / profile.fireTarget) * 100) : 0;

  return (
    <div className="goals-layout">
      <section className="finance-panel freedom-target-panel">
        <div>
          <span className="section-kicker">The big picture</span>
          <h2>Name your freedom number</h2>
          <p>This is the invested wealth or capital you want to build towards. It turns “one day” into a measurable destination.</p>
        </div>
        <div className="target-input-row">
          <MoneyInput label="Financial independence target" value={profile.fireTarget} onChange={(fireTarget) => setProfileSoon(updateProfile, { fireTarget })} onBlur={() => undefined} />
          <label><span>Emergency fund</span><div className="suffix-input"><input type="number" min="1" max="12" value={profile.emergencyFundMonths} onChange={(e) => updateProfile({ emergencyFundMonths: number(e.target.value) })} /><b>months</b></div></label>
        </div>
        <div className="target-progress">
          <div><span style={{ width: `${percent}%` }} /></div>
          <p><strong>{money(freedomBase, true)}</strong> built · <strong>{Math.round(percent)}%</strong> of {money(profile.fireTarget, true) || "your target"}</p>
        </div>
      </section>

      <section className="finance-panel">
        <div className="panel-title-row">
          <div><span className="section-kicker">Nearer horizons</span><h3>Family goals</h3></div>
          <button className="soft-button" onClick={() => setGoals((items) => [...items, { id: `new-${Date.now()}`, name: "New goal", target: 0, saved: 0, monthly: 0, targetDate: "" }])}><Plus size={16} /> Add goal</button>
        </div>
        {goals.length === 0 ? (
          <EmptyState icon={<Target />} title="Create your first shared goal" text="Emergency fund, family holiday, home improvements or investing — give the future a name." />
        ) : (
          <div className="goal-grid">
            {goals.map((goal) => {
              const goalPercent = goal.target > 0 ? Math.min(100, (goal.saved / goal.target) * 100) : 0;
              const months = goal.monthly > 0 ? Math.ceil(Math.max(0, goal.target - goal.saved) / goal.monthly) : 0;
              return (
                <article className="goal-card" key={goal.id}>
                  <div className="goal-card-head">
                    <input className="goal-name" value={goal.name} onChange={(e) => update(goal.id, { name: e.target.value })} onBlur={() => persistGoal(goal)} />
                    <button className="icon-button danger" onClick={() => onRemove(goal.id)} aria-label={`Remove ${goal.name}`}><Trash2 size={15} /></button>
                  </div>
                  <div className="goal-progress"><span style={{ width: `${goalPercent}%` }} /></div>
                  <div className="goal-numbers"><strong>{money(goal.saved)}</strong><span>of {money(goal.target)}</span></div>
                  <div className="goal-fields">
                    <MoneyInput label="Saved" value={goal.saved} onChange={(saved) => update(goal.id, { saved })} onBlur={() => persistGoal(goal)} />
                    <MoneyInput label="Target" value={goal.target} onChange={(target) => update(goal.id, { target })} onBlur={() => persistGoal(goal)} />
                    <MoneyInput label="Per month" value={goal.monthly} onChange={(monthly) => update(goal.id, { monthly })} onBlur={() => persistGoal(goal)} />
                    <label><span>Target date</span><input type="date" value={goal.targetDate} onChange={(e) => update(goal.id, { targetDate: e.target.value })} onBlur={() => persistGoal(goal)} /></label>
                  </div>
                  <small>{months > 0 ? `At this pace: ${formatMonths(months)}` : "Add a monthly amount to forecast this goal."}</small>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function MoneyInput({ label, value, onChange, onBlur }: { label: string; value: number; onChange: (value: number) => void; onBlur: () => void }) {
  return (
    <label className="money-field">
      <span>{label}</span>
      <div><b>£</b><input type="number" min="0" step="1" value={value} onChange={(e) => onChange(number(e.target.value))} onBlur={onBlur} /></div>
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

function setProfileSoon(update: (patch: Partial<Profile>) => Promise<void>, patch: Partial<Profile>) {
  void update(patch);
}
