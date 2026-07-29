"use server";

import { prisma } from "@/lib/prisma";
import { startOfMonth, endOfMonth, addDays } from "date-fns";
import { getOrCreateHouseholdForUser as getHouseholdIdOrThrow } from "@/lib/household";

export type DashboardData = {
  householdName: string;
  membersCount: number;

  weeklyActivities: number;
  monthlyActivitySessions: number;
  monthlyActivityCost: number;
  activeActivities: number;
  activityCostBreakdown: Array<{ name: string; cost: number }>;
  activityLoadByWeekday: number[]; // Mon..Sun
  nextActivities: Array<{ id: string; dateISO: string; label: string }>;

  closuresThisMonth: number;
  nextClosureISO: string | null;
  closuresUpcoming: Array<{ dateISO: string; label: string }>;

  upcomingLeave: Array<{ id: string; member?: string | null; dateISO: string; label: string }>;
  leaveBalances: Array<{ memberId: string; name: string; allowance: number; booked: number; remaining: number }>;
};

const toISODate = (d: Date) => d.toISOString().slice(0, 10);
const toDateOnlyUTC = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

type RecurrenceKind = "none" | "weekly" | "biweekly" | "every_n_weeks";

function expandActivityDates(
  a: {
    startDate: Date;
    endDate?: Date | null;            // ⬅️ allow null/undefined
    recurrenceKind: RecurrenceKind;
    daysOfWeek: number[];             // 0..6 Sun..Sat
    intervalWeeks?: number | null;
  },
  windowLo: Date,
  windowHi: Date
): string[] {
  const s = toDateOnlyUTC(a.startDate);
  const e = toDateOnlyUTC(a.endDate ?? windowHi);   // ⬅️ clamp open-ended to window
  const lo = s <= e ? s : e;
  const hi = s <= e ? e : s;

  if (hi < windowLo || lo > windowHi) return [];

  const result: string[] = [];
  const pushIfInWindow = (d: Date) => {
    if (d >= windowLo && d <= windowHi) result.push(toISODate(d));
  };

  const addWeeklyLike = (intervalWeeks: number) => {
    const anchorWeekStart = addDays(s, -s.getUTCDay()); // Sun as week start
    for (let weekStart = new Date(anchorWeekStart);
      weekStart <= hi;
      weekStart = addDays(weekStart, 7 * intervalWeeks)) {
      for (const wd of a.daysOfWeek) {
        const occ = addDays(weekStart, wd);
        if (occ >= lo && occ <= hi) pushIfInWindow(occ);
      }
    }
  };

  switch (a.recurrenceKind) {
    case "none": {
      // one-off on the start date only
      pushIfInWindow(s);
      break;
    }
    case "weekly":
      addWeeklyLike(1);
      break;
    case "biweekly":
      addWeeklyLike(2);
      break;
    case "every_n_weeks":
      addWeeklyLike(Math.max(1, a.intervalWeeks ?? 1));
      break;
  }
  return result;
}

