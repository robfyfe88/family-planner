"use server";

import { prisma } from "@/lib/prisma";
import { getOrCreateHouseholdForUser as getHouseholdIdOrThrow } from "@/lib/household";
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type Region = "england-and-wales" | "scotland" | "northern-ireland";
export type OverrideCode = "A" | "B" | "both" | `C:${string}` | "clear";

export type ParentConfigDTO = {
    memberId: string;
    name: string;
    shortLabel: string | null;
    color: string | null;
    offDays: Weekday[];
    allowance: number;
    getsBankHolidays: boolean;
};

export type CaregiverDTO = {
    id: string;
    name: string;
    shortLabel: string | null;
    color: string | null;
};

export type DayPlanDTO = {
    date: string; 
    weekday: string;
    coverage:
    | { type: "none" }
    | { type: "off"; who: "A" | "B" | "both" }
    | { type: "leave"; who: "A" | "B" | "both" }
    | { type: "care"; caregiverId: string };
};

export type AnnualData = {
    settings: {
        region: Region;
        skipWeekends: boolean;
        jointDays: number;
        prioritizeSeasons: boolean;
    };
    parents: ParentConfigDTO[];
    caregivers: CaregiverDTO[];
    closures: string[];
    plan: DayPlanDTO[];
};

type ParentPrefsRow = {
    memberId: string;
    offDaysBitmask: number;
    allowanceDays: number;
    getsBankHolidays: boolean;
};

const weekdayName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ymd = (d: Date) =>
    new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
        .toISOString()
        .slice(0, 10);
const parseISO = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const bitmaskFromDays = (days: Weekday[]) =>
    days.reduce<number>((m, d) => m | (1 << d), 0);
const daysFromBitmask = (mask: number): Weekday[] =>
    (Array.from({ length: 7 }, (_, i) => i as Weekday)).filter(
        (d) => (mask & (1 << d)) !== 0
    );

function groupConsecutive(isoDates: string[]): string[][] {
    const s = [...isoDates].sort();
    const blocks: string[][] = [];
    let cur: string[] = [];
    for (let i = 0; i < s.length; i++) {
        if (i === 0) cur = [s[i]];
        else {
            const prev = parseISO(s[i - 1]);
            const curD = parseISO(s[i]);
            const delta = Math.round((+curD - +prev) / 86400000);
            if (delta === 1) cur.push(s[i]);
            else {
                blocks.push(cur);
                cur = [s[i]];
            }
        }
    }
    if (cur.length) blocks.push(cur);
    return blocks;
}

const toDbRegion = (r: Region) =>
    r === "england-and-wales"
        ? "england_and_wales"
        : r === "northern-ireland"
            ? "northern_ireland"
            : "scotland";
const fromDbRegion = (r: string): Region =>
    r === "england_and_wales"
        ? "england-and-wales"
        : r === "northern_ireland"
            ? "northern-ireland"
            : "scotland";

