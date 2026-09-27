import { formatINR } from "@/lib/format";

export type ValueFormat = "inr" | "count" | "percent";

const compact = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });
const day = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

/** Values arrive in paise for "inr" and as a 0–1 ratio for "percent". */
export function formatValue(format: ValueFormat, value: number, short = false) {
  if (format === "inr") return short ? `₹${compact.format(value / 100)}` : formatINR(Math.round(value));
  if (format === "percent") return `${(value * 100).toFixed(1)}%`;
  return short ? compact.format(value) : value.toLocaleString("en-IN");
}

/** "2026-09-28" → "28 Sep" (the API buckets by calendar day). */
export const formatDay = (isoDate: string) => day.format(new Date(`${isoDate}T00:00:00Z`));

/** Token palette for SVG marks. */
export const CHART = {
  primary: "var(--indigo-600)",
  ink: "var(--indigo-800)",
  accent: "var(--haldi-500)",
  muted: "var(--slate-500)",
  good: "var(--success-600)",
  bad: "var(--danger-600)",
  grid: "var(--slate-100)",
  axis: "var(--slate-500)",
} as const;
export type ChartColor = keyof typeof CHART;