function monthsInclusive(start: Date, end: Date) {
  return Math.max(1, (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth() + 1);
}

export async function getDashboardData(): Promise<DashboardData> {
  const householdId = await getHouseholdIdOrThrow();

  const hh = await prisma.household.findUnique({
    where: { id: householdId },
    select: { id: true, name: true },
  });

  const now = new Date();
  const today = toDateOnlyUTC(now);
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  // ---- counts / lookups reused below ----
  const membersCount = await prisma.member.count({ where: { householdId } });
  const members = await prisma.member.findMany({
    where: { householdId },
    select: { id: true, name: true, shortLabel: true, role: true },
  });
  const memberShort = new Map(
    members.map((m) => [m.id, (m.shortLabel || (m.name ? m.name.split(" ")[0] : "")) ?? ""])
  );

  // ---- Activities snapshot and current-month cost ----
  const windowLo = today;
  const windowHi = toDateOnlyUTC(addDays(today, 6));
  const activityWindowLo = toDateOnlyUTC(monthStart) < windowLo ? toDateOnlyUTC(monthStart) : windowLo;
  const activityWindowHi = toDateOnlyUTC(monthEnd) > windowHi ? toDateOnlyUTC(monthEnd) : windowHi;

  const planner = await prisma.plannerActivity.findMany({
    where: {
      householdId,
      startDate: { lte: activityWindowHi },
      OR: [{ endDate: null }, { endDate: { gte: activityWindowLo } }],
    },
    orderBy: { startDate: "asc" },
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      recurrenceKind: true,
      daysOfWeek: true,
      intervalWeeks: true,
      feeModel: true,
      amount: true,
      allocation: true,
      members: { select: { memberId: true } },
    },
  });

  type Occ = { id: string; dateISO: string; label: string; weekdaySun0: number };
  const occurrences: Occ[] = [];

for (const a of planner) {
  const occs = expandActivityDates(
    {
      startDate: a.startDate,
      endDate: a.endDate,                
      recurrenceKind: a.recurrenceKind as RecurrenceKind,
      daysOfWeek: (a.daysOfWeek ?? []) as number[],
      intervalWeeks: a.intervalWeeks ?? undefined,
    },
    windowLo,
    windowHi
  );

    const who = (a.members ?? [])
      .map((m) => memberShort.get(m.memberId) || "")
      .filter(Boolean);
    const suffix = who.length ? ` (${who.join(", ")})` : "";
    const label = `${a.name}${suffix}`;

    for (const iso of occs) {
      const d = new Date(iso + "T00:00:00Z");
      occurrences.push({
        id: `${a.id}-${iso}`,
        dateISO: iso,
        label,
        weekdaySun0: d.getUTCDay(), // 0..6 Sun..Sat
      });
    }
  }

  // counts Mon..Sun (convert from Sun..Sat)
  const countsSunSat = new Array(7).fill(0) as number[];
  for (const o of occurrences) countsSunSat[o.weekdaySun0]++;

  const activityLoadByWeekday = [
    countsSunSat[1], // Mon
    countsSunSat[2], // Tue
    countsSunSat[3], // Wed
    countsSunSat[4], // Thu
    countsSunSat[5], // Fri
    countsSunSat[6], // Sat
    countsSunSat[0], // Sun
  ];

  // up to 8 next occurrences sorted by date
  occurrences.sort((a, b) => (a.dateISO < b.dateISO ? -1 : a.dateISO > b.dateISO ? 1 : 0));
  const nextActivities = occurrences.slice(0, 8).map(({ id, dateISO, label }) => ({ id, dateISO, label }));
  const weeklyActivities = occurrences.length;
  const currentMonthPlanner = planner.filter((activity) =>
    activity.startDate <= monthEnd && (!activity.endDate || activity.endDate >= monthStart)
  );
  const activityCostBreakdown = currentMonthPlanner.map((activity) => {
    const monthOccurrences = expandActivityDates(
      {
        startDate: activity.startDate,
        endDate: activity.endDate,
        recurrenceKind: activity.recurrenceKind as RecurrenceKind,
        daysOfWeek: (activity.daysOfWeek ?? []) as number[],
        intervalWeeks: activity.intervalWeeks,
      },
      toDateOnlyUTC(monthStart),
      toDateOnlyUTC(monthEnd)
    ).length;
    const amount = Number(activity.amount ?? 0);
    const startMonth = activity.startDate.getUTCFullYear() === now.getUTCFullYear() && activity.startDate.getUTCMonth() === now.getUTCMonth();
    const cost = activity.feeModel === "per_session"
      ? monthOccurrences * amount
      : activity.feeModel === "monthly"
        ? amount
        : activity.feeModel === "one_off" || activity.allocation === "upfront" || !activity.endDate
          ? (startMonth ? amount : 0)
          : amount / monthsInclusive(activity.startDate, activity.endDate ?? activity.startDate);
    return { name: activity.name, cost: Math.round(cost * 100) / 100, sessions: monthOccurrences };
  }).filter((item) => item.cost > 0 || item.sessions > 0);
  const monthlyActivitySessions = activityCostBreakdown.reduce((sum, item) => sum + item.sessions, 0);
  const monthlyActivityCost = Math.round(activityCostBreakdown.reduce((sum, item) => sum + item.cost, 0) * 100) / 100;

  // ---- Closures (this month + upcoming) ----
  const closures = await prisma.schoolDay.findMany({
    where: { householdId, date: { gte: monthStart, lte: monthEnd }, isSchoolOpen: false },
    orderBy: { date: "asc" },
  });
  const closuresThisMonth = closures.length;
  const upcoming = closures.find((c) => c.date.getTime() >= now.getTime());
  const nextClosureISO = upcoming ? toISODate(upcoming.date) : null;

  const closuresUpcomingRaw = await prisma.schoolDay.findMany({
    where: { householdId, isSchoolOpen: false, date: { gte: now } },
    orderBy: { date: "asc" },
    take: 5,
  });
  const closuresUpcoming = closuresUpcomingRaw.map((c) => ({
    dateISO: toISODate(c.date),
    label: c.label ?? "School closed",
  }));

  // ---- Upcoming leave (next few ranges, show start date + member) ----
  const leave = await prisma.leave.findMany({
    where: { householdId, endDate: { gte: now } },
    orderBy: { startDate: "asc" },
    take: 5,
  });
  const memberById = new Map(members.map((m) => [m.id, m.name] as const));
  const upcomingLeave = leave.map((l) => ({
    id: l.id,
    member: l.memberId ? memberById.get(l.memberId) ?? null : null,
    dateISO: toISODate(l.startDate),
    label: l.type ?? "Leave",
  }));
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const yearEnd = new Date(Date.UTC(now.getUTCFullYear(), 11, 31, 23, 59, 59));
  const [parentPrefs, bookedLeave] = await Promise.all([
    prisma.parentPrefs.findMany({
      where: { memberId: { in: members.filter((member) => member.role === "parent").map((member) => member.id) } },
    }),
    prisma.leave.findMany({
      where: {
        householdId,
        memberId: { not: null },
        startDate: { lte: yearEnd },
        endDate: { gte: yearStart },
        type: { in: ["annual_auto", "annual_override"] },
      },
      select: { memberId: true, startDate: true, endDate: true },
    }),
  ]);
  const allowanceByMember = new Map(parentPrefs.map((pref) => [pref.memberId, pref.allowanceDays]));
  const bookedByMember = new Map<string, Set<string>>();
  for (const item of bookedLeave) {
    if (!item.memberId) continue;
    const dates = bookedByMember.get(item.memberId) ?? new Set<string>();
    for (let date = new Date(item.startDate); date <= item.endDate; date = addDays(date, 1)) {
      const weekday = date.getUTCDay();
      if (weekday !== 0 && weekday !== 6) dates.add(toISODate(date));
    }
    bookedByMember.set(item.memberId, dates);
  }
  const leaveBalances = members.filter((member) => member.role === "parent").map((member) => {
    const allowance = allowanceByMember.get(member.id) ?? 20;
    const booked = bookedByMember.get(member.id)?.size ?? 0;
    return { memberId: member.id, name: member.name, allowance, booked, remaining: Math.max(0, allowance - booked) };
  });

  return {
    householdName: (hh?.name ?? "Your Household"),
    membersCount,

    weeklyActivities,
    monthlyActivitySessions,
    monthlyActivityCost,
    activeActivities: currentMonthPlanner.length,
    activityCostBreakdown: activityCostBreakdown
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 5)
      .map(({ name, cost }) => ({ name, cost })),
    activityLoadByWeekday,
    nextActivities,

    closuresThisMonth,
    nextClosureISO,
    closuresUpcoming,

    upcomingLeave,
    leaveBalances,
  };
}
