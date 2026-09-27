import Link from "next/link";
import styles from "./RangePicker.module.css";

export const RANGES = [7, 30, 90] as const;
export type RangeDays = (typeof RANGES)[number];

export const parseRange = (value: string | undefined): RangeDays => RANGES.find((r) => String(r) === value) ?? 30;

/** Date-range presets as links, so the range is shareable and back-button friendly. */
export function RangePicker({ basePath, current }: { basePath: string; current: RangeDays }) {
  return (
    <nav className={styles.picker} aria-label="Date range">
      {RANGES.map((r) => (
        <Link
          key={r}
          href={r === 30 ? basePath : `${basePath}?range=${r}`}
          aria-current={r === current ? "true" : undefined}
          className={styles.option}
        >
          {r} days
        </Link>
      ))}
    </nav>
  );
}

/** ISO bounds for the last N days, ending now. */
export function rangeQuery(days: RangeDays) {
  const to = new Date();
  const from = new Date(to.getTime() - (days - 1) * 86_400_000);
  from.setHours(0, 0, 0, 0);
  return `from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;
}