export async function fetchAnnualData(): Promise<AnnualData> {
    const householdId = await getHouseholdIdOrThrow();

    const settings = await prisma.annualSettings.upsert({
        where: { householdId },
        update: {},
        create: { householdId },
    });

    const members = await prisma.member.findMany({
        where: { householdId },
        select: { id: true, name: true, role: true, shortLabel: true, color: true },
        orderBy: { name: "asc" },
    });

    const parents = members.filter((m: { role: string; }) => m.role === "parent").slice(0, 2);
    const caregivers = members.filter((m: { role: string; }) => m.role === "caregiver");

    const prefsRows: ParentPrefsRow[] = await prisma.parentPrefs.findMany({
        where: { memberId: { in: parents.map((p: any) => p.id) } },
        select: {
            memberId: true,
            offDaysBitmask: true,
            allowanceDays: true,
            getsBankHolidays: true,
        },
    });
    const prefByMember = new Map<string, ParentPrefsRow>(
        prefsRows.map((r) => [r.memberId, r])
    );

    const parentDTOs: ParentConfigDTO[] = parents.map((p: { id: string; name: any; shortLabel: any; color: any; }, idx: number) => {
        const pref = prefByMember.get(p.id);
        return {
            memberId: p.id,
            name: p.name,
            shortLabel: p.shortLabel ?? (idx === 0 ? "A" : "B"),
            color: p.color,
            offDays: daysFromBitmask(pref?.offDaysBitmask ?? 0),
            allowance: pref?.allowanceDays ?? 20,
            getsBankHolidays: !!pref?.getsBankHolidays,
        };
    });

    const caregiverDTOs: CaregiverDTO[] = caregivers.map((c: { id: any; name: any; shortLabel: any; color: any; }) => ({
        id: c.id,
        name: c.name,
        shortLabel: c.shortLabel,
        color: c.color,
    }));

    const closures = await prisma.schoolDay.findMany({
        where: { householdId, isSchoolOpen: false },
        select: { date: true },
        orderBy: { date: "asc" },
    });
    const closureISO = closures.map((row: { date: Date; }) => ymd(row.date));

    const care = await prisma.careAssignment.findMany({
        where: { householdId },
        select: { date: true, caregiverId: true },
    });
    const leaves = await prisma.leave.findMany({
        where: { householdId },
        select: { memberId: true, startDate: true, endDate: true, type: true },
    });

    const parentA = parentDTOs[0];
    const parentB = parentDTOs[1];

    const plan: DayPlanDTO[] = closureISO.map((date: string) => {
        const d = parseISO(date);
        const w = d.getUTCDay();

        const coveredByA = !!(
            parentA &&
            leaves.some(
                (L: { memberId: string; startDate: string | number; endDate: string | number; }) =>
                    L.memberId === parentA.memberId &&
                    +d >= +L.startDate &&
                    +d <= +L.endDate
            )
        );
        const coveredByB = !!(
            parentB &&
            leaves.some(
                (L: { memberId: string; startDate: string | number; endDate: string | number; }) =>
                    L.memberId === parentB.memberId &&
                    +d >= +L.startDate &&
                    +d <= +L.endDate
            )
        );

        const careRow = care.find((c: { date: Date; }) => ymd(c.date) === date);

        let coverage: DayPlanDTO["coverage"] = { type: "none" };
        if (coveredByA && coveredByB) coverage = { type: "leave", who: "both" };
        else if (coveredByA) coverage = { type: "leave", who: "A" };
        else if (coveredByB) coverage = { type: "leave", who: "B" };
        else if (careRow) coverage = { type: "care", caregiverId: careRow.caregiverId };

        return { date, weekday: weekdayName[w], coverage };
    });

    return {
        settings: {
            region: fromDbRegion(settings.region),
            skipWeekends: settings.skipWeekends,
            jointDays: settings.jointDays,
            prioritizeSeasons: settings.prioritizeSeasons,
        },
        parents: parentDTOs,
        caregivers: caregiverDTOs,
        closures: closureISO,
        plan,
    };
}

export async function updateAnnualSettings(
    patch: Partial<{
        region: Region;
        skipWeekends: boolean;
        jointDays: number;
        prioritizeSeasons: boolean;
    }>
) {
    const householdId = await getHouseholdIdOrThrow();
    const data: any = { ...patch };
    if (patch.region) data.region = toDbRegion(patch.region);
    await prisma.annualSettings.upsert({
        where: { householdId },
        create: { householdId, ...data },
        update: data,
    });
}

export async function upsertParentPrefs(input: {
    memberId: string;
    offDays: Weekday[];
    allowance: number;
    getsBankHolidays: boolean;
}) {
    const { memberId, offDays, allowance, getsBankHolidays } = input;
    await prisma.parentPrefs.upsert({
        where: { memberId },
        create: {
            memberId,
            offDaysBitmask: bitmaskFromDays(offDays),
            allowanceDays: allowance,
            getsBankHolidays,
        },
        update: {
            offDaysBitmask: bitmaskFromDays(offDays),
            allowanceDays: allowance,
            getsBankHolidays,
        },
    });
}

