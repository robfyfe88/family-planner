"use client";

import * as React from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";

type ChartPoint = { month: string } & Record<string, number>;

export type PotDef = {
  key: string;     
  name: string;      
  color?: string;  
};

export default function BudgetTrendChart({
  data,
  potDefs = [],
}: {
  data: ChartPoint[];           
  potDefs?: PotDef[];          
}) {
  const nameMap = React.useMemo(() => {
    const base: Record<string, string> = {
      income: "Income",
      expenses: "Expenses",
      savingsCum: "Savings (YTD)",
    };
    for (const p of potDefs) {
      base[p.key] = `${p.name} (YTD)`;
    }
    return base;
  }, [potDefs]);

  const palette = [
    "#0ea5e9", "#a855f7", "#f59e0b", "#ef4444", "#10b981",
    "#6366f1", "#f97316", "#14b8a6", "#84cc16", "#e11d48",
  ];
  const colorFor = (i: number, fallback?: string) => fallback ?? palette[i % palette.length];

  return (
    <div className="h-56 sm:h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" tick={{ fontSize: 10 }} />
          <YAxis
            tickFormatter={(v) => `£${Number(v).toLocaleString()}`}
            width={48}
            tick={{ fontSize: 10 }}
          />
          <Tooltip
            formatter={(val: number, key: string) => [
              `£${Number(val).toLocaleString()}`,
              nameMap[key] ?? key,
            ]}
            labelFormatter={(l) => l}
          />
          <Legend
            iconType="plainline"
            iconSize={28}
            wrapperStyle={{ fontSize: 12, paddingTop: 4 }}
            formatter={(value: string) => <span style={{ fontSize: 12 }}>{value}</span>}
          />

          <Line
            type="monotone"
            dataKey="income"
            stroke="#2563eb"
            name="Income"
            strokeWidth={2}
            dot={{ r: 2 }}
            activeDot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="expenses"
            stroke="#ef4444"
            name="Expenses"
            strokeWidth={2}
            dot={{ r: 2 }}
            activeDot={{ r: 4 }}
          />

          {potDefs.map((p, i) => (
            <Line
              key={p.key}
              type="monotone"
              dataKey={p.key}
              stroke={colorFor(i, p.color)}
              name={`${p.name} (YTD)`}
              strokeWidth={2}
              dot={{ r: 2 }}
              activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
