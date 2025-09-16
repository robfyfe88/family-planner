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

// === server actions ===
import {
  listMembersForHousehold,
  listPlannerActivities,
  upsertPlannerActivity,
  deletePlannerActivity,
  type ActivityDTO,
} from "../app/activities/actions";

// -------- Types --------
type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

interface Member {
  id: string;
  role: "parent" | "child" | "caregiver";
  slot?: "p1" | "p2";
  name: string;
  shortLabel: string | null;
  color: string | null;
}

type ActivityType = "Sports" | "Clubs" | "Lessons" | "Appointments" | "Event" | "Other";
type RecurrenceKind = "none" | "weekly" | "biweekly" | "every_n_weeks";
type FeeModel = "per_session" | "monthly" | "one_off" | "total_range";
type Allocation = "evenly" | "upfront";

interface Recurrence {
  kind: RecurrenceKind;
  daysOfWeek: Weekday[];
  intervalWeeks?: number;
}

interface Activity {
  id: string;
  type: ActivityType ;
  name: string;
  memberIds: string[];
  startDate: string;        // "YYYY-MM-DD"
  endDate?: string | null;  // optional for open-ended
  recurrence: Recurrence;
  feeModel: FeeModel;
  amount: number;           // interpreted by feeModel
  allocation?: Allocation;  // when feeModel === "total_range"
  notes?: string;
}