export async function toggleClosure(dateISO: string, p0: boolean) {
    const householdId = await getHouseholdIdOrThrow();
    const date = parseISO(dateISO);

    const existing = await prisma.schoolDay.findUnique({
        where: { householdId_date: { householdId, date } },
        select: { id: true, isSchoolOpen: true },
    });

    if (!existing) {
        await prisma.schoolDay.create({
            data: { householdId, date, isSchoolOpen: false },
        });
    } else {
        await prisma.schoolDay.update({
            where: { householdId_date: { householdId, date } },
            data: { isSchoolOpen: !existing.isSchoolOpen },
        });
    }
}

export async function setOverride(dateISO: string, code: OverrideCode) {
    const householdId = await getHouseholdIdOrThrow();
    const date = parseISO(dateISO);

    const parents = await prisma.member.findMany({
        where: { householdId, role: "parent" },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
        take: 2,
    });
    const parentA = parents[0];
    const parentB = parents[1];

    await prisma.careAssignment.deleteMany({
        where: { householdId, date, isAuto: false },
    });
    await prisma.leave.deleteMany({
        where: {
            householdId,
            type: "annual_override",
            startDate: date,
            endDate: date,
        },
    });

    if (code === "clear") return;

    if (code === "A" && parentA) {
        await prisma.leave.create({
            data: {
                householdId,
                memberId: parentA.id,
                startDate: date,
                endDate: date,
                type: "annual_override",
            },
        });
    } else if (code === "B" && parentB) {
        await prisma.leave.create({
            data: {
                householdId,
                memberId: parentB.id,
                startDate: date,
                endDate: date,
                type: "annual_override",
            },
        });
    } else if (code === "both" && parentA && parentB) {
        await prisma.leave.createMany({
            data: [
                {
                    householdId,
                    memberId: parentA.id,
                    startDate: date,
                    endDate: date,
                    type: "annual_override",
                },
                {
                    householdId,
                    memberId: parentB.id,
                    startDate: date,
                    endDate: date,
                    type: "annual_override",
                },
            ],
        });
    } else if (code.startsWith("C:")) {
        const caregiverId = code.slice(2);
        await prisma.careAssignment.upsert({
            where: {
                householdId_date_caregiverId: { householdId, date, caregiverId },
            },
            create: { householdId, date, caregiverId, isAuto: false },
            update: {},
        });
    }
}

type PlanInput = {
    parentA: {
        name: string;
        shortLabel: string;
        offDays: Weekday[];
        allowance: number;
        getsBankHolidays: boolean;
    };
    parentB?: {
        name: string;
        shortLabel: string;
        offDays: Weekday[];
        allowance: number;
        getsBankHolidays: boolean;
    } | null;
    schoolClosedDates: string[];
    jointDays: number;
    skipWeekends: boolean;
    overrides?: Record<string, OverrideCode>;
    bankHolidaySet: Set<string>;
    prioritizeSeasons?: boolean;
};

type PlanResult = {
    plan: DayPlanDTO[];
    usedA: number;
    usedB: number;
    remainingA: number;
    remainingB: number;
    stillUncovered: number;
};

