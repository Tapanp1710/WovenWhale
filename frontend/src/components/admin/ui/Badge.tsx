import type { ReactNode } from "react";
import type { Tone } from "../labels";
import styles from "./Badge.module.css";

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`${styles.badge} ${styles[tone]}`}>{children}</span>;
}
