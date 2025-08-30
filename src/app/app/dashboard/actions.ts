"use server";

import { prisma } from "@/lib/prisma";
import { startOfMonth } from "date-fns/startOfMonth";
import { endOfMonth } from "date-fns/endOfMonth";
import { addDays } from "date-fns/addDays";
import format from "date-fns/format";

export type DashboardData = {
  householdName: string;
  membersCount: number;

  weeklyActivities: number;
  activityLoadByWeekday: number[]; 
  nextActivities: Array<{ id: string; dateISO: string; label: string }>;

  closuresThisMonth: number;
  nextClosureISO: string | null;
  closuresUpcoming: Array<{ dateISO: string; label: string }>;

  upcomingLeave: Array<{ id: string; member?: string | null; dateISO: string; label: string }>;
};

export async function getDashboardData(): Promise<DashboardData> {
  const hh = await prisma.household.findFirst();
  if (!hh) {
    return {
      householdName: "Your Household",
      membersCount: 0,
      weeklyActivities: 0,
      activityLoadByWeekday: [0,0,0,0,0,0,0],
      nextActivities: [],
      closuresThisMonth: 0,
      nextClosureISO: null,
      closuresUpcoming: [],
      upcomingLeave: [],
    };
  }

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const membersCount = await prisma.member.count({ where: { householdId: hh.id } });

  const schedules = await prisma.schedule.findMany({
    where: { householdId: hh.id },
    include: { activity: true },
  });

  const activityLoadByWeekday = [0,0,0,0,0,0,0];
  let weeklyActivities = 0;
  const nextActivities: DashboardData["nextActivities"] = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(now, i);
    const wd = d.getDay(); 
    const todays = schedules.filter((s: { weekday: any; }) => (s.weekday ?? -1) === wd);
    activityLoadByWeekday[wd] += todays.length;
    weeklyActivities += todays.length;

    for (const s of todays) {
      if (nextActivities.length < 3) {
        nextActivities.push({
          id: s.id,
          dateISO: d.toISOString().slice(0,10),
          label: s.activity.name,
        });
      }
    }
  }

  const closures = await prisma.schoolDay.findMany({
    where: { householdId: hh.id, date: { gte: monthStart, lte: monthEnd }, isSchoolOpen: false },
    orderBy: { date: "asc" },
  });
  const closuresThisMonth = closures.length;
  const nextClosureISO = closures.find((c: { date: { getTime: () => number; }; }) => c.date.getTime() >= now.getTime())?.date?.toISOString().slice(0,10) ?? null;

  const closuresUpcomingRaw = await prisma.schoolDay.findMany({
    where: { householdId: hh.id, isSchoolOpen: false, date: { gte: now } },
    orderBy: { date: "asc" },
    take: 5,
  });
  const closuresUpcoming = closuresUpcomingRaw.map((c: { date: { toISOString: () => string | any[]; }; }) => ({
    dateISO: c.date.toISOString().slice(0,10),
    label: "School closed",
  }));

  const leave = await prisma.leave.findMany({
    where: { householdId: hh.id, endDate: { gte: now } },
    orderBy: { startDate: "asc" },
    take: 5,
  });
  const memberById = new Map(
    (await prisma.member.findMany({ where: { householdId: hh.id } }))
      .map((m: { id: any; name: any; }) => [m.id, m.name] as const)
  );
  const upcomingLeave = leave.map((l: { id: any; memberId: unknown; startDate: { toISOString: () => string | any[]; }; type: any; }) => ({
    id: l.id,
    member: l.memberId ? memberById.get(l.memberId) ?? null : null,
    dateISO: l.startDate.toISOString().slice(0,10),
    label: l.type ?? "Leave",
  }));

  return {
    householdName: hh.name,
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