function planAnnualLeave(input: PlanInput): PlanResult {
    const weekdayNameLocal = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const parseDate = (s: string) => new Date(`${s}T00:00:00.000Z`);
    const ymdLocal = (d: Date) =>
        new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
            .toISOString()
            .slice(0, 10);
    const addDays = (d: Date, n: number) => {
        const nd = new Date(d);
        nd.setUTCDate(nd.getUTCDate() + n);
        return nd;
    };
    const isWeekend = (d: Date) => [0, 6].includes(d.getUTCDay());
    const groupConsecutiveLocal = (dates: Date[]) => {
        const res: Date[][] = [];
        const s = [...dates].sort((a, b) => a.getTime() - b.getTime());
        let cur: Date[] = [];
        for (let i = 0; i < s.length; i++) {
            if (i === 0) cur = [s[i]];
            else {
                const diff = Math.round(
                    (s[i].getTime() - s[i - 1].getTime()) / 86400000
                );
                if (diff === 1) cur.push(s[i]);
                else {
                    res.push(cur);
                    cur = [s[i]];
                }
            }
        }
        if (cur.length) res.push(cur);
        return res;
    };
    const windowContains = (date: Date, start: Date, end: Date) =>
        date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
    const getSeasonWindows = (forYears: number[]) => {
        const win: { name: "christmas" | "summer"; start: Date; end: Date }[] = [];
        for (const y of forYears) {
            win.push({ name: "summer", start: new Date(Date.UTC(y, 5, 20)), end: new Date(Date.UTC(y, 8, 1)) });
            win.push({
                name: "christmas",
                start: new Date(Date.UTC(y, 11, 15)),
                end: new Date(Date.UTC(y + 1, 0, 7)),
            });
        }
        return win;
    };

    const A = { ...input.parentA };
    const B = input.parentB ? { ...input.parentB } : null;

    const overrides = input.overrides ?? {};
    const offSetA = new Set<Weekday>(A.offDays);
    const offSetB = new Set<Weekday>(B?.offDays ?? []);
    const hasB = !!B;

    const dates = input.schoolClosedDates
        .map(parseDate)
        .filter((d): d is Date => !Number.isNaN(d.getTime()))
        .filter((d) => (input.skipWeekends ? !isWeekend(d) : true))
        .sort((a, b) => a.getTime() - b.getTime());

    const plan: DayPlanDTO[] = dates.map((d) => {
        const w = d.getUTCDay() as Weekday;
        const isBH = input.bankHolidaySet.has(ymdLocal(d));

        const aOff = offSetA.has(w) || (isBH && A.getsBankHolidays);
        const bOff = hasB
            ? offSetB.has(w) || (isBH && (B as any).getsBankHolidays)
            : false;

        let coverage: DayPlanDTO["coverage"] =
            aOff && bOff
                ? { type: "off", who: "both" }
                : aOff
                    ? { type: "off", who: "A" }
                    : bOff
                        ? { type: "off", who: "B" }
                        : { type: "none" };

        return { date: ymdLocal(d), weekday: weekdayNameLocal[w], coverage };
    });

    for (const p of plan) {
        const ov = overrides[p.date];
        if (!ov || p.coverage.type === "off") continue;

        if (ov === "both" && hasB && A.allowance > 0 && (B as any).allowance > 0) {
            p.coverage = { type: "leave", who: "both" };
            A.allowance--;
            (B as any).allowance--;
        } else if (ov === "A" && A.allowance > 0) {
            p.coverage = { type: "leave", who: "A" };
            A.allowance--;
        } else if (ov === "B" && hasB && (B as any).allowance > 0) {
            p.coverage = { type: "leave", who: "B" };
            (B as any).allowance--;
        } else if (ov?.startsWith("C:")) {
            p.coverage = { type: "care", caregiverId: ov.slice(2) };
        }
    }

    const years = Array.from(new Set(dates.map((d) => d.getUTCFullYear())));
    const seasonWindows = input.prioritizeSeasons ? getSeasonWindows(years) : [];
    const isUncovered = (p: DayPlanDTO) => p.coverage.type === "none";

    const makeBlocks = () => {
        const uncoveredDates = plan
            .filter(isUncovered)
            .map((p) => parseDate(p.date) as Date);
        return groupConsecutiveLocal(uncoveredDates);
    };
    const assignBlockAll = (block: Date[], who: "A" | "B" | "both") => {
        for (const d of block) {
            const id = ymdLocal(d);
            const p = plan.find((x) => x.date === id)!;
            if (p.coverage.type !== "none") continue;
            p.coverage =
                who === "both" ? { type: "leave", who: "both" } : { type: "leave", who };
        }
    };
    const blockLen = (b: Date[]) => b.length;
    const withinSeason = (block: Date[], name: "christmas" | "summer") => {
        const windows = seasonWindows.filter((w) => w.name === name);
        return block.some((d) =>
            windows.some((w) => windowContains(d, w.start, w.end))
        );
    };

    let jointRemaining = hasB ? input.jointDays : 0;
    if (hasB && jointRemaining > 0) {
        const trySeason = (season: "christmas" | "summer") => {
            let blocks = makeBlocks()
                .filter((b) => withinSeason(b, season))
                .sort((a, b) => a[0].getTime() - b[0].getTime());
            for (const b of blocks) {
                const L = blockLen(b);
                if (
                    L <= jointRemaining &&
                    A.allowance >= L &&
                    (B as any).allowance >= L
                ) {
                    assignBlockAll(b, "both");
                    A.allowance -= L;
                    (B as any).allowance -= L;
                    jointRemaining -= L;
                }
                if (!jointRemaining) break;
            }
        };
        trySeason("christmas");
        if (jointRemaining) trySeason("summer");
    }

    let blocks = makeBlocks().sort(
        (a, b) => a[0].getTime() - b[0].getTime()
    );
    for (const block of blocks) {
        let L = blockLen(block);
        if (L === 0) continue;

        const canA = A.allowance >= L;
        const canB = hasB ? (B as any).allowance >= L : false;

        if (canA && !canB) {
            assignBlockAll(block, "A");
            A.allowance -= L;
            continue;
        }
        if (!canA && canB) {
            assignBlockAll(block, "B");
            (B as any).allowance -= L;
            continue;
        }
        if (canA && canB) {
            if (A.allowance >= (B as any).allowance) {
                assignBlockAll(block, "A");
                A.allowance -= L;
            } else {
                assignBlockAll(block, "B");
                (B as any).allowance -= L;
            }
            continue;
        }

        if (A.allowance === 0 && (!hasB || (B as any).allowance === 0)) continue;

        const primary: "A" | "B" = !hasB
            ? "A"
            : A.allowance >= (B as any).allowance
                ? "A"
                : "B";
        const firstTake =
            primary === "A" ? Math.min(L, A.allowance) : Math.min(L, (B as any).allowance);
        if (firstTake > 0) {
            assignBlockAll(block.slice(0, firstTake), primary);
            primary === "A" ? (A.allowance -= firstTake) : ((B as any).allowance -= firstTake);
            L -= firstTake;
        }
        if (hasB && L > 0) {
            const secondary: "A" | "B" = primary === "A" ? "B" : "A";
            const secondTake =
                secondary === "A"
                    ? Math.min(L, A.allowance)
                    : Math.min(L, (B as any).allowance);
            if (secondTake > 0) {
                assignBlockAll(block.slice(firstTake, firstTake + secondTake), secondary);
                secondary === "A"
                    ? (A.allowance -= secondTake)
                    : ((B as any).allowance -= secondTake);
            }
        }
    }

    const usedA = plan.filter(
        (p) =>
            p.coverage.type === "leave" &&
            (p.coverage.who === "A" || p.coverage.who === "both")
    ).length;
    const usedB = hasB
        ? plan.filter(
            (p) =>
                p.coverage.type === "leave" &&
                (p.coverage.who === "B" || p.coverage.who === "both")
        ).length
        : 0;

    const remainingA = input.parentA.allowance - usedA;
    const remainingB = hasB ? (input.parentB as any).allowance - usedB : 0;
    const stillUncovered = plan.filter((p) => p.coverage.type === "none").length;

    return { plan, usedA, usedB, remainingA, remainingB, stillUncovered };
}

