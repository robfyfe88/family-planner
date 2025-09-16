"use server";

import { prisma } from "@/lib/prisma";
import { getOrCreateHouseholdForUser as getHouseholdIdOrThrow } from "@/lib/household";

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type Region = "england-and-wales" | "scotland" | "northern-ireland";

export type OverrideCode =
    | "A" | "B" | "both"
    | `C:${string}`
    | "off:A" | "off:B" | "off:both"
    | "clear";

export type CoverageDTO =
    | { type: "none" }
    | { type: "off"; who: "A" | "B" | "both" }
    | { type: "leave"; who: "A" | "B" | "both" }
    | { type: "care"; caregiverId: string };

export type DayPlanDTO = { date: string; weekday: string; coverage: CoverageDTO };

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

export type HolidayEventDTO = {
    id: string;
    title: string;
    startDate: string; 
    endDate: string;   
    color: string | null;
    notes: string | null;
    allDay: boolean;
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
    holidayEvents: HolidayEventDTO[];
};

const weekdayName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

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

type ParentPrefsRow = {
    memberId: string;
    offDaysBitmask: number;
    allowanceDays: number;
    getsBankHolidays: boolean;
};

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

    const parents = members.filter((m) => m.role === "parent").slice(0, 2);
    const caregivers = members.filter((m) => m.role === "caregiver");

    const prefsRows = await prisma.parentPrefs.findMany({
        where: { memberId: { in: parents.map((p) => p.id) } },
        select: {
            memberId: true,
            offDaysBitmask: true,
            allowanceDays: true,
            getsBankHolidays: true,
        },
    });
    const prefByMember = new Map(prefsRows.map((r) => [r.memberId, r]));

    const parentDTOs: ParentConfigDTO[] = parents.map((p, idx) => {
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

    const caregiverDTOs: CaregiverDTO[] = caregivers.map((c) => ({
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
    const closureISO = closures.map((row) => ymd(row.date));

    const leaves = await prisma.leave.findMany({
        where: { householdId },
        select: { memberId: true, startDate: true, endDate: true, type: true },
    });

    const care = await prisma.careAssignment.findMany({
        where: { householdId },
        select: { date: true, caregiverId: true, isAuto: true },
    });

    const holidayEventsRows = await prisma.holidayEvent.findMany({
        where: { householdId },
        orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
    });
    const holidayEvents: HolidayEventDTO[] = holidayEventsRows.map((e) => ({
        id: e.id,
        title: e.title,
        startDate: ymd(e.startDate),
        endDate: ymd(e.endDate),
        color: e.color ?? null,
        notes: e.notes ?? null,
        allDay: e.allDay,
    }));

    const parentA = parentDTOs[0] ?? null;
    const parentB = parentDTOs[1] ?? null;

    const manualWatchA = new Set<string>();
    const manualWatchB = new Set<string>();
    if (parentA || parentB) {
        for (const L of leaves) {
            if (L.type !== "annual_watch_override") continue;
            let d = new Date(L.startDate);
            const end = new Date(L.endDate);
            while (d.getTime() <= end.getTime()) {
                const id = ymd(d);
                if (parentA && L.memberId === parentA.memberId) manualWatchA.add(id);
                if (parentB && L.memberId === parentB.memberId) manualWatchB.add(id);
                d = new Date(d.getTime() + 86400000);
            }
        }
    }

    const relevantDates = new Set<string>(closureISO);

    for (const L of leaves) {
        let d = new Date(L.startDate);
        const end = new Date(L.endDate);
        while (d.getTime() <= end.getTime()) {
            relevantDates.add(ymd(d));
            d = new Date(d.getTime() + 86400000);
        }
    }

    for (const ca of care) relevantDates.add(ymd(ca.date));

    const plan: DayPlanDTO[] = Array.from(relevantDates)
        .sort()
        .map((date) => {
            const d = parseISO(date);
            const w = d.getUTCDay() as Weekday;

            const manualA = !!(parentA && leaves.some(
                (L) =>
                    L.memberId === parentA.memberId &&
                    L.type === "annual_override" &&
                    d >= L.startDate && d <= L.endDate
            ));
            const manualB = !!(parentB && leaves.some(
                (L) =>
                    L.memberId === parentB.memberId &&
                    L.type === "annual_override" &&
                    d >= L.startDate && d <= L.endDate
            ));
            const watchA = parentA ? manualWatchA.has(date) : false;
            const watchB = parentB ? manualWatchB.has(date) : false;

            const manualCare = care.find((c) => !c.isAuto && ymd(c.date) === date);

            const autoA = !!(parentA && leaves.some(
                (L) =>
                    L.memberId === parentA.memberId &&
                    L.type === "annual_auto" &&
                    d >= L.startDate && d <= L.endDate
            ));
            const autoB = !!(parentB && leaves.some(
                (L) =>
                    L.memberId === parentB.memberId &&
                    L.type === "annual_auto" &&
                    d >= L.startDate && d <= L.endDate
            ));
            const autoCare = care.find((c) => c.isAuto && ymd(c.date) === date);

            let coverage: CoverageDTO = { type: "none" };
            if (manualA && manualB) coverage = { type: "leave", who: "both" };
            else if (manualA) coverage = { type: "leave", who: "A" };
            else if (manualB) coverage = { type: "leave", who: "B" };
            else if (manualCare) coverage = { type: "care", caregiverId: manualCare.caregiverId };
            else if (watchA && watchB) coverage = { type: "off", who: "both" };
            else if (watchA) coverage = { type: "off", who: "A" };
            else if (watchB) coverage = { type: "off", who: "B" };
            else if (autoA && autoB) coverage = { type: "leave", who: "both" };
            else if (autoA) coverage = { type: "leave", who: "A" };
            else if (autoB) coverage = { type: "leave", who: "B" };
            else if (autoCare) coverage = { type: "care", caregiverId: autoCare.caregiverId };

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
        holidayEvents,
    };
}

export async function updateMemberBasics(
    memberId: string,
    patch: { name?: string; shortLabel?: string | null; color?: string | null }
) {
    await prisma.member.update({ where: { id: memberId }, data: patch });
}

export async function updateCaregiverColor(memberId: string, color: string | null) {
    await prisma.member.update({ where: { id: memberId }, data: { color } });
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

export async function toggleClosure(dateISO: string) {
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

export async function clearAllSchoolClosures() {
    const householdId = await getHouseholdIdOrThrow();
    await prisma.schoolDay.deleteMany({ where: { householdId, isSchoolOpen: false } });
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
            startDate: date,
            endDate: date,
            type: { in: ["annual_override", "annual_watch_override"] },
        },
    });

    if (code === "clear") return;

    if (code === "A" && parentA) {
        await prisma.leave.create({
            data: { householdId, memberId: parentA.id, startDate: date, endDate: date, type: "annual_override" },
        });
        return;
    }
    if (code === "B" && parentB) {
        await prisma.leave.create({
            data: { householdId, memberId: parentB.id, startDate: date, endDate: date, type: "annual_override" },
        });
        return;
    }
    if (code === "both" && parentA && parentB) {
        await prisma.leave.createMany({
            data: [
                { householdId, memberId: parentA.id, startDate: date, endDate: date, type: "annual_override" },
                { householdId, memberId: parentB.id, startDate: date, endDate: date, type: "annual_override" },
            ],
        });
        return;
    }

    if (code === "off:A" && parentA) {
        await prisma.leave.create({
            data: { householdId, memberId: parentA.id, startDate: date, endDate: date, type: "annual_watch_override" },
        });
        return;
    }
    if (code === "off:B" && parentB) {
        await prisma.leave.create({
            data: { householdId, memberId: parentB.id, startDate: date, endDate: date, type: "annual_watch_override" },
        });
        return;
    }
    if (code === "off:both" && parentA && parentB) {
        await prisma.leave.createMany({
            data: [
                { householdId, memberId: parentA.id, startDate: date, endDate: date, type: "annual_watch_override" },
                { householdId, memberId: parentB.id, startDate: date, endDate: date, type: "annual_watch_override" },
            ],
        });
        return;
    }

    if (code.startsWith("C:")) {
        const caregiverId = code.slice(2);
        await prisma.careAssignment.upsert({
            where: { householdId_date_caregiverId: { householdId, date, caregiverId } },
            create: { householdId, date, caregiverId, isAuto: false },
            update: {},
        });
        return;
    }
}


async function buildBankHolidaySet(dbRegion: string): Promise<Set<string>> {
    const region: Region = fromDbRegion(dbRegion);
    try {
        const res = await fetch("https://www.gov.uk/bank-holidays.json", { cache: "no-store" });
        const json = await res.json() as any;
        const key =
            region === "england-and-wales" ? "england-and-wales"
                : region === "scotland" ? "scotland"
                    : "northern-ireland";
        const events: any[] = json?.[key]?.events ?? [];
        return new Set<string>(
            events.map((e) => (typeof e?.date === "string" ? e.date : null)).filter(Boolean)
        );
    } catch {
        return new Set<string>();
    }
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
    const parentA = parents[0] ?? null;
    const parentB = parents[1] ?? null;

    const prefsRows: ParentPrefsRow[] = await prisma.parentPrefs.findMany({
        where: { memberId: { in: parents.map((p) => p.id) } },
        select: {
            memberId: true,
            offDaysBitmask: true,
            allowanceDays: true,
            getsBankHolidays: true,
        },
    });
    const prefById = new Map<string, ParentPrefsRow>(prefsRows.map((p) => [p.memberId, p]));

    const closureRows = await prisma.schoolDay.findMany({
        where: { householdId, isSchoolOpen: false },
        select: { date: true },
        orderBy: { date: "asc" },
    });
    const closureISO = closureRows.map((row) => ymd(row.date));

    const manualLeaves = await prisma.leave.findMany({
        where: { householdId, type: { in: ["annual_override", "annual_watch_override"] } },
        select: { memberId: true, startDate: true, endDate: true, type: true },
    });
    const manualCare = await prisma.careAssignment.findMany({
        where: { householdId, isAuto: false },
        select: { date: true },
    });
    const manualCareSet = new Set(manualCare.map((c) => ymd(c.date)));

    const manualLeaveDates = new Set<string>();
    for (const L of manualLeaves) {
        let d = new Date(L.startDate);
        const end = new Date(L.endDate);
        while (d.getTime() <= end.getTime()) {
            manualLeaveDates.add(ymd(d));
            d = new Date(d.getTime() + 86400000);
        }
    }

    const bankHolidays = await buildBankHolidaySet(settings.region);

    const fillDates = closureISO
        .filter((id) => !manualLeaveDates.has(id) && !manualCareSet.has(id))
        .filter((id) => (settings.skipWeekends ? ![0, 6].includes(parseISO(id).getUTCDay()) : true));

    const A = parentA
        ? {
            id: parentA.id,
            allowance: prefById.get(parentA.id)?.allowanceDays ?? 0,
            offDays: daysFromBitmask(prefById.get(parentA.id)?.offDaysBitmask ?? 0),
            getsBH: !!prefById.get(parentA.id)?.getsBankHolidays,
        }
        : null;

    const B = parentB
        ? {
            id: parentB.id,
            allowance: prefById.get(parentB.id)?.allowanceDays ?? 0,
            offDays: daysFromBitmask(prefById.get(parentB.id)?.offDaysBitmask ?? 0),
            getsBH: !!prefById.get(parentB.id)?.getsBankHolidays,
        }
        : null;

    await prisma.leave.deleteMany({ where: { householdId, type: "annual_auto" } });
    await prisma.careAssignment.deleteMany({ where: { householdId, isAuto: true } });

    const coveredByRules = new Set<string>();
    for (const id of fillDates) {
        const d = parseISO(id);
        const w = d.getUTCDay() as Weekday;
        const isBH = bankHolidays.has(id);
        const aOff = !!A && (A.offDays.includes(w) || (isBH && A.getsBH));
        const bOff = !!B && (B.offDays.includes(w) || (isBH && B.getsBH));
        if (aOff || bOff) coveredByRules.add(id);
    }

    const remaining = fillDates.filter((id) => !coveredByRules.has(id));

    const remainingBlocks: string[][] = (() => {
        const blocks: string[][] = [];
        const s = [...remaining].sort();
        let cur: string[] = [];
        for (let i = 0; i < s.length; i++) {
            if (i === 0) cur = [s[i]];
            else {
                const prev = parseISO(s[i - 1]);
                const curD = parseISO(s[i]);
                const diff = Math.round((+curD - +prev) / 86400000);
                if (diff === 1) cur.push(s[i]);
                else { blocks.push(cur); cur = [s[i]]; }
            }
        }
        if (cur.length) blocks.push(cur);
        return blocks;
    })();

    const leaveCreates: { memberId: string; start: string; end: string }[] = [];

    let jointRemaining = B ? (settings.jointDays ?? 0) : 0;
    if (A && B && jointRemaining > 0) {
        for (const block of remainingBlocks) {
            const L = block.length;
            if (!L) continue;
            if (A.allowance >= L && B.allowance >= L && jointRemaining >= L) {
                leaveCreates.push({ memberId: A.id, start: block[0], end: block[L - 1] });
                leaveCreates.push({ memberId: B.id, start: block[0], end: block[L - 1] });
                A.allowance -= L;
                B.allowance -= L;
                jointRemaining -= L;
                block.length = 0;
            }
            if (jointRemaining <= 0) break;
        }
    }

    for (const block of remainingBlocks) {
        if (!block.length) continue;
        const L = block.length;

        const preferA = !!A && (!B || A.allowance >= B.allowance);

        if (preferA && A) {
            const take = Math.min(L, A.allowance);
            if (take > 0) {
                leaveCreates.push({ memberId: A.id, start: block[0], end: block[take - 1] });
                A.allowance -= take;
            }
            const rem = L - take;
            if (B && rem > 0 && B.allowance > 0) {
                const takeB = Math.min(rem, B.allowance);
                leaveCreates.push({ memberId: B.id, start: block[take], end: block[take + takeB - 1] });
                B.allowance -= takeB;
            }
        } else if (B) {
            const takeB = Math.min(L, B.allowance);
            if (takeB > 0) {
                leaveCreates.push({ memberId: B.id, start: block[0], end: block[takeB - 1] });
                B.allowance -= takeB;
            }
            const rem = L - takeB;
            if (A && rem > 0 && A.allowance > 0) {
                const takeA = Math.min(rem, A.allowance);
                leaveCreates.push({ memberId: A.id, start: block[takeB], end: block[takeB + takeA - 1] });
                A.allowance -= takeA;
            }
        }
    }

    for (const g of leaveCreates) {
        await prisma.leave.create({
            data: {
                householdId,
                memberId: g.memberId,
                startDate: parseISO(g.start),
                endDate: parseISO(g.end),
                type: "annual_auto",
            },
        });
    }

    return fetchAnnualData();
}

export async function clearAutoPlan() {
    const householdId = await getHouseholdIdOrThrow();
    await prisma.leave.deleteMany({ where: { householdId, type: "annual_auto" } });
    await prisma.careAssignment.deleteMany({ where: { householdId, isAuto: true } });
}

export async function listHolidayEvents(): Promise<HolidayEventDTO[]> {
    const householdId = await getHouseholdIdOrThrow();
    const rows = await prisma.holidayEvent.findMany({
        where: { householdId },
        orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
    });
    return rows.map((e) => ({
        id: e.id,
        title: e.title,
        startDate: ymd(e.startDate),
        endDate: ymd(e.endDate),
        color: e.color ?? null,
        notes: e.notes ?? null,
        allDay: e.allDay,
    }));
}

export async function createHolidayEvent(input: {
    title: string;
    startDateISO: string;
    endDateISO: string;
    color?: string | null;
    notes?: string | null;
    allDay?: boolean;
}): Promise<HolidayEventDTO> {
    const householdId = await getHouseholdIdOrThrow();

    const s = parseISO(input.startDateISO);
    const e = parseISO(input.endDateISO);
    if (e.getTime() < s.getTime()) throw new Error("endDate must be >= startDate");

    const row = await prisma.holidayEvent.create({
        data: {
            householdId,
            title: input.title.trim(),
            startDate: s,
            endDate: e,
            color: input.color ?? null,
            notes: input.notes ?? null,
            allDay: input.allDay ?? true,
        },
    });
    return {
        id: row.id,
        title: row.title,
        startDate: ymd(row.startDate),
        endDate: ymd(row.endDate),
        color: row.color ?? null,
        notes: row.notes ?? null,
        allDay: row.allDay,
    };
}

export async function updateHolidayEvent(
    id: string,
    patch: Partial<{
        title: string;
        startDateISO: string;
        endDateISO: string;
        color: string | null;
        notes: string | null;
        allDay: boolean;
    }>
): Promise<HolidayEventDTO> {
    const householdId = await getHouseholdIdOrThrow();

    const row0 = await prisma.holidayEvent.findUnique({ where: { id } });
    if (!row0 || row0.householdId !== householdId) {
        throw new Error("Not found or access denied");
    }

    const data: any = {};
    if (typeof patch.title === "string") data.title = patch.title.trim();
    if (typeof patch.color !== "undefined") data.color = patch.color;
    if (typeof patch.notes !== "undefined") data.notes = patch.notes;
    if (typeof patch.allDay === "boolean") data.allDay = patch.allDay;
    if (typeof patch.startDateISO === "string") data.startDate = parseISO(patch.startDateISO);
    if (typeof patch.endDateISO === "string") data.endDate = parseISO(patch.endDateISO);

    const row = await prisma.holidayEvent.update({ where: { id }, data });
    return {
        id: row.id,
        title: row.title,
        startDate: ymd(row.startDate),
        endDate: ymd(row.endDate),
        color: row.color ?? null,
        notes: row.notes ?? null,
        allDay: row.allDay,
    };
}

export async function deleteHolidayEvent(id: string): Promise<void> {
    const householdId = await getHouseholdIdOrThrow();
    const row = await prisma.holidayEvent.findUnique({ where: { id } });
    if (!row || row.householdId !== householdId) throw new Error("Not found or access denied");
    await prisma.holidayEvent.delete({ where: { id } });
}
