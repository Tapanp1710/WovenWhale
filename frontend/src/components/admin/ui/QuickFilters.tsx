import Link from "next/link";
import styles from "./QuickFilters.module.css";

/** One-tap presets above a filtered list. `attention` marks a queue that needs action (haldi). */
export function QuickFilters({
  label,
  items,
}: {
  label: string;
  items: { href: string; label: string; active: boolean; attention?: boolean }[];
}) {
  return (
    <nav className={styles.chips} aria-label={label}>
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          className={i.attention && !i.active ? `${styles.chip} ${styles.attention}` : styles.chip}
          aria-current={i.active ? "true" : undefined}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
