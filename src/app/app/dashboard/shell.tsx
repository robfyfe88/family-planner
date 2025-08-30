import Link from "next/link";
import { getBudgetInsights } from "./budget-insights";
import format from "date-fns/format";
import { ReactElement, JSXElementConstructor, ReactNode, ReactPortal, Key } from "react";
import { getDashboardData } from "./actions";
import HearthPlanLogo from "@/components/HearthPlanLogo";
import BudgetTrendChart from "@/components/BudgetTrendChart";
import { Button } from "@/components/ui/button";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function Section({
  title,
  ctaHref,
  ctaLabel,
  tone = "blue",
  children,
}: {
  title: string;
  ctaHref: string;
  ctaLabel: string;
  tone?: "blue" | "green" | "amber" | "violet";
  children: React.ReactNode;
}) {
  const ring =
    tone === "green"
      ? "ring-emerald-200"
      : tone === "amber"
      ? "ring-amber-200"
      : tone === "violet"
      ? "ring-violet-200"
      : "ring-blue-200";

  const pillBg =
    tone === "green"
      ? "bg-emerald-600 hover:bg-emerald-700"
      : tone === "amber"
      ? "bg-amber-600 hover:bg-amber-700"
      : tone === "violet"
      ? "bg-violet-600 hover:bg-violet-700"
      : "bg-blue-600 hover:bg-blue-700";

  return (
    <section className={`rounded-2xl border bg-white p-4 sm:p-5 ring-1 ${ring}`}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-lg sm:text-xl font-semibold">{title}</h2>
        <Link href={ctaHref} passHref >
          <Button className={`${pillBg} text-white cursor-pointer px-3 py-1.5 text-sm`}>
            {ctaLabel}
          </Button>
        </Link>
      </div>
      {children}
    </section>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div>
      <div className="text-xs opacity-70">{label}</div>
      <div className="text-xl font-semibold leading-tight">{value}</div>
      {sub ? <div className="text-xs opacity-60 mt-0.5">{sub}</div> : null}
    </div>
  );
}

function formatDay(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return format(d, "EEE d MMM");
}

