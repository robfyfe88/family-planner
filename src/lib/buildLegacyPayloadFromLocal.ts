type ActivitiesV2Member = {
  id?: string;
  role: "parent" | "child";
  slot?: "p1" | "p2";
  name: string;
  shortLabel?: string;
  color?: string;
};

type ActivitiesV2Activity = {
  id?: string;
  name: string;
  category?: string;
  location?: string;
  schedules?: Array<{
    weekday?: number;     
    startTime?: string;     
    endTime?: string;       
    rrule?: string;
    startDate?: string;     
    endDate?: string;       
  }>;
};

type AnnualLeaveV1 = {
  closures?: string[]; 
};

type AnnualLeaveV2 = {
  closures?: string[]; 
  overrides?: Record<string, unknown>;
  caregivers?: Array<{ id: string; name: string }>;
};

function readJSON<T = any>(key: string): T | null {
  if (typeof window === "undefined") return null as any;
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

export type LocalBudget = {
  mode: "joint" | "split" | string;
  parentAName?: string;
  parentBName?: string;
  incomes: Array<{ id: string; label: string; amount: number; owner?: string }>;
  expenses: Array<{ id: string; label: string; amount: number; owner?: string }>;
  pots: Array<{ id: string; name: string }>;
  savingsYear?: Array<{ month: string; values: Record<string, number> }>;
};

function getLocalBudget(): LocalBudget | null {
  const v4 = readJSON<any>("familyBudgetPlanner:v4");
  if (v4 && (Array.isArray(v4.incomes) || Array.isArray(v4.expenses))) {
    return {
      mode: v4.mode ?? "joint",
      parentAName: v4.parentAName ?? "Parent A",
      parentBName: v4.parentBName ?? "Parent B",
      incomes: v4.incomes ?? [],
      expenses: v4.expenses ?? [],
      pots: v4.pots ?? [],
      savingsYear: v4.savingsYear ?? [],
    };
  }
  const v3 = readJSON<any>("familyBudgetPlanner:v3");
  if (v3 && (Array.isArray(v3.incomes) || Array.isArray(v3.expenses))) {
    return {
      mode: v3.mode ?? "joint",
      parentAName: v3.parentAName ?? "Parent A",
      parentBName: v3.parentBName ?? "Parent B",
      incomes: v3.incomes ?? [],
      expenses: v3.expenses ?? [],
      pots: v3.pots ?? [],
      savingsYear: v3.savingsYear ?? [],
    };
  }
  return null;
}


function getJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function buildLegacyPayloadFromLocal() {
    const budget = getLocalBudget();
  const members =
    getJSON<ActivitiesV2Member[]>("activitiesPlanner:v2:members") ?? [];

  const activities =
    getJSON<ActivitiesV2Activity[]>("activitiesPlanner:v2:activities") ?? [];

  const alV1 = getJSON<AnnualLeaveV1>("annualLeavePlanner:v1");
  const alV2 = getJSON<AnnualLeaveV2>("annualLeavePlanner:v2");

  const closuresSet = new Set<string>();
  (alV1?.closures ?? []).forEach((d) => closuresSet.add(d));
  (alV2?.closures ?? []).forEach((d) => closuresSet.add(d));
  const schoolDays = Array.from(closuresSet).map((iso) => ({
    date: iso,
    isSchoolOpen: false,
    label: "Closure",
  }));

  const payload = {
    budget,
    householdName: "Fyfe Household", 
    members: members.map((m) => ({
      name: m.name,
      role: m.role,
      shortLabel: m.shortLabel,
      color: m.color,
      slot: m.slot,
    })),
    activities: activities.map((a) => ({
      name: a.name,
      category: a.category,
      location: a.location,
      schedules: (a.schedules ?? []).map((s) => ({
        weekday: s.weekday,
        startTime: s.startTime,
        endTime: s.endTime,
        rrule: s.rrule,
        startDate: s.startDate,
        endDate: s.endDate,
      })),
    })),
    overrides: [] as Array<unknown>, 
    schoolDays,                      
    leaves: [] as Array<unknown>,  
  };

  return payload;
}
