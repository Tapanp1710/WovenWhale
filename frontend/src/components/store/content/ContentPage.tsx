import type { ReactNode } from "react";
import styles from "./ContentPage.module.css";

/** Long-form reading layout for policies and brand pages (≈65 character measure). */
export function ContentPage({
  title,
  lede,
  updated,
  children,
  aside,
}: {
  title: string;
  lede?: ReactNode;
  updated?: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{title}</h1>
        {lede && <p className={styles.lede}>{lede}</p>}
        {updated && <p className={styles.updated}>Last updated {updated}</p>}
      </header>
      <div className={styles.layout}>
        <div className={styles.prose}>{children}</div>
        {aside && <aside className={styles.aside}>{aside}</aside>}
      </div>
    </div>
  );
}