function Donut({
  value,
  total,
  size = 120,
  stroke = 12,
  centerLabel,
}: {
  value: number;
  total: number;
  size?: number;
  stroke?: number;
  centerLabel?: string;
}) {
  const safeTotal = Math.max(1, total);
  const ratio = Math.max(0, Math.min(1, value / safeTotal));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * ratio;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          fill="none"
          className="stroke-gray-200"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          fill="none"
          className="stroke-blue-600"
          strokeDasharray={`${dash} ${circumference - dash}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center">
          <div className="text-xs opacity-70">Progress</div>
          <div className="text-sm font-semibold">{Math.round(ratio * 100)}%</div>
          {centerLabel ? (
            <div className="text-[11px] opacity-60 leading-tight">{centerLabel}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function WeekBars({ counts }: { counts: number[] }) {
  const max = Math.max(1, ...counts);
  const labels = ["S", "M", "T", "W", "T", "F", "S"];
  return (
    <div className="grid grid-cols-7 gap-2">
      {counts.map((n, i) => (
        <div key={i} className="flex flex-col items-center gap-1">
          <div className="h-24 w-7 rounded bg-gray-100 border relative overflow-hidden">
            <div
              className="absolute bottom-0 left-0 right-0 bg-violet-600/80"
              style={{ height: `${(n / max) * 100}%` }}
              aria-label={`${labels[i]} has ${n} activity(ies)`}
            />
          </div>
          <div className="text-[11px] opacity-70">{labels[i]}</div>
          <div className="text-[11px] opacity-80">{n}</div>
        </div>
      ))}
    </div>
  );
}

export default async function DashboardShell() {
  const [s, budget] = await Promise.all([getDashboardData(), getBudgetInsights()]);
  const monthLabel = budget?.monthLabel ?? "This month";
  const plannedIncomeStr = budget?.plannedIncomeStr ?? "£0";
  const plannedExpenseStr = budget?.plannedExpenseStr ?? "£0";
  const netPlanStr = budget?.netPlanStr ?? "£0";
  const totalPotsStr = budget?.totalPotsStr ?? "£0";
  const topPotNote = budget?.topPotNote ?? "";
  const plannedIncomePence = budget?.plannedIncomePence ?? 0;
  const plannedExpensePence = budget?.plannedExpensePence ?? 0;
  const plannedSpendTotal = Math.max(0, plannedExpensePence);
  const plannedIncomeTotal = Math.max(0, plannedIncomePence);

  const byMonth = budget?.byMonth ?? {};
  const income = byMonth.income ?? {};
  const expense = byMonth.expense ?? {};
  const savings = byMonth.savings ?? {};

  const trendData = MONTHS.map((m, i) => {
    const idx = i + 1; 
    return {
      month: m,
      income: Math.round((income[idx] ?? 0) / 100),   
      expenses: Math.round((expense[idx] ?? 0) / 100), 
      savings: Math.round((savings[idx] ?? 0) / 100),
    };
  });

  return (
    <div className="max-w-6xl mx-auto px-2 sm:px-6 py-4 sm:py-6 space-y-6">
      <header className="flex items-center justify-between gap-3">
        <HearthPlanLogo size={50} variant="app" />
      </header>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs opacity-70">Household</div>
          <h1 className="text-xl font-semibold">{s.householdName}</h1>
        </div>
        <Link href="/app" className="px-3 py-1.5 rounded-full text-sm border bg-white">
          Open planner
        </Link>
      </div>


      <Section title="Budget overview" ctaHref="/app#budget" ctaLabel="Open Family Budget" tone="violet">
        <div className="grid gap-4">
          <BudgetTrendChart data={trendData} />
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Planned income" value={plannedIncomeStr} sub={monthLabel} />
            <Stat label="Planned expenses" value={plannedExpenseStr} sub={monthLabel} />
            <Stat label="Net plan" value={netPlanStr} sub={budget?.netPlanNote} />
            <Stat label="Saved so far" value={totalPotsStr} sub={topPotNote} />
          </div>
        </div>

        {!!budget?.topCategories?.length && (
          <div className="mt-4">
            <div className="text-xs opacity-70 mb-2">Top planned categories</div>
            <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {budget.topCategories.map((c: { name: string; plannedStr: string }, i: number) => (
                <li key={i} className="rounded-lg border px-3 py-2 bg-white flex items-center justify-between">
                  <span className="text-sm">{c.name}</span>
                  <span className="text-sm font-medium">{c.plannedStr}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      <Section title="Annual leave & closures" ctaHref="/app#leave" ctaLabel="Open Annual Leave" tone="amber">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <div className="text-xs opacity-70 mb-2">Upcoming school closures</div>
            <ul className="space-y-1">
              {s.closuresUpcoming.length === 0 && (
                <li className="text-sm opacity-70">None in the near future.</li>
              )}
              {s.closuresUpcoming.map((c: { dateISO: string; label: string | number | bigint | boolean | ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | ReactPortal | Promise<string | number | bigint | boolean | ReactPortal | ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | null | undefined> | null | undefined; }, i: Key | null | undefined) => (
                <li key={i} className="text-sm flex items-center gap-2">
                  <span className="inline-block w-28 opacity-70">{formatDay(c.dateISO)}</span>
                  <span className="font-medium">{c.label}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="text-xs opacity-70 mb-2">Upcoming leave</div>
            <ul className="space-y-1">
              {s.upcomingLeave.length === 0 && <li className="text-sm opacity-70">No leave booked.</li>}
              {s.upcomingLeave.map((l: { id: string; dateISO: string; label: string; member?: string | null }) => (
                <li key={l.id} className="text-sm">
                  <span className="inline-block w-28 opacity-70">{formatDay(l.dateISO)}</span>
                  <span className="font-medium">{l.label}</span>
                  {l.member ? <span className="opacity-70"> — {l.member}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <Section title="Activities snapshot" ctaHref="/app#activities" ctaLabel="Open Activities" tone="blue">
        <div className="grid lg:grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium opacity-80">Next 7 days load</div>
              <span className="px-2 py-0.5 rounded-full text-xs border bg-white">
                {s.weeklyActivities} total
              </span>
            </div>
            <WeekBars counts={s.activityLoadByWeekday} />
          </div>

          <div>
            <div className="text-xs opacity-70 mb-2">Next activities</div>
            <ul className="space-y-1">
              {s.nextActivities.length === 0 && (
                <li className="text-sm opacity-70">No activities scheduled this week.</li>
              )}
              {s.nextActivities.map((a: { id: Key | null | undefined; dateISO: string; label: string | number | bigint | boolean | ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | ReactPortal | Promise<string | number | bigint | boolean | ReactPortal | ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | null | undefined> | null | undefined; }) => (
                <li key={a.id} className="text-sm flex items-center gap-2">
                  <span className="inline-block w-28 opacity-70">{formatDay(a.dateISO)}</span>
                  <span className="font-medium">{a.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>
    </div>
  );
}
