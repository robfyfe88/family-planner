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

type Point = { month: string; income: number; expenses: number; savings: number };

export default function BudgetTrendChart({ data }: { data: Point[] }) {
  return (
    <div className="h-56 sm:h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" tick={{ fontSize: 8 }} />
          <YAxis tickFormatter={(v) => `£${v.toLocaleString()}`} width={40} tick={{fontSize: 10}} />
          <Tooltip
            formatter={(v: number) => [`£${v.toLocaleString()}`, ""]}
            labelFormatter={(l) => l}
          />
          <Legend />
          <Line type="monotone" dataKey="income" stroke="#2563eb" name="Income" dot={true} />
          <Line type="monotone" dataKey="expenses" stroke="#ef4444" name="Expenses" dot={true} />
          <Line type="monotone" dataKey="savings" stroke="#059669" name="Savings" dot={true} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
