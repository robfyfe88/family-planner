"use server";

import { prisma } from "@/lib/prisma";
import { getHouseholdIdOrThrow } from "@/lib/household";

export type TimeStr = `${number}:${number}`;
export type DayKey = "Mon" | "Tue" | "Wed" | "Thu" | "Fri";
export type YearMode = "FULL_YEAR" | "TERM_TIME";

export interface Rates { am: number; pm: number; day: number; hourly: number; }
export interface Sessions {
  amStart: TimeStr; amEnd: TimeStr;
  pmStart: TimeStr; pmEnd: TimeStr;
  fullDayHours: number; hourlyRoundingMinutes: number; sessionTriggerMinutes: number;
}
export interface DayPlan { start?: TimeStr; end?: TimeStr; }
export type WeekPlan = Record<DayKey, DayPlan>;

export interface ChildProfile {
  id: string; name: string; ageYears: number; week: WeekPlan;
  tfcMonthlyCap: number; rates: Rates; sessions: Sessions;
}

export interface PlannerData {
  settings: { yearMode: YearMode; termWeeks: number };
  children: ChildProfile[];
  activeChildId: string | null; 
}

const dayOrder: DayKey[] = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const dayToIndex: Record<DayKey, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5 };
const indexToDay: Record<number, DayKey> = { 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri" };

const toPence = (pounds: number) => Math.round((pounds ?? 0) * 100);
const toPounds = (pence: number | null | undefined) => Math.round(((pence ?? 0) / 100) * 100) / 100;

export async function fetchNurseryPlanner(): Promise<PlannerData> {
  const householdId = await getHouseholdIdOrThrow();

  const settings = await prisma.nurserySettings.upsert({
    where: { householdId },
    update: {},
    create: { householdId, yearMode: "FULL_YEAR", termWeeks: 38 },
  });

  const dbChildren = await prisma.nurseryChild.findMany({
    where: { householdId },
    include: { weekPlans: true },
    orderBy: { name: "asc" },
  });

  const children: ChildProfile[] = dbChildren.map((c : any) => ({
    id: c.id,
    name: c.name,
    ageYears: c.ageYears,
    tfcMonthlyCap: toPounds(c.tfcMonthlyCapPence),
    rates: {
      am: toPounds(c.amRatePence),
      pm: toPounds(c.pmRatePence),
      day: toPounds(c.dayRatePence),
      hourly: toPounds(c.hourlyRatePence),
    },
    sessions: {
      amStart: c.amStart as TimeStr,
      amEnd: c.amEnd as TimeStr,
      pmStart: c.pmStart as TimeStr,
      pmEnd: c.pmEnd as TimeStr,
      fullDayHours: c.fullDayHours,
      hourlyRoundingMinutes: c.hourlyRoundingMinutes,
      sessionTriggerMinutes: c.sessionTriggerMinutes,
    },
    week: dayOrder.reduce<WeekPlan>((acc, d) => {
      const row = c.weekPlans.find((w : any) => w.weekday === dayToIndex[d]);
      acc[d] = { start: (row?.startTime ?? undefined) as TimeStr | undefined, end: (row?.endTime ?? undefined) as TimeStr | undefined };
      return acc;
    }, { Mon: {}, Tue: {}, Wed: {}, Thu: {}, Fri: {} }),
  }));

  return {
    settings: { yearMode: settings.yearMode as YearMode, termWeeks: settings.termWeeks },
    children,
    activeChildId: children[0]?.id ?? null, 
  };
}

export async function setYearMode(mode: YearMode) {
  const householdId = await getHouseholdIdOrThrow();
  const updated = await prisma.nurserySettings.update({
    where: { householdId },
    data: { yearMode: mode },
  });
  return { yearMode: updated.yearMode as YearMode, termWeeks: updated.termWeeks };
}

export async function setTermWeeks(termWeeks: number) {
  const householdId = await getHouseholdIdOrThrow();
  const updated = await prisma.nurserySettings.update({
    where: { householdId },
    data: { termWeeks: Math.max(1, Math.min(52, Math.round(termWeeks || 38))) },
  });
  return { yearMode: updated.yearMode as YearMode, termWeeks: updated.termWeeks };
}

export async function createChild(name?: string) {
  const householdId = await getHouseholdIdOrThrow();

  const created = await prisma.nurseryChild.create({
    data: {
      householdId,
      name: (name?.trim() || "Child"),
      ageYears: 3,
      tfcMonthlyCapPence: 16667,
      amRatePence: 2800,
      pmRatePence: 2800,
      dayRatePence: 5500,
      hourlyRatePence: 750,
      amStart: "08:00",
      amEnd: "12:30",
      pmStart: "13:00",
      pmEnd: "18:00",
      fullDayHours: 8.5,
      hourlyRoundingMinutes: 15,
      sessionTriggerMinutes: 60,
      weekPlans: {
        createMany: {
          data: [1, 2, 3, 4, 5].map((i) => ({ weekday: i })) 
        }
      }
    },
    include: { weekPlans: true },
  });

  return created.id;
}

export async function deleteChild(childId: string) {
  await prisma.nurseryDayPlan.deleteMany({ where: { childId } });
  await prisma.nurseryChild.delete({ where: { id: childId } });
  return { ok: true };
}

export async function updateChildBasics(childId: string, patch: { name?: string; ageYears?: number; tfcMonthlyCap?: number }) {
  const data: any = {};
  if (typeof patch.name === "string") data.name = patch.name.trim() || "Child";
  if (typeof patch.ageYears === "number") data.ageYears = Math.max(0, Math.round(patch.ageYears));
  if (typeof patch.tfcMonthlyCap === "number") data.tfcMonthlyCapPence = toPence(patch.tfcMonthlyCap);

  await prisma.nurseryChild.update({ where: { id: childId }, data });
  return { ok: true };
}

export async function updateChildRates(childId: string, rates: Partial<Rates>) {
  const data: any = {};
  if (typeof rates.am === "number") data.amRatePence = toPence(rates.am);
  if (typeof rates.pm === "number") data.pmRatePence = toPence(rates.pm);
  if (typeof rates.day === "number") data.dayRatePence = toPence(rates.day);
  if (typeof rates.hourly === "number") data.hourlyRatePence = toPence(rates.hourly);
  await prisma.nurseryChild.update({ where: { id: childId }, data });
  return { ok: true };
}

export async function updateChildSessions(childId: string, s: Partial<Sessions>) {
  const data: any = {};
  if (s.amStart) data.amStart = s.amStart;
  if (s.amEnd) data.amEnd = s.amEnd;
  if (s.pmStart) data.pmStart = s.pmStart;
  if (s.pmEnd) data.pmEnd = s.pmEnd;
  if (typeof s.fullDayHours === "number") data.fullDayHours = s.fullDayHours;
  if (typeof s.hourlyRoundingMinutes === "number") data.hourlyRoundingMinutes = s.hourlyRoundingMinutes;
  if (typeof s.sessionTriggerMinutes === "number") data.sessionTriggerMinutes = s.sessionTriggerMinutes;

  await prisma.nurseryChild.update({ where: { id: childId }, data });
  return { ok: true };
}

export async function setDayPlan(childId: string, day: DayKey, plan: DayPlan) {
  await prisma.nurseryDayPlan.upsert({
    where: { childId_weekday: { childId, weekday: dayToIndex[day] } },
    create: { childId, weekday: dayToIndex[day], startTime: plan.start ?? null, endTime: plan.end ?? null },
    update: { startTime: plan.start ?? null, endTime: plan.end ?? null },
  });
  return { ok: true };
}

export async function copyMondayToAll(childId: string) {
  const mon = await prisma.nurseryDayPlan.findFirst({ where: { childId, weekday: 1 } });
  await Promise.all(
    [2, 3, 4, 5].map((w) =>
      prisma.nurseryDayPlan.update({
        where: { childId_weekday: { childId, weekday: w } },
        data: { startTime: mon?.startTime ?? null, endTime: mon?.endTime ?? null },
      })
    )
  );
  return { ok: true };
}
