"use server";

import { prisma } from "@/lib/prisma";
import { startOfMonth, endOfMonth, addDays } from "date-fns";
import { getOrCreateHouseholdForUser as getHouseholdIdOrThrow } from "@/lib/household";

export type DashboardData = {
  householdName: string;
  membersCount: number;

  weeklyActivities: number;
  activityLoadByWeekday: number[]; // Mon..Sun
  nextActivities: Array<{ id: string; dateISO: string; label: string }>;

  closuresThisMonth: number;
  nextClosureISO: string | null;
  closuresUpcoming: Array<{ dateISO: string; label: string }>;

  upcomingLeave: Array<{ id: string; member?: string | null; dateISO: string; label: string }>;
};

const toISODate = (d: Date) => d.toISOString().slice(0, 10);
const toDateOnlyUTC = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

// ---- recurrence expansion (matches the client) ----
type RecurrenceKind = "none" | "weekly" | "biweekly" | "every_n_weeks";
function expandActivityDates(
  a: {
    startDate: Date;
    endDate: Date;
    recurrenceKind: RecurrenceKind;
    daysOfWeek: number[]; // 0..6 Sun..Sat
    intervalWeeks?: number | null;
  },
  windowLo: Date,
  windowHi: Date
): string[] {
  const s = toDateOnlyUTC(a.startDate);
  const e = toDateOnlyUTC(a.endDate);
  const lo = s <= e ? s : e;
  const hi = s <= e ? e : s;

  if (hi < windowLo || lo > windowHi) return [];

  const result: string[] = [];
  const pushIfInWindow = (d: Date) => {
    if (d >= windowLo && d <= windowHi) result.push(toISODate(d));
  };

  const addWeeklyLike = (intervalWeeks: number) => {
    const anchorWeekStart = addDays(s, -s.getUTCDay()); // Sun as week start
    for (
      let weekStart = new Date(anchorWeekStart);
      weekStart <= hi;
      weekStart = addDays(weekStart, 7 * intervalWeeks)
    ) {
      for (const wd of a.daysOfWeek) {
        const occ = addDays(weekStart, wd);
        if (occ >= lo && occ <= hi) pushIfInWindow(occ);
      }
    }
  };

  switch (a.recurrenceKind) {
    case "none": {
      for (let d = new Date(lo); d <= hi; d = addDays(d, 1)) pushIfInWindow(d);
      break;
    }
    case "weekly": {
      addWeeklyLike(1);
      break;
    }
    case "biweekly": {
      addWeeklyLike(2);
      break;
    }
    case "every_n_weeks": {
      const n = Math.max(1, a.intervalWeeks ?? 1);
      addWeeklyLike(n);
      break;
    }
  }
  return result;
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
    select: { id: true, name: true, shortLabel: true },
  });
  const memberShort = new Map(
    members.map((m) => [m.id, (m.shortLabel || (m.name ? m.name.split(" ")[0] : "")) ?? ""])
  );

  // ---- Activities snapshot (next 7 days via PlannerActivity) ----
  const windowLo = today;
  const windowHi = toDateOnlyUTC(addDays(today, 6));

  const planner = await prisma.plannerActivity.findMany({
    where: {
      householdId,
      AND: [{ endDate: { gte: windowLo } }, { startDate: { lte: windowHi } }],
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

  return {
    householdName: (hh?.name ?? "Your Household"),
    membersCount,

    weeklyActivities,
    activityLoadByWeekday,
    nextActivities,

    closuresThisMonth,
    nextClosureISO,
    closuresUpcoming,

    upcomingLeave,
  };
}