export async function autoPlanAndSave() {
    const householdId = await getHouseholdIdOrThrow();

    const settings = await prisma.annualSettings.upsert({
        where: { householdId },
        update: {},
        create: { householdId },
    });

    const parents = await prisma.member.findMany({
        where: { householdId, role: "parent" },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
        take: 2,
    });
    const prefsRows: ParentPrefsRow[] = await prisma.parentPrefs.findMany({
        where: { memberId: { in: parents.map((p: any) => p.id) } },
        select: {
            memberId: true,
            offDaysBitmask: true,
            allowanceDays: true,
            getsBankHolidays: true,
        },
    });
    const prefById = new Map<string, ParentPrefsRow>(
        prefsRows.map((p) => [p.memberId, p])
    );

    const caregivers = await prisma.member.findMany({
        where: { householdId, role: "caregiver" },
        select: { id: true },
    });

    const closures = await prisma.schoolDay.findMany({
        where: { householdId, isSchoolOpen: false },
        select: { date: true },
        orderBy: { date: "asc" },
    });
    const closureISO = closures.map((row: { date: Date; }) => ymd(row.date));

    const parentA = parents[0];
    const parentB = parents[1];

    const input: PlanInput = {
        parentA: {
            name: parentA?.name || "Parent A",
            shortLabel: "A",
            offDays: daysFromBitmask(prefById.get(parentA?.id ?? "")?.offDaysBitmask ?? 0),
            allowance: prefById.get(parentA?.id ?? "")?.allowanceDays ?? 0,
            getsBankHolidays: !!prefById.get(parentA?.id ?? "")?.getsBankHolidays,
        },
        parentB: parentB
            ? {
                name: parentB.name,
                shortLabel: "B",
                offDays: daysFromBitmask(prefById.get(parentB.id)?.offDaysBitmask ?? 0),
                allowance: prefById.get(parentB.id)?.allowanceDays ?? 0,
                getsBankHolidays: !!prefById.get(parentB.id)?.getsBankHolidays,
            }
            : null,
        schoolClosedDates: closureISO,
        jointDays: settings.jointDays,
        skipWeekends: settings.skipWeekends,
        overrides: {},
        bankHolidaySet: new Set<string>(), 
        prioritizeSeasons: settings.prioritizeSeasons,
    };

    const result = planAnnualLeave(input);

    await prisma.leave.deleteMany({
        where: { householdId, type: "annual_auto" },
    });
    await prisma.careAssignment.deleteMany({
        where: { householdId, isAuto: true },
    });

    const daysA: string[] = [];
    const daysB: string[] = [];
    const careRows: { date: Date; caregiverId: string }[] = [];

    for (const p of result.plan) {
        if (p.coverage.type === "leave") {
            if ((p.coverage.who === "A" || p.coverage.who === "both") && parentA) {
                daysA.push(p.date);
            }
            if ((p.coverage.who === "B" || p.coverage.who === "both") && parentB) {
                daysB.push(p.date);
            }
        } else if (p.coverage.type === "care") {
            careRows.push({ date: parseISO(p.date), caregiverId: p.coverage.caregiverId });
        }
    }

    if (parentA && daysA.length) {
        for (const block of groupConsecutive(daysA)) {
            await prisma.leave.create({
                data: {
                    householdId,
                    memberId: parentA.id,
                    startDate: parseISO(block[0]),
                    endDate: parseISO(block[block.length - 1]),
                    type: "annual_auto",
                },
            });
        }
    }
    if (parentB && daysB.length) {
        for (const block of groupConsecutive(daysB)) {
            await prisma.leave.create({
                data: {
                    householdId,
                    memberId: parentB.id,
                    startDate: parseISO(block[0]),
                    endDate: parseISO(block[block.length - 1]),
                    type: "annual_auto",
                },
            });
        }
    }

    if (careRows.length) {
        await prisma.careAssignment.createMany({
            data: careRows.map((r) => ({
                householdId,
                date: r.date,
                caregiverId: r.caregiverId,
                isAuto: true,
            })),
            skipDuplicates: true,
        });
    }

    return result;
}

export async function clearAutoPlan() {
    const householdId = await getHouseholdIdOrThrow();
    await prisma.leave.deleteMany({ where: { householdId, type: "annual_auto" } });
    await prisma.careAssignment.deleteMany({ where: { householdId, isAuto: true } });
}
