"use client";

import React from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  FileUp,
  Filter,
  Landmark,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  WalletCards,
  X,
} from "lucide-react";
import { fetchBudgetRowsForMonth } from "@/app/app/budget/actions";
import {
  addManualTransaction,
  deleteMoneyTransaction,
  fetchMoneyWorkspace,
  importStatementRows,
  removeCategoryRule,
  saveCategoryRule,
  setCategoryBudget,
  setTransactionCategory,
} from "@/app/app/budget/workspace-actions";

type Workspace = Awaited<ReturnType<typeof fetchMoneyWorkspace>>;
type WorkspaceTransaction = Workspace["transactions"][number];
type WorkspaceCategory = Workspace["categories"][number];
type WorkspaceView = "transactions" | "categories" | "plan" | "rules";

const money = (value: number, digits = 2) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number.isFinite(value) ? value : 0);

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const categoryTone = (name: string) => {
  const tones = ["mint", "blue", "coral", "lavender", "gold", "slate"];
  return tones[[...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % tones.length];
};

export default function ModernMonthlyPlan() {
  const now = new Date();
  const [cursor, setCursor] = React.useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [view, setView] = React.useState<WorkspaceView>("transactions");
  const [data, setData] = React.useState<Workspace | null>(null);
  const [plannedIncome, setPlannedIncome] = React.useState(0);
  const [plannedExpenses, setPlannedExpenses] = React.useState(0);
  const [committedBills, setCommittedBills] = React.useState<Array<{ id?: string; label: string; amount: number }>>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [categoryFilter, setCategoryFilter] = React.useState("all");
  const [reviewOnly, setReviewOnly] = React.useState(false);
  const [modal, setModal] = React.useState<"add" | "import" | "bank" | null>(null);
  const [toast, setToast] = React.useState("");

  const load = React.useCallback(async (quiet = false) => {
    quiet ? setRefreshing(true) : setLoading(true);
    try {
      const [workspace, budget] = await Promise.all([
        fetchMoneyWorkspace(cursor.year, cursor.month),
        fetchBudgetRowsForMonth(cursor.year, cursor.month),
      ]);
      setData(workspace);
      setPlannedIncome(budget.incomes.reduce((sum, item) => sum + item.amount, 0));
      setPlannedExpenses(budget.expenses.reduce((sum, item) => sum + item.amount, 0));
      setCommittedBills(budget.expenses);
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
    .filter((item) => item.flow === "expense")
    .reduce((sum, item) => sum + item.amount, 0);
  const actualIncome = data.transactions
    .filter((item) => item.flow === "income")
    .reduce((sum, item) => sum + item.amount, 0);
  const reviewCount = data.transactions.filter((item) => item.needsReview).length;
  const leftToSpend = plannedIncome - spending;
  const monthProgress = cursor.year === now.getFullYear() && cursor.month === now.getMonth() + 1
    ? Math.round((now.getDate() / new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()) * 100)
    : 100;

  const filtered = data.transactions.filter((item) => {
    const matchesSearch = item.description.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = categoryFilter === "all" || item.categoryId === categoryFilter;
    return matchesSearch && matchesCategory && (!reviewOnly || item.needsReview);
  });

  const categoryTotals = data.categories
    .filter((category) => category.flow === "expense")
    .map((category) => ({
      ...category,
      spent: data.transactions
        .filter((item) => item.flow === "expense" && item.categoryId === category.id)
        .reduce((sum, item) => sum + item.amount, 0),
    }))
    .sort((a, b) => b.spent - a.spent || a.name.localeCompare(b.name));

  const categoryPlanned = categoryTotals.reduce((sum, category) => sum + category.planned, 0);

  async function categorise(transaction: WorkspaceTransaction, categoryId: string, learn = true) {
    const category = data?.categories.find((item) => item.id === categoryId);
    setData((current) => current ? {
      ...current,
      transactions: current.transactions.map((item) => item.id === transaction.id
        ? { ...item, categoryId, categoryName: category?.name || "Other", needsReview: false }
        : item),
    } : current);
    await setTransactionCategory(transaction.id, categoryId, learn);
    if (learn) setToast(`Categorised as ${category?.name}. Future matches will follow this rule.`);
  }

  return (
    <section className="money-workspace">
      {toast && <div className="workspace-toast"><Check size={15} /> {toast}</div>}

      <header className="workspace-header">
        <div>
          <span className="section-kicker">Monthly money</span>
          <h2>Know where every pound went</h2>
          <p>Plan the month, review real spending and teach HearthPlan how your household spends.</p>
        </div>
        <div className="workspace-actions">
          <button className="soft-button" onClick={() => setModal("import")}><FileUp size={16} /> Import statement</button>
          <button className="primary-button workspace-primary" onClick={() => setModal("bank")}><Landmark size={16} /> Connect bank</button>
        </div>
      </header>

      <div className="workspace-monthbar">
        <div className="month-stepper">
          <button onClick={() => moveMonth(-1)} aria-label="Previous month"><ChevronLeft /></button>
          <strong>{MONTHS[cursor.month - 1]} {cursor.year}</strong>
          <button onClick={() => moveMonth(1)} aria-label="Next month"><ChevronRight /></button>
        </div>
        <div className="month-status">
          <span>{monthProgress}% through month</span>
          <div><i style={{ width: `${monthProgress}%` }} /></div>
        </div>
        <button className="icon-button" onClick={() => load(true)} aria-label="Refresh month">
          <RefreshCw className={refreshing ? "animate-spin" : ""} size={16} />
        </button>
      </div>

      <div className="workspace-pulse">
        <PulseCard tone="green" icon={<ArrowDownLeft />} label="Money in" value={money(actualIncome || plannedIncome)} note={actualIncome ? "Received this month" : "Planned income"} />
        <PulseCard tone="coral" icon={<ArrowUpRight />} label="Money out" value={money(spending)} note={`${data.transactions.filter((item) => item.flow === "expense").length} transactions`} />
        <PulseCard tone="blue" icon={<WalletCards />} label="Left to spend" value={money(leftToSpend)} note={`${money(plannedExpenses)} committed in your plan`} />
        <button className={`review-pulse ${reviewCount ? "attention" : ""}`} onClick={() => { setView("transactions"); setReviewOnly(true); }}>
          <CircleAlert />
          <span>Needs review</span>
          <strong>{reviewCount}</strong>
          <small>{reviewCount ? "Categorise these next" : "Everything is tidy"}</small>
        </button>
      </div>

      <nav className="workspace-tabs" aria-label="Monthly money views">
        <WorkspaceTab label="Transactions" active={view === "transactions"} onClick={() => setView("transactions")} />
        <WorkspaceTab label="Categories" active={view === "categories"} onClick={() => setView("categories")} />
        <WorkspaceTab label="Plan" active={view === "plan"} onClick={() => setView("plan")} />
        <WorkspaceTab label={`Rules · ${data.rules.length}`} active={view === "rules"} onClick={() => setView("rules")} />
      </nav>

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
              text={data.transactions.length ? "Try clearing your search or category filters." : "Connect a bank, import a CSV statement, or add a transaction manually."}
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
                      {data.categories.filter((category) => category.flow === transaction.flow).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
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
              const used = category.planned > 0 ? (category.spent / category.planned) * 100 : 0;
              return (
                <article className="category-card" key={category.id}>
                  <div className="category-card-head">
                    <span className={`category-dot ${categoryTone(category.name)}`} />
                    <div><strong>{category.name}</strong><small>{category.group}</small></div>
                    <b>{money(category.spent)}</b>
                  </div>
                  <div className="category-budget-row"><span>{category.planned ? `${Math.round(used)}% of budget` : "No budget set"}</span><span>{category.planned ? money(category.planned) : "—"}</span></div>
                  <div className="category-track"><i className={used > 100 ? "over" : ""} style={{ width: `${Math.min(100, used)}%` }} /></div>
                </article>
              );
            })}
          </div>
        </div>
      )}

      {view === "plan" && (
        <div className="workspace-surface">
          <div className="surface-heading">
            <div><span className="section-kicker">Category plan</span><h3>Set guardrails, not spreadsheets</h3><p>Choose a monthly amount for the areas you want to control. Actual spending updates automatically.</p></div>
            <div className="plan-balance"><span>Still unassigned</span><strong>{money(Math.max(0, plannedIncome - categoryPlanned))}</strong></div>
          </div>
          <div className="plan-layout">
            <div className="category-plan-list">
              {categoryTotals.map((category) => (
                <article className="category-plan-row" key={category.id}>
                  <span className={`category-dot ${categoryTone(category.name)}`} />
                  <div><strong>{category.name}</strong><small>{money(category.spent)} spent</small></div>
                  <label><span>Monthly budget</span><div>£<input type="number" min="0" step="10" defaultValue={category.planned} onBlur={async (event) => {
                    const planned = Math.max(0, Number(event.target.value) || 0);
                    setData((current) => current ? {
                      ...current,
                      categories: current.categories.map((item) => item.id === category.id ? { ...item, planned } : item),
                    } : current);
                    await setCategoryBudget(category.id, cursor.year, cursor.month, planned);
                    setToast(`${category.name} budget updated.`);
                  }} /></div></label>
                </article>
              ))}
            </div>
            <aside className="committed-panel">
              <span className="section-kicker">Committed bills</span>
              <h3>{money(plannedExpenses)}</h3>
              <p>Recurring costs already captured in your existing plan.</p>
              <div>
                {committedBills.slice(0, 8).map((bill) => <span key={bill.id || bill.label}><b>{bill.label}</b><em>{money(bill.amount)}</em></span>)}
                {committedBills.length === 0 && <small>Add regular bills as transactions or import a statement to start recognising them.</small>}
              </div>
            </aside>
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
      {modal === "import" && <ImportModal onClose={() => setModal(null)} onImported={(message) => { setModal(null); load(true); setToast(message); }} />}
      {modal === "bank" && <BankModal configured={data.bankLink.configured} onClose={() => setModal(null)} onImport={() => setModal("import")} />}
    </section>
  );
}

function PulseCard({ tone, icon, label, value, note }: { tone: string; icon: React.ReactNode; label: string; value: string; note: string }) {
  return <article className={`workspace-pulse-card ${tone}`}><div>{icon}</div><span>{label}</span><strong>{value}</strong><small>{note}</small></article>;
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
        <div><span className="section-kicker">Smart categorisation</span><h3>Teach HearthPlan once</h3><p>When a transaction contains this text, it will be placed into the chosen category automatically.</p></div>
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
        {rules.length === 0 ? <WorkspaceEmpty icon={<SlidersHorizontal />} title="No rules yet" text="Categorising a transaction automatically creates a rule, or add one above." actions={null} /> :
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
      <label><span>Category</span><select value={form.categoryId} onChange={(event) => setForm({ ...form, categoryId: event.target.value })}><option value="">Needs review</option>{categories.filter((category) => category.flow === form.flow).map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
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
      const header = parseCsvLine(lines[0]).map((cell) => cell.toLowerCase());
      const dateIndex = header.findIndex((cell) => cell.includes("date"));
      const descriptionIndex = header.findIndex((cell) => /description|merchant|narrative|details/.test(cell));
      const amountIndex = header.findIndex((cell) => /amount|value/.test(cell));
      if (dateIndex < 0 || descriptionIndex < 0 || amountIndex < 0) throw new Error("Your CSV needs Date, Description and Amount columns.");
      const rows = lines.slice(1).map(parseCsvLine).map((cells) => ({
        date: new Date(cells[dateIndex]).toISOString().slice(0, 10),
        description: cells[descriptionIndex],
        amount: Number(cells[amountIndex].replace(/[£,\s]/g, "")),
      })).filter((row) => row.description && Number.isFinite(row.amount));
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
      <span>Date, Description and Amount columns</span>
      <input type="file" accept=".csv,text/csv" onChange={(event) => setFile(event.target.files?.[0] || null)} />
    </div>
    <label className="modal-field"><span>Account name</span><input value={account} onChange={(event) => setAccount(event.target.value)} /></label>
    {error && <div className="modal-error"><CircleAlert size={15} /> {error}</div>}
    <button className="primary-button modal-submit" disabled={!file || busy} onClick={runImport}>{busy ? <Loader2 className="animate-spin" size={16} /> : <FileUp size={16} />} Import transactions</button>
  </ModalFrame>;
}

function BankModal({ configured, onClose, onImport }: { configured: boolean; onClose: () => void; onImport: () => void }) {
  return <ModalFrame title="Connect your bank securely" subtitle="UK Open Banking" onClose={onClose}>
    <div className="bank-provider-card">
      <div><Landmark /></div>
      <span><strong>Bank connection via Plaid</strong><small>Read-only transaction access · your bank login is never stored by HearthPlan</small></span>
      <b className={configured ? "ready" : ""}>{configured ? "Ready" : "Setup needed"}</b>
    </div>
    <div className="bank-steps">
      <span><b>1</b><em>Choose your bank</em></span>
      <span><b>2</b><em>Approve read-only access</em></span>
      <span><b>3</b><em>Transactions categorise automatically</em></span>
    </div>
    {configured ? (
      <div className="bank-notice"><Sparkles size={16} /><span>The provider credentials are present. The final consent callback and encrypted token vault are the remaining production steps.</span></div>
    ) : (
      <div className="bank-notice"><CircleAlert size={16} /><span>Bank linking needs a Plaid UK application and production credentials. Statement import gives you the same categorisation workflow today.</span></div>
    )}
    <button className="primary-button modal-submit" onClick={onImport}><FileUp size={16} /> Import a statement instead</button>
  </ModalFrame>;
}
