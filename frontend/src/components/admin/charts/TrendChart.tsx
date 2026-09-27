"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART, formatDay, formatValue, type ChartColor, type ValueFormat } from "./format";

/** Single-series change over time (daily buckets). */
export function TrendChart({
  data,
  format,
  color = "primary",
  name,
  height = 200,
}: {
  data: { date: string; value: number }[];
  format: ValueFormat;
  color?: ChartColor;
  name: string;
  height?: number;
}) {
  const stroke = CHART[color];
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={CHART.grid} vertical={false} />
        <XAxis dataKey="date" tickFormatter={formatDay} tickLine={false} axisLine={{ stroke: CHART.grid }} minTickGap={24} tickMargin={6} />
        <YAxis
          width={52}
          tickFormatter={(v: number) => formatValue(format, v, true)}
          tickLine={false}
          axisLine={false}
          allowDecimals={format !== "count"}
        />
        <Tooltip
          cursor={{ stroke: CHART.muted, strokeDasharray: "3 3" }}
          labelFormatter={(label) => formatDay(String(label))}
          formatter={(v) => [formatValue(format, Number(v)), name]}
        />
        <Area
          type="monotone"
          dataKey="value"
          name={name}
          stroke={stroke}
          strokeWidth={2}
          fill={stroke}
          fillOpacity={0.08}
          activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--white)" }}
          animationDuration={400}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
