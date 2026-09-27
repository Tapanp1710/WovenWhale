"use client";

import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART, formatValue, type ChartColor, type ValueFormat } from "./format";

/** Horizontal bars for ranked magnitudes (categories, products, statuses, funnel stages). */
export function BarList({
  data,
  format,
  color = "primary",
  name,
  labelWidth = 150,
}: {
  data: { label: string; value: number }[];
  format: ValueFormat;
  color?: ChartColor;
  name: string;
  labelWidth?: number;
}) {
  const height = Math.max(120, data.length * 34 + 24);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 56, bottom: 0, left: 0 }} barCategoryGap={8}>
        <CartesianGrid stroke={CHART.grid} horizontal={false} />
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="label"
          width={labelWidth}
          tickLine={false}
          axisLine={false}
          interval={0}
          tickFormatter={(v: string) => (v.length > 22 ? `${v.slice(0, 21)}…` : v)}
        />
        <Tooltip cursor={{ fill: "var(--indigo-50)" }} formatter={(v) => [formatValue(format, Number(v)), name]} />
        <Bar dataKey="value" name={name} fill={CHART[color]} radius={[0, 4, 4, 0]} maxBarSize={18} animationDuration={400}>
          <LabelList
            dataKey="value"
            position="right"
            fill="var(--slate-700)"
            formatter={(v: unknown) => formatValue(format, Number(v), true)}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