// -------- Helpers --------
const weekdayName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parseDate(s?: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  // normalise to local date-only
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
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
function overlapsMonth(aLo: Date, aHi: Date, mLo: Date, mHi: Date) {
  return !(aHi < mLo || aLo > mHi);
}
function monthsBetweenInclusive(a: Date, b: Date) {
  const y1 = a.getFullYear(), m1 = a.getMonth();
  const y2 = b.getFullYear(), m2 = b.getMonth();
  return (y2 - y1) * 12 + (m2 - m1) + 1;
}

// --- recurrence math (client-side preview + chips only; server still owns budget math) ---
function expandActivityDates(a: Activity, windowLo: Date, windowHi: Date): string[] {
  const s0 = parseDate(a.startDate)!;
  const e0 = parseDate(a.endDate ?? undefined) ?? windowHi; // open-ended -> clamp by window
  const { lo, hi } = clampRange(s0, e0);
  if (hi < windowLo || lo > windowHi) return [];

  const res: string[] = [];
  const pushIfInWindow = (d: Date) => { if (d >= windowLo && d <= windowHi) res.push(ymd(d)); };

  const addWeeklyLike = (intervalWeeks: number) => {
    const anchorWeekStart = addDays(s0, -s0.getDay());
    for (let weekStart = new Date(anchorWeekStart); weekStart <= hi; weekStart = addDays(weekStart, 7 * intervalWeeks)) {
      for (const wd of a.recurrence.daysOfWeek) {
        const occ = addDays(weekStart, wd);
        if (occ >= lo && occ <= hi) pushIfInWindow(occ);
      }
    }
  };

  switch (a.recurrence.kind) {
    case "none":
      // one-off on the start date only
      pushIfInWindow(s0);
      break;
    case "weekly":
      addWeeklyLike(1);
      break;
    case "biweekly":
      addWeeklyLike(2);
      break;
    case "every_n_weeks":
      addWeeklyLike(Math.max(1, a.recurrence.intervalWeeks || 1));
      break;
  }
  return res;
}
function countOccurrences(a: Activity, lo: Date, hi: Date) {
  return expandActivityDates(a, lo, hi).length;
}

// Cost for a given activity in a given month (mirrors server-side logic)
function costForMonth(a: Activity, monthLo: Date, monthHi: Date) {
  const s0 = parseDate(a.startDate)!;
  const e0 = parseDate(a.endDate ?? undefined) ?? monthHi;

  switch (a.feeModel) {
    case "per_session": {
      const n = countOccurrences(a, monthLo, monthHi);
      return n * (a.amount || 0);
    }
    case "monthly": {
      return overlapsMonth(s0, e0, monthLo, monthHi) ? (a.amount || 0) : 0;
    }
    case "one_off": {
      return (s0 >= monthLo && s0 <= monthHi) ? (a.amount || 0) : 0;
    }
    case "total_range": {
      if (!a.endDate) {
        // open-ended total -> treat as upfront in start month
        return (s0 >= monthLo && s0 <= monthHi) ? (a.amount || 0) : 0;
      }
      if (!overlapsMonth(s0, e0, monthLo, monthHi)) return 0;
      if (a.allocation === "upfront") {
        return (s0 >= monthLo && s0 <= monthHi) ? (a.amount || 0) : 0;
      }
      const months = Math.max(1, monthsBetweenInclusive(
        new Date(s0.getFullYear(), s0.getMonth(), 1),
        new Date(e0.getFullYear(), e0.getMonth(), 1)
      ));
      return (a.amount || 0) / months;
    }
  }
}

// -------- Component --------
export default function ActivitiesPlanner() {
  // --- server data ---
  const [members, setMembers] = useState<Member[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- calendar state ---
  const [anchorISO, setAnchorISO] = useState<string>(new Date().toISOString());
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

  // --- drag to create ---
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

  // --- modal + form state ---
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = activities.find((a) => a.id === editingId) || null;

  type FormState = {
    type: ActivityType;
    name: string;
    startDate: string;
    endDate: string; // allow empty "" for open-ended
    memberIds: Set<string>;
    recurrenceKind: RecurrenceKind;
    daysOfWeek: Set<Weekday>;
    intervalWeeks: string;
    feeModel: FeeModel;
    amount: string;
    allocation?: Allocation;
    notes: string;
  };

  const emptyForm = (): FormState => ({
    type: "Sports",
    name: "",
    startDate: ymd(monthLo),
    endDate: "", // blank = open-ended
    memberIds: new Set(),
    recurrenceKind: "none",
    daysOfWeek: new Set<Weekday>([]),
    intervalWeeks: "3",
    feeModel: "per_session",
    amount: "",
    allocation: "evenly",
    notes: "",
  });

  const [form, setForm] = useState<FormState>(emptyForm());

  // --- load server data ---
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const [mm, acts] = await Promise.all([
          listMembersForHousehold(),
          listPlannerActivities(),
        ]);
        if (!mounted) return;

        const mappedMembers: Member[] = mm.map((m: any) => ({
          id: m.id,
          role: m.role as Member["role"],
          slot: undefined,
          name: m.name,
          shortLabel: m.shortLabel ?? null,
          color: m.color ?? null,
        }));
        setMembers(mappedMembers);

        const mappedActivities: Activity[] = acts.map(mapDtoToActivity);
        setActivities(mappedActivities);
      } catch (e: any) {
        setError(e?.message || "Failed to load activities");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // --- mapping helpers (DTO <-> Activity) ---
  function cleanISODateOnly(s?: string | null): string | undefined {
    if (!s) return undefined;
    // ensure YYYY-MM-DD
    return s.length >= 10 ? s.slice(0, 10) : s;
  }

  function mapDtoToActivity(a: ActivityDTO): Activity {
    const start = cleanISODateOnly((a as any).startDate) ?? ymd(new Date());
    const end = cleanISODateOnly((a as any).endDate) ?? undefined;

    // Fall back to legacy costPerSession when new fields missing
    const feeModel = ((a as any).feeModel ?? "per_session") as FeeModel;
    const amountNum = Number((a as any).amount ?? (a as any).costPerSession ?? 0);
    const allocation = ((a as any).allocation ?? undefined) as Allocation | undefined;

    return {
      id: a.id,
      type: a.type as ActivityType,
      name: a.name,
      memberIds: a.memberIds,
      startDate: start,
      endDate: end,
      recurrence: {
        kind: a.recurrence.kind as RecurrenceKind,
        daysOfWeek: a.recurrence.daysOfWeek as Weekday[],
        intervalWeeks: a.recurrence.intervalWeeks,
      },
      feeModel,
      amount: amountNum,
      allocation,
      notes: a.notes ?? undefined,
    };
  }

function toUpsertPayload(a: Activity) {
  return {
    id: a.id?.startsWith("tmp_") ? undefined : a.id,
    type: a.type,
    name: a.name,
    notes: a.notes,
    startDate: a.startDate,
    // 👇 force a string (fallback to startDate if open-ended)
    endDate: a.endDate ?? a.startDate,
    recurrence: {
      kind: a.recurrence.kind,
      daysOfWeek: a.recurrence.daysOfWeek,
      intervalWeeks: a.recurrence.intervalWeeks,
    },
    feeModel: a.feeModel,
    amount: a.amount,
    allocation: a.feeModel === "total_range" ? (a.allocation ?? "evenly") : null,
    // legacy field for back-compat if your API still reads it
    costPerSession: a.feeModel === "per_session" ? a.amount : 0,
    memberIds: a.memberIds,
    budgetCategory: "Kids Clubs",
    budgetLabel: a.name,
  } as const;
}


  // --- modal openers ---
  const openForCreate = (startISO: string, endISO: string) => {
    setEditingId(null);
    setForm((f) => ({
      ...emptyForm(),
      startDate: startISO,
      endDate: "", // default to open-ended unless user sets it
    }));
    setModalOpen(true);
  };

  const openForEdit = (a: Activity) => {
    setEditingId(a.id);
    setForm({
      type: a.type,
      name: a.name,
      startDate: a.startDate,
      endDate: a.endDate ?? "",
      memberIds: new Set(a.memberIds),
      recurrenceKind: a.recurrence.kind,
      daysOfWeek: new Set(a.recurrence.daysOfWeek),
      intervalWeeks: String(a.recurrence.intervalWeeks ?? 3),
      feeModel: a.feeModel,
      amount: String(a.amount ?? 0),
      allocation: a.allocation ?? "evenly",
      notes: a.notes || "",
    });
    setModalOpen(true);
  };

  const closeModal = () => setModalOpen(false);

  // --- drag handlers ---
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

  // --- derived calendar data ---
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
    return activities.reduce((sum, a) => sum + costForMonth(a, monthLo, monthHi), 0);
  }, [activities, monthLo, monthHi]);

  const breakdownByMember = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of members) map.set(m.id, 0);
    for (const a of activities) {
      const total = costForMonth(a, monthLo, monthHi);
      if (total === 0 || a.memberIds.length === 0) continue;
      const share = total / a.memberIds.length;
      for (const mid of a.memberIds) {
        map.set(mid, (map.get(mid) || 0) + share);
      }
    }
    return map;
  }, [activities, members, monthLo, monthHi]);

  // --- save/delete with optimistic update ---
  const saveActivity = async () => {
    if (!form.name.trim()) return;
    if (form.memberIds.size === 0) return;

    const recurrence: Recurrence = {
      kind: form.recurrenceKind,
      daysOfWeek: Array.from(form.daysOfWeek),
      intervalWeeks: form.recurrenceKind === "every_n_weeks"
        ? Math.max(1, parseInt(form.intervalWeeks || "1", 10))
        : undefined,
    };

    const base: Activity = {
      id: editing ? editing.id : `tmp_${Math.random().toString(36).slice(2)}`,
      type: form.type,
      name: form.name.trim(),
      memberIds: Array.from(form.memberIds),
      startDate: form.startDate,
      endDate: form.endDate || undefined,
      recurrence,
      feeModel: form.feeModel,
      amount: parseFloat(form.amount || "0") || 0,
      allocation: form.feeModel === "total_range" ? (form.allocation ?? "evenly") : undefined,
      notes: form.notes?.trim() || undefined,
    };

    setSaving(true);
    setError(null);
    // optimistic
    setActivities((prev) => (editing ? prev.map((a) => (a.id === editing.id ? base : a)) : [...prev, base]));
    setModalOpen(false);

    try {
      const res = await upsertPlannerActivity(toUpsertPayload(base));
      if (!editing) {
        setActivities((prev) => prev.map((a) => (a.id === base.id ? { ...a, id: (res as any).id } : a)));
      }
    } catch (e: any) {
      setError(e?.message || "Failed to save activity");
      // rollback (simple refetch)
      try {
        const acts = await listPlannerActivities();
        setActivities(acts.map(mapDtoToActivity));
      } catch { /* ignore */ }
    } finally {
      setSaving(false);
    }
  };

  const removeActivity = async () => {
    if (!editing) return;
    const targetId = editing.id;

    // optimistic
    setActivities((prev) => prev.filter((a) => a.id !== targetId));
    setModalOpen(false);
    setSaving(true);
    setError(null);
    try {
      await deletePlannerActivity(targetId);
    } catch (e: any) {
      setError(e?.message || "Failed to delete activity");
      // rollback
      try {
        const acts = await listPlannerActivities();
        setActivities(acts.map(mapDtoToActivity));
      } catch { /* ignore */ }
    } finally {
      setSaving(false);
    }
  };

  // --- UI ---
  return (
    <div className="space-y-6">
      <h2 className="text-xl sm:text-2xl font-semibold">Activities Planner</h2>

      {error && (
        <div className="p-3 border rounded-lg text-red-600 bg-red-50">{error}</div>
      )}

      <section className="card space-y-4">
        <div className="flex flex-wrap items-end gap-3 justify-between">
          <div className="text-sm opacity-80">
            Assign members, schedule activities, choose a cost type, and we’ll roll it into your budget each month.
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setForm(emptyForm())} disabled={loading || saving}>
              <BrushCleaning className="mr-1 h-4 w-4" />
              Reset form
            </Button>
            <Button size="sm" onClick={() => openForCreate(ymd(monthLo), ymd(monthLo))} disabled={loading || saving}>
              <CalendarPlus className="mr-1 h-4 w-4" />
              New activity
            </Button>
          </div>
        </div>

        {/* Members list (display-only) */}
        <div className="space-y-2">
          <div className="text-sm font-medium">Family & caregivers</div>
          <div className="flex flex-col gap-2">
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-3">
                <span
                  className="inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-xs"
                  style={{ backgroundColor: m.color || "#64748b" }}
                >
                  {(m.shortLabel || m.name?.slice(0, 2) || "").toUpperCase()}
                </span>
                <div className="text-sm">
                  {m.name} <span className="opacity-60">({m.role})</span>
                </div>
              </div>
            ))}
            {members.length === 0 && (
              <div className="text-sm opacity-70">No members yet.</div>
            )}
          </div>
        </div>
      </section>

      <section className="card">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1))} disabled={loading}>
              ←
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1))} disabled={loading}>
              →
            </Button>
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
            {weekdayName.map((w) => (
              <div key={w} className="px-2 py-1">{w}</div>
            ))}
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
          {members.map((m) => (
            <span key={m.id} className="inline-flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: m.color || "#64748b" }} />
              {(m.shortLabel || m.name?.slice(0, 2) || "").toUpperCase()}
            </span>
          ))}
          <span className="ml-auto font-medium">
            Sessions: {sessionsThisMonth} • Month total: £{monthCostTotal.toFixed(2)}
          </span>
        </div>

        <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
          {members.map((m) => {
            const v = breakdownByMember.get(m.id) || 0;
            return (
              <div key={m.id} className="p-2 border rounded-lg bg-[var(--card-bg)] flex items-center justify-between">
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: m.color || "#64748b" }} />
                  {m.name}
                </span>
                <span className="font-medium">£{v.toFixed(2)}</span>
              </div>
            );
          })}
        </div>
      </section>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit activity" : "Add activity"}</DialogTitle>
            <DialogDescription className="text-sm leading-snug text-[var(--muted-foreground)] ">
              Assign members, set dates and recurrence. Pick how the cost should behave (per session, monthly, one-off, or total across a date range).
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Label className="text-sm">Activity type</Label>
                <Select value={form.type} onValueChange={(v: ActivityType) => setForm(f => ({ ...f, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent position="popper" side="bottom" align="start" className="z-[1001]">
                    {["Sports", "Clubs", "Lessons", "Appointments", "Event", "Other"].map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1">
                <Label className="text-sm">Activity name</Label>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Swimming club" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Label className="text-sm">Start date</Label>
                <Input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-sm">End date (optional)</Label>
                <Input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                />
                <p className="text-[11px] opacity-70 mt-1">
                  {form.recurrenceKind === "none"
                    ? "No recurrence: this is a one-off on the start date."
                    : (form.endDate ? "Recurring until the end date." : "Recurring with no end date (open-ended).")}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Label className="text-sm">Recurrence</Label>
                <Select value={form.recurrenceKind} onValueChange={(v: RecurrenceKind) => setForm(f => ({ ...f, recurrenceKind: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent position="popper" side="bottom" align="start" className="z-[1001]">
                    <SelectItem value="none">None</SelectItem>
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
                    type="text"
                    min={1}
                    value={form.intervalWeeks}
                    onChange={(e) => setForm((f) => ({ ...f, intervalWeeks: e.target.value }))}
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
                          setForm((f) => {
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
                {members.map((m) => {
                  const checked = form.memberIds.has(m.id);
                  return (
                    <label key={m.id} className="flex items-center gap-2 border rounded-lg p-2 cursor-pointer">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => {
                          setForm((f) => {
                            const s = new Set(f.memberIds);
                            v ? s.add(m.id) : s.delete(m.id);
                            return { ...f, memberIds: s };
                          });
                        }}
                      />
                      <span className="inline-flex items-center gap-2">
                        <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: m.color || "#64748b" }} />
                        <span className="text-sm">
                          {m.name} <span className="opacity-60">({m.role})</span>
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Fee model + amount */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Label className="text-sm">Cost type</Label>
                <Select value={form.feeModel} onValueChange={(v: FeeModel) => setForm((f) => ({ ...f, feeModel: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent position="popper" side="bottom" align="start" className="z-[1001]">
                    <SelectItem value="per_session">Per session</SelectItem>
                    <SelectItem value="monthly">Monthly fee</SelectItem>
                    <SelectItem value="one_off">One-off</SelectItem>
                    <SelectItem value="total_range">Fixed total for date range</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {form.feeModel === "total_range" && (
                <div className="flex flex-col gap-1">
                  <Label className="text-sm">Allocation</Label>
                  <Select
                    value={form.allocation ?? "evenly"}
                    onValueChange={(v: Allocation) => setForm((f) => ({ ...f, allocation: v }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent position="popper" side="bottom" align="start" className="z-[1001]">
                      <SelectItem value="evenly">Spread evenly across months</SelectItem>
                      <SelectItem value="upfront">Charge upfront in start month</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Label className="text-sm">
                  {form.feeModel === "per_session" ? "Amount per session (£)" :
                    form.feeModel === "monthly" ? "Monthly amount (£)" :
                    form.feeModel === "one_off" ? "One-off amount (£)" :
                    "Total amount for range (£)"}
                </Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder="0.00"
                />
              </div>

              <div className="flex flex-col gap-1">
                <Label className="text-sm">Notes (optional)</Label>
                <Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="e.g. bring kit" />
              </div>
            </div>

            {/* Preview */}
            <FormPreview form={form} monthLo={monthLo} monthHi={monthHi} />
          </div>

          <DialogFooter className="mt-3 flex items-center justify-between">
            {editing && (
              <Button variant="outline" className="text-red-600" onClick={removeActivity} disabled={saving}>
                <Trash2 className="mr-1 h-4 w-4" /> Delete
              </Button>
            )}
            <div className="ml-auto flex gap-2">
              <Button variant="outline" onClick={closeModal} disabled={saving}>Cancel</Button>
              <Button onClick={saveActivity} disabled={saving}>{editing ? "Save changes" : "Save activity"}</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// --- Preview box ---
function FormPreview({
  form,
  monthLo,
  monthHi,
}: {
  form: {
    type: ActivityType;
    name: string;
    startDate: string;
    endDate: string;
    memberIds: Set<string>;
    recurrenceKind: RecurrenceKind;
    daysOfWeek: Set<Weekday>;
    intervalWeeks: string;
    feeModel: FeeModel;
    amount: string;
    allocation?: Allocation;
    notes: string;
  };
  monthLo: Date;
  monthHi: Date;
}) {
  const fake: Activity = {
    id: "preview",
    type: form.type,
    name: form.name || "(activity)",
    memberIds: Array.from(form.memberIds),
    startDate: form.startDate,
    endDate: form.endDate || undefined,
    recurrence: {
      kind: form.recurrenceKind,
      daysOfWeek: Array.from(form.daysOfWeek),
      intervalWeeks: form.recurrenceKind === "every_n_weeks"
        ? Math.max(1, parseInt(form.intervalWeeks || "1", 10))
        : undefined,
    },
    feeModel: form.feeModel,
    amount: parseFloat(form.amount || "0") || 0,
    allocation: form.feeModel === "total_range" ? (form.allocation ?? "evenly") : undefined,
    notes: form.notes || "",
  };

  const s = parseDate(fake.startDate)!;
  const e = parseDate(fake.endDate ?? undefined) ?? s;

  const occRange = countOccurrences(fake, s, e);
  const occMonth = countOccurrences(fake, monthLo, monthHi);
  const monthCost = costForMonth(fake, monthLo, monthHi);

  return (
    <div className="text-xs opacity-80 p-2 rounded border bg-[var(--card-bg)] space-y-0.5">
      <div>
        <strong>Sessions (range):</strong> {occRange}
        {fake.feeModel === "per_session" && <> • <strong>Total (range):</strong> £{(occRange * fake.amount).toFixed(2)}</>}
      </div>
      <div>
        <strong>Sessions (this month):</strong> {occMonth}
        {" • "}
        <strong>Month total:</strong> £{monthCost.toFixed(2)}
      </div>
    </div>
  );
}

// --- Month picker ---
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

// --- Chip ---
function ActivityChip({
  activity, members, onClick,
}: {
  activity: Activity;
  members: Member[];
  onClick?: () => void;
}) {
  const primary = members.find((m) => m.id === activity.memberIds[0]);
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

  const priceHint =
    activity.feeModel === "per_session" ? `£${activity.amount.toFixed(2)}/session` :
    activity.feeModel === "monthly" ? `£${activity.amount.toFixed(2)}/month` :
    activity.feeModel === "one_off" ? `£${activity.amount.toFixed(2)} (one-off)` :
    `£${activity.amount.toFixed(2)} total`;

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
      title={`${activity.name} • ${priceHint}`}
    >
      {activity.name}
      {extra > 0 && <span className="bg-white/30 rounded px-1">+{extra}</span>}
      {interactive && <Pencil className="ml-1 h-3 w-3 opacity-80" />}
    </span>
  );
}

// --- Mobile list ---
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
                    {acts.slice(0, 3).map((a) => (
                      <ActivityChip key={a.id} activity={a} members={members} onClick={() => onChipTap(a)} />
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
