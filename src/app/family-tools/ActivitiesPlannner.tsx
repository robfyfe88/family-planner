"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
    Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
    Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { CalendarPlus, BrushCleaning, Trash2, Pencil } from "lucide-react";

type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

interface Member {
    id: string;
    role: "parent" | "child";
    slot?: "p1" | "p2";
    name: string;
    shortLabel: string;
    color: string;
}

type ActivityType = "Sports" | "Clubs" | "Lessons" | "Appointments" | "Event" | "Other";

type RecurrenceKind = "none" | "weekly" | "biweekly" | "every_n_weeks";

interface Recurrence {
    kind: RecurrenceKind;
    daysOfWeek: Weekday[];
    intervalWeeks?: number;
}

interface Activity {
    id: string;
    type: ActivityType;
    name: string;
    memberIds: string[];
    startDate: string;
    endDate: string;
    recurrence: Recurrence;
    costPerSession: number;
    notes?: string;
}

const weekdayName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parseDate(s: string): Date | null {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function ymd(d: Date): string {
    const tz = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    return tz.toISOString().slice(0, 10);
}
function addDays(d: Date, n: number): Date {
    const nd = new Date(d);
    nd.setDate(nd.getDate() + n);
    return nd;
}
function startOfMonth(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
function sameDay(a: Date, b: Date) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function clampRange(a: Date, b: Date) {
    const lo = a.getTime() <= b.getTime() ? a : b;
    const hi = a.getTime() <= b.getTime() ? b : a;
    return { lo, hi };
}

const STORE_KEY = "activitiesPlanner:v2";
const uid = () =>
    typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
const palette = ["#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EF4444", "#06B6D4", "#84CC16", "#F97316", "#22D3EE"];

function useLocalStorageState<T>(key: string, initialValue: T) {
    const [value, setValue] = useState<T>(() => {
        if (typeof window === "undefined") return initialValue;
        try {
            const raw = localStorage.getItem(key);
            return raw ? (JSON.parse(raw) as T) : initialValue;
        } catch {
            return initialValue;
        }
    });
    useEffect(() => {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch { }
    }, [key, value]);
    return [value, setValue] as const;
}

function expandActivityDates(a: Activity, windowLo: Date, windowHi: Date): string[] {
    const s = parseDate(a.startDate)!;
    const e = parseDate(a.endDate)!;
    const { lo, hi } = clampRange(s, e);

    if (hi < windowLo || lo > windowHi) return [];

    const pushIfInWindow = (d: Date, arr: string[]) => {
        if (d >= windowLo && d <= windowHi) arr.push(ymd(d));
    };

    const result: string[] = [];
    const addWeeklyLike = (intervalWeeks: number) => {
        const anchorWeekStart = addDays(s, -s.getDay());
        for (let weekStart = new Date(anchorWeekStart); weekStart <= hi; weekStart = addDays(weekStart, 7 * intervalWeeks)) {
            for (const wd of a.recurrence.daysOfWeek) {
                const occ = addDays(weekStart, wd);
                if (occ >= lo && occ <= hi) pushIfInWindow(occ, result);
            }
        }
    };

    switch (a.recurrence.kind) {
        case "none": {
            for (let d = new Date(lo); d <= hi; d = addDays(d, 1)) pushIfInWindow(d, result);
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
            const n = Math.max(1, a.recurrence.intervalWeeks || 1);
            addWeeklyLike(n);
            break;
        }
    }
    return result;
}

function countOccurrences(a: Activity, lo: Date, hi: Date) {
    return expandActivityDates(a, lo, hi).length;
}

export default function ActivitiesPlanner() {
    const [members, setMembers] = useLocalStorageState<Member[]>(
        `${STORE_KEY}:members`,
        [{ id: uid(), role: "parent", slot: "p1", name: "Parent 1", shortLabel: "P1", color: palette[0] }]
    );
    const [showParent2, setShowParent2] = useLocalStorageState<boolean>(`${STORE_KEY}:showParent2`, false);

    useEffect(() => {
        if (showParent2) {
            if (!members.some(m => m.role === "parent" && m.slot === "p2")) {
                setMembers(prev => [
                    ...prev,
                    { id: uid(), role: "parent", slot: "p2", name: "Parent 2", shortLabel: "P2", color: palette[1] },
                ]);
            }
        } else {
            setMembers(prev => prev.filter(m => !(m.role === "parent" && m.slot === "p2")));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showParent2]);

    const addChild = () => {
        const idx = members.filter(m => m.role === "child").length + 1;
        const color = palette[(members.length) % palette.length];
        setMembers(prev => [...prev, { id: uid(), role: "child", name: `Child ${idx}`, shortLabel: `C${idx}`, color }]);
    };
    const updateMember = (id: string, patch: Partial<Member>) =>
        setMembers(prev => prev.map(m => (m.id === id ? { ...m, ...patch } : m)));
    const removeMember = (id: string) => setMembers(prev => prev.filter(m => m.id !== id));

    const [activities, setActivities] = useLocalStorageState<Activity[]>(`${STORE_KEY}:activities`, []);

    const [anchorISO, setAnchorISO] = useLocalStorageState<string>(`${STORE_KEY}:anchorISO`, new Date().toISOString());
    const anchor = useMemo(() => new Date(anchorISO), [anchorISO]);
    const setAnchor = (d: Date) => setAnchorISO(new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1)).toISOString());

    const monthLo = startOfMonth(anchor);
    const monthHi = endOfMonth(anchor);

    const cells = useMemo(() => {
        const first = startOfMonth(anchor);
        const gridStart = addDays(first, -first.getDay());
        const arr: Date[] = [];
        for (let i = 0; i < 42; i++) arr.push(addDays(gridStart, i));
        return arr;
    }, [anchor]);
    const monthDays = useMemo(() => {
        const arr: Date[] = [];
        for (let d = new Date(monthLo); d <= monthHi; d = addDays(d, 1)) arr.push(new Date(d));
        return arr;
    }, [monthLo, monthHi]);

    const isToday = (d: Date) => sameDay(d, new Date());
    const withinMonth = (d: Date) => d >= monthLo && d <= monthHi;
    const parent1 = members.find(m => m.role === "parent" && m.slot === "p1");
    const parent2 = members.find(m => m.role === "parent" && m.slot === "p2");
    const [dragging, setDragging] = useState(false);
    const [dragStart, setDragStart] = useState<string | null>(null);
    const [dragEnd, setDragEnd] = useState<string | null>(null);
    const isInDragRange = (id: string) => {
        if (!dragging || !dragStart || !dragEnd) return false;
        const s = parseDate(dragStart)!;
        const e = parseDate(dragEnd)!;
        const { lo, hi } = clampRange(s, e);
        const d = parseDate(id)!;
        return d >= lo && d <= hi;
    };

    const [modalOpen, setModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const editing = activities.find(a => a.id === editingId) || null;

    type FormState = {
        type: ActivityType;
        name: string;
        startDate: string;
        endDate: string;
        memberIds: Set<string>;
        recurrenceKind: RecurrenceKind;
        daysOfWeek: Set<Weekday>;
        intervalWeeks: string;
        costPerSession: string;
        notes: string;
    };

    const emptyForm = (): FormState => ({
        type: "Sports",
        name: "",
        startDate: ymd(monthLo),
        endDate: ymd(monthLo),
        memberIds: new Set(),
        recurrenceKind: "none",
        daysOfWeek: new Set<Weekday>([]),
        intervalWeeks: "3",
        costPerSession: "",
        notes: "",
    });

    const [form, setForm] = useState<FormState>(emptyForm());

    const openForCreate = (startISO: string, endISO: string) => {
        setEditingId(null);
        setForm(f => ({
            ...emptyForm(),
            startDate: startISO,
            endDate: endISO,
        }));
        setModalOpen(true);
    };

    const openForEdit = (a: Activity) => {
        setEditingId(a.id);
        setForm({
            type: a.type,
            name: a.name,
            startDate: a.startDate,
            endDate: a.endDate,
            memberIds: new Set(a.memberIds),
            recurrenceKind: a.recurrence.kind,
            daysOfWeek: new Set(a.recurrence.daysOfWeek),
            intervalWeeks: String(a.recurrence.intervalWeeks ?? 3),
            costPerSession: String(a.costPerSession ?? 0),
            notes: a.notes || "",
        });
        setModalOpen(true);
    };

    const closeModal = () => setModalOpen(false);

    const onPointerDownCell = (id: string, e: React.PointerEvent) => {
        if (e.pointerType !== "mouse") e.preventDefault();
        setDragging(true);
        setDragStart(id);
        setDragEnd(id);
    };
    const onPointerEnterCell = (id: string) => { if (dragging) setDragEnd(id); };
    const commitDrag = () => {
        if (!dragging || !dragStart || !dragEnd) { setDragging(false); return; }
        openForCreate(dragStart, dragEnd);
        setDragging(false);
        setDragStart(null);
        setDragEnd(null);
    };

    const activitiesByDate = useMemo(() => {
        const map = new Map<string, Activity[]>();
        for (const a of activities) {
            const occs = expandActivityDates(a, monthLo, monthHi);
            for (const id of occs) {
                if (!map.has(id)) map.set(id, []);
                map.get(id)!.push(a);
            }
        }
        return map;
    }, [activities, monthLo, monthHi]);

    const sessionsThisMonth = useMemo(() => {
        return activities.reduce((sum, a) => sum + countOccurrences(a, monthLo, monthHi), 0);
    }, [activities, monthLo, monthHi]);

    const monthCostTotal = useMemo(() => {
        return activities.reduce((sum, a) => {
            const n = countOccurrences(a, monthLo, monthHi);
            return sum + n * (a.costPerSession || 0);
        }, 0);
    }, [activities, monthLo, monthHi]);

    const breakdownByMember = useMemo(() => {
        const map = new Map<string, number>();
        for (const m of members) map.set(m.id, 0);
        for (const a of activities) {
            const n = countOccurrences(a, monthLo, monthHi);
            if (n === 0 || a.memberIds.length === 0) continue;
            const total = n * (a.costPerSession || 0);
            const share = total / a.memberIds.length;
            for (const mid of a.memberIds) {
                map.set(mid, (map.get(mid) || 0) + share);
            }
        }
        return map;
    }, [activities, members, monthLo, monthHi]);

    const saveActivity = () => {
        if (!form.name.trim()) return;
        if (form.memberIds.size === 0) return;

        const recurrence: Recurrence = {
            kind: form.recurrenceKind,
            daysOfWeek: Array.from(form.daysOfWeek),
            intervalWeeks: form.recurrenceKind === "every_n_weeks" ? Math.max(1, parseInt(form.intervalWeeks || "1", 10)) : undefined,
        };

        const base: Activity = {
            id: editingId || uid(),
            type: form.type,
            name: form.name.trim(),
            memberIds: Array.from(form.memberIds),
            startDate: form.startDate,
            endDate: form.endDate,
            recurrence,
            costPerSession: parseFloat(form.costPerSession || "0") || 0,
            notes: form.notes?.trim() || undefined,
        };

        setActivities(prev => {
            if (editingId) {
                return prev.map(a => (a.id === editingId ? base : a));
            }
            return [...prev, base];
        });
        setModalOpen(false);
    };

    const deleteActivity = () => {
        if (!editingId) return;
        setActivities(prev => prev.filter(a => a.id !== editingId));
        setModalOpen(false);
    };

    const formPreview = useMemo(() => {
        const fake: Activity = {
            id: "preview",
            type: form.type,
            name: form.name || "(activity)",
            memberIds: Array.from(form.memberIds),
            startDate: form.startDate,
            endDate: form.endDate,
            recurrence: {
                kind: form.recurrenceKind,
                daysOfWeek: Array.from(form.daysOfWeek),
                intervalWeeks: form.recurrenceKind === "every_n_weeks" ? Math.max(1, parseInt(form.intervalWeeks || "1", 10)) : undefined,
            },
            costPerSession: parseFloat(form.costPerSession || "0") || 0,
            notes: form.notes || "",
        };
        const nAll = countOccurrences(fake, parseDate(fake.startDate)!, parseDate(fake.endDate)!);
        const nMonth = countOccurrences(fake, monthLo, monthHi);
        return {
            occurrencesRange: nAll,
            occurrencesThisMonth: nMonth,
            totalCostRange: nAll * fake.costPerSession,
            totalCostThisMonth: nMonth * fake.costPerSession,
        };
    }, [form, monthLo, monthHi]);

    useEffect(() => {
        setMembers(prev => {
            const parents = prev.filter(m => m.role === "parent");
            const hasP1 = parents.some(m => m.slot === "p1");
            const hasP2 = parents.some(m => m.slot === "p2");
            let changed = false;
            const next = prev.map(m => ({ ...m }));

            if (!hasP1 && parents[0]) {
                const idx = next.findIndex(x => x.id === parents[0].id);
                next[idx].slot = "p1"; changed = true;
            }
            if (showParent2 && !hasP2 && parents[1]) {
                const idx = next.findIndex(x => x.id === parents[1].id);
                next[idx].slot = "p2"; changed = true;
            }
            return changed ? next : prev;
        });
    }, [setMembers, showParent2]);


    return (
        <div className="space-y-6">
            <h2 className="text-xl sm:text-2xl font-semibold">Activities Planner</h2>
            <section className="card space-y-4">
                <div className="flex flex-wrap items-end gap-3 justify-between">
                    <div className="text-sm opacity-80">Add your family and assign colours. These appear on the calendar.</div>
                    <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => setForm(emptyForm())}>
                            <BrushCleaning className="mr-1 h-4 w-4" />Reset form
                        </Button>
                        <Button size="sm" onClick={() => openForCreate(ymd(monthLo), ymd(monthLo))}>
                            <CalendarPlus className="mr-1 h-4 w-4" /> New activity
                        </Button>
                    </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4 items-stretch">
                    {parent1 && (
                        <MemberCard
                            member={parent1}
                            onChange={(patch) => updateMember(parent1.id, patch)}
                        />
                    )}

                    {showParent2 ? (
                        parent2 ? (
                            <MemberCard
                                member={parent2}
                                onChange={(patch) => updateMember(parent2.id, patch)}
                                onRemove={() => setShowParent2(false)}
                            />
                        ) : null
                    ) : (
                        <div className="p-3 border rounded-2xl flex items-center justify-center h-full">
                            <Button variant="outline" onClick={() => setShowParent2(true)}>+ Add Parent 2</Button>
                        </div>
                    )}
                </div>

                <div className="space-y-2">
                    <div className="text-sm font-medium">Children</div>
                    <div className="flex flex-col gap-3">
                        {members.filter(m => m.role === "child").map((m) => (
                            <MemberRow key={m.id} member={m} onChange={(patch) => updateMember(m.id, patch)} onRemove={() => removeMember(m.id)} />
                        ))}
                        <Button variant="outline" className="w-full sm:w-auto" onClick={addChild}>+ Add child</Button>
                    </div>
                </div>
            </section>

            <section className="card">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1))}>←</Button>
                        <Button variant="outline" size="sm" onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1))}>→</Button>
                    </div>
                    <div className="text-lg font-medium text-center sm:text-left">
                        {anchor.toLocaleString("default", { month: "long" })} {anchor.getFullYear()}
                    </div>
                    <MonthPicker anchor={anchor} onChange={setAnchor} />
                </div>

                <div className="block md:hidden">
                    <MobileMonthList
                        days={monthDays}
                        members={members}
                        activitiesByDate={activitiesByDate}
                        onDayTap={(id) => openForCreate(id, id)}
                        onChipTap={(a) => openForEdit(a)}
                    />
                </div>

                <div className="hidden md:block select-none touch-none">
                    <div className="grid grid-cols-7 text-[11px] sm:text-xs opacity-70 mb-1">
                        {weekdayName.map((w) => (<div key={w} className="px-2 py-1">{w}</div>))}
                    </div>
                    <div className="grid grid-cols-7 gap-px bg-[var(--border-color)] rounded-xl overflow-hidden">
                        {cells.map((d) => {
                            const id = ymd(d);
                            const within = withinMonth(d);
                            const dayActs = activitiesByDate.get(id) || [];

                            return (
                                <div
                                    key={id}
                                    data-date={id}
                                    onPointerDown={(e) => onPointerDownCell(id, e)}
                                    onPointerEnter={() => onPointerEnterCell(id)}
                                    onPointerUp={(e) => { e.preventDefault(); commitDrag(); }}
                                    className={`h-24 md:h-28 p-2 relative cursor-pointer bg-white
                    ${within ? "" : "bg-gray-50 opacity-60"}
                    ${isToday(d) ? "ring-1 ring-[var(--accent-2)]" : ""}
                    ${isInDragRange(id) ? "outline outline-2 outline-[var(--accent-2)]" : ""}`}
                                    title={id}
                                    onDoubleClick={() => openForCreate(id, id)}
                                >
                                    <div className="text-xs mb-1 flex items-center justify-between">
                                        <span className={`px-1.5 py-0.5 rounded ${within ? "" : "opacity-60"}`}>{d.getDate()}</span>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7"
                                            onPointerDown={(e) => e.stopPropagation()}
                                            onPointerUp={(e) => e.stopPropagation()}
                                            onClick={(e) => { e.stopPropagation(); openForCreate(id, id); }}
                                        >
                                            <CalendarPlus />
                                        </Button>
                                    </div>

                                    <div className="flex flex-wrap gap-1">
                                        {dayActs.slice(0, 3).map((a) => (
                                            <ActivityChip key={a.id} activity={a} members={members} onClick={() => openForEdit(a)} />
                                        ))}
                                        {dayActs.length > 3 && (
                                            <span className="text-[11px] opacity-70">+{dayActs.length - 3} more</span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 mt-3 text-xs opacity-80">
                    {members.map(m => (
                        <span key={m.id} className="inline-flex items-center gap-1">
                            <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: m.color }} />
                            {m.shortLabel}
                        </span>
                    ))}
                    <span className="ml-auto font-medium">
                        Sessions: {sessionsThisMonth} • Month total: £{monthCostTotal.toFixed(2)}
                    </span>
                </div>

                <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                    {members.map(m => {
                        const v = breakdownByMember.get(m.id) || 0;
                        return (
                            <div key={m.id} className="p-2 border rounded-lg bg-[var(--card-bg)] flex items-center justify-between">
                                <span className="inline-flex items-center gap-2">
                                    <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: m.color }} />
                                    {m.name}
                                </span>
                                <span className="font-medium">£{v.toFixed(2)}</span>
                            </div>
                        );
                    })}
                </div>
            </section>

            <Dialog open={modalOpen} onOpenChange={setModalOpen}>
                <DialogContent className="sm:max-w-xl">
                    <DialogHeader>
                        <DialogTitle>{editing ? "Edit activity" : "Add activity"}</DialogTitle>
                        <DialogDescription>
                            Assign members, set dates and recurrence. Costs are per session; totals are auto-calculated.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="flex flex-col gap-1">
                                <Label className="text-sm">Activity type</Label>
                                <Select value={form.type} onValueChange={(v: ActivityType) => setForm(f => ({ ...f, type: v }))}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {["Sports", "Clubs", "Lessons", "Appointments", "Event", "Other"].map(t => (
                                            <SelectItem key={t} value={t}>{t}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="flex flex-col gap-1">
                                <Label className="text-sm">Activity name</Label>
                                <Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Swimming club" />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="flex flex-col gap-1">
                                <Label className="text-sm">Start date</Label>
                                <Input type="date" value={form.startDate} onChange={(e) => setForm(f => ({ ...f, startDate: e.target.value }))} />
                            </div>
                            <div className="flex flex-col gap-1">
                                <Label className="text-sm">End date</Label>
                                <Input type="date" value={form.endDate} onChange={(e) => setForm(f => ({ ...f, endDate: e.target.value }))} />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="flex flex-col gap-1">
                                <Label className="text-sm">Recurrence</Label>
                                <Select value={form.recurrenceKind} onValueChange={(v: RecurrenceKind) => setForm(f => ({ ...f, recurrenceKind: v }))}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">None (every day in range)</SelectItem>
                                        <SelectItem value="weekly">Weekly</SelectItem>
                                        <SelectItem value="biweekly">Every 2 weeks</SelectItem>
                                        <SelectItem value="every_n_weeks">Every N weeks</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {form.recurrenceKind === "every_n_weeks" && (
                                <div className="flex flex-col gap-1">
                                    <Label className="text-sm">Interval (weeks)</Label>
                                    <Input
                                        type="text" min={1} value={form.intervalWeeks}
                                        onChange={(e) => setForm(f => ({ ...f, intervalWeeks: e.target.value }))}
                                    />
                                </div>
                            )}
                        </div>

                        {form.recurrenceKind !== "none" && (
                            <div className="flex flex-col gap-1">
                                <Label className="text-sm">Days of week</Label>
                                <div className="flex flex-wrap gap-2">
                                    {weekdayName.map((name, idx) => {
                                        const active = form.daysOfWeek.has(idx as Weekday);
                                        return (
                                            <Button
                                                key={name}
                                                type="button"
                                                variant={active ? "default" : "outline"}
                                                className="px-3 py-1.5 rounded-full"
                                                onClick={() => {
                                                    setForm(f => {
                                                        const s = new Set(f.daysOfWeek);
                                                        active ? s.delete(idx as Weekday) : s.add(idx as Weekday);
                                                        return { ...f, daysOfWeek: s };
                                                    });
                                                }}
                                            >
                                                {name}
                                            </Button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        <div className="flex flex-col gap-2">
                            <Label className="text-sm">Assign to</Label>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {members.map(m => {
                                    const checked = form.memberIds.has(m.id);
                                    return (
                                        <label key={m.id} className="flex items-center gap-2 border rounded-lg p-2 cursor-pointer">
                                            <Checkbox checked={checked} onCheckedChange={(v) => {
                                                setForm(f => {
                                                    const s = new Set(f.memberIds);
                                                    v ? s.add(m.id) : s.delete(m.id);
                                                    return { ...f, memberIds: s };
                                                });
                                            }} />
                                            <span className="inline-flex items-center gap-2">
                                                <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: m.color }} />
                                                <span className="text-sm">{m.name}</span>
                                            </span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="flex flex-col gap-1">
                                <Label className="text-sm">Cost per session (£)</Label>
                                <Input
                                    type="text" inputMode="text"
                                    value={form.costPerSession}
                                    onChange={(e) => setForm(f => ({ ...f, costPerSession: e.target.value }))}
                                    placeholder="0.00"
                                />
                            </div>
                            <div className="flex flex-col gap-1">
                                <Label className="text-sm">Notes (optional)</Label>
                                <Input value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. bring kit" />
                            </div>
                        </div>

                        <div className="text-xs opacity-80 p-2 rounded border bg-[var(--card-bg)]">
                            <div><strong>Sessions (range):</strong> {formPreview.occurrencesRange} • <strong>Total:</strong> £{formPreview.totalCostRange.toFixed(2)}</div>
                            <div><strong>Sessions (this month):</strong> {formPreview.occurrencesThisMonth} • <strong>Total:</strong> £{formPreview.totalCostThisMonth.toFixed(2)}</div>
                        </div>
                    </div>

                    <DialogFooter className="mt-3 flex items-center justify-between">
                        {editing && (
                            <Button variant="outline" className="text-red-600" onClick={deleteActivity}>
                                <Trash2 className="mr-1 h-4 w-4" /> Delete
                            </Button>
                        )}
                        <div className="ml-auto flex gap-2">
                            <Button variant="outline" onClick={closeModal}>Cancel</Button>
                            <Button onClick={saveActivity}>{editing ? "Save changes" : "Save activity"}</Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}


function MemberCard({
    member, onChange, onRemove,
}: { member: Member; onChange: (patch: Partial<Member>) => void; onRemove?: () => void }) {
    return (
        <div className="p-3 border rounded-2xl h-full">
            <div className="inline-flex items-center gap-2 pb-4">
                <span
                    className="inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-xs"
                    style={{ backgroundColor: member.color }}
                >
                    {member.shortLabel || (member.role === "parent" ? "P" : "C")}
                </span>
                <Input
                    className="w-56"
                    value={member.name}
                    onChange={(e) => onChange({ name: e.target.value })}
                    placeholder="Name"
                />
            </div>
            <div className="flex flex-wrap items-end gap-3 justify-between">


                <div className="flex items-end gap-3">
                    <div className="flex flex-col gap-1">
                        <Label className="text-sm">Label</Label>
                        <Input
                            className="w-24"
                            value={member.shortLabel}
                            onChange={(e) => onChange({ shortLabel: e.target.value.slice(0, 2).toUpperCase() })}
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <Label className="text-sm">Colour</Label>
                        <Input
                            className="w-24"
                            type="color"
                            value={member.color}
                            onChange={(e) => onChange({ color: e.target.value })}
                        />
                    </div>

                    {onRemove && (
                        <Button variant="outline" className="text-red-600" onClick={onRemove}>
                            Remove
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}


function MemberRow({
    member, onChange, onRemove,
}: { member: Member; onChange: (patch: Partial<Member>) => void; onRemove: () => void }) {
    return (
        <div className="flex flex-wrap items-end gap-3">
            <div className="inline-flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-xs" style={{ backgroundColor: member.color }}>
                    {member.shortLabel || "C"}
                </span>
                <Input className="w-56" value={member.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="Child name" />
            </div>
            <div className="flex flex-col gap-1">
                <Label className="text-sm">Label</Label>
                <Input className="w-24" value={member.shortLabel} onChange={(e) => onChange({ shortLabel: e.target.value.slice(0, 2).toUpperCase() })} placeholder="C1" />
            </div>
            <div className="flex flex-col gap-1">
                <Label className="text-sm">Colour</Label>
                <Input className="w-24" type="color" value={member.color} onChange={(e) => onChange({ color: e.target.value })} />
            </div>
            <Button variant="outline" className="ml-auto" onClick={onRemove}>Remove</Button>
        </div>
    );
}

function MonthPicker({ anchor, onChange }: { anchor: Date; onChange: (d: Date) => void }) {
    const [y, setY] = React.useState(anchor.getFullYear());
    const [m, setM] = React.useState(anchor.getMonth());
    useEffect(() => { setY(anchor.getFullYear()); setM(anchor.getMonth()); }, [anchor]);

    return (
        <div className="flex items-center gap-2">
            <Select value={String(m)} onValueChange={(v) => setM(parseInt(v, 10))}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                    {Array.from({ length: 12 }).map((_, i) => (
                        <SelectItem key={i} value={String(i)}>
                            {new Date(2000, i, 1).toLocaleString("default", { month: "long" })}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <Input
                className="w-24" type="text" inputMode="numeric" value={y}
                onChange={(e) => { const v = parseInt(e.target.value, 10); if (!Number.isNaN(v)) setY(v); }}
                onFocus={(e) => e.currentTarget.select()} onMouseUp={(e) => e.preventDefault()}
            />
            <Button variant="outline" onClick={() => onChange(new Date(y, m, 1))}>Go</Button>
        </div>
    );
}

function ActivityChip({
    activity, members, onClick,
}: {
    activity: Activity;
    members: Member[];
    onClick?: () => void;
}) {
    const primary = members.find(m => m.id === activity.memberIds[0]);
    const extra = activity.memberIds.length - 1;

    const interactive = !!onClick;

    const handleClick: React.MouseEventHandler<HTMLSpanElement> = (e) => {
        if (!interactive) return;
        e.stopPropagation();
        onClick?.();
    };
    const handleKey: React.KeyboardEventHandler<HTMLSpanElement> = (e) => {
        if (!interactive) return;
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            onClick?.();
        }
    };

    return (
        <span
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onClick={handleClick}
            onKeyDown={handleKey}
            role={interactive ? "button" : undefined}
            tabIndex={interactive ? 0 : undefined}
            className={`inline-flex items-center gap-1 px-1.5 h-5 rounded-[6px] text-[11px] font-medium text-white
        ${interactive ? "cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1" : ""}`}
            style={{ backgroundColor: primary?.color || "#64748b" }}
            title={`${activity.name} • £${activity.costPerSession.toFixed(2)}/session`}
        >
            {activity.name}
            {extra > 0 && <span className="bg-white/30 rounded px-1">+{extra}</span>}
            {interactive && <Pencil className="ml-1 h-3 w-3 opacity-80" />}
        </span>
    );
}


function MobileMonthList({
    days,
    members,
    activitiesByDate,
    onDayTap,
    onChipTap,
}: {
    days: Date[];
    members: Member[];
    activitiesByDate: Map<string, Activity[]>;
    onDayTap: (id: string) => void;
    onChipTap: (a: Activity) => void;
}) {
    return (
        <div className="space-y-2">
            <div className="rounded-xl overflow-hidden border divide-y">
                {days.map((d) => {
                    const id = ymd(d);
                    const acts = activitiesByDate.get(id) || [];
                    return (
                        <div key={id} className="text-left w-full">
                            <button
                                type="button"
                                onClick={() => onDayTap(id)}
                                className="w-full flex items-start gap-3 p-3 bg-white hover:bg-[var(--card-bg)]/60"
                            >
                                <div className="flex flex-col items-center min-w-[48px]">
                                    <div className="text-xs opacity-70">{weekdayName[d.getDay()]}</div>
                                    <div className="text-lg font-semibold">{d.getDate()}</div>
                                </div>
                                <div className="flex-1">
                                    <div className="flex flex-wrap gap-1">
                                        {acts.slice(0, 3).map(a => (
                                            <ActivityChip
                                                key={a.id}
                                                activity={a}
                                                members={members}
                                                onClick={() => onChipTap(a)}
                                            />
                                        ))}
                                        {acts.length > 3 && (
                                            <span className="text-[11px] opacity-70">+{acts.length - 3} more</span>
                                        )}
                                    </div>
                                </div>
                            </button>
                        </div>
                    );
                })}
            </div>
            <div className="text-xs opacity-70">
                Tap a day to add an activity • Drag-select on desktop to add a range • Tap a chip to edit
            </div>
        </div>
    );
}

