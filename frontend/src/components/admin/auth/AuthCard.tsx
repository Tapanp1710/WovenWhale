import type { ReactNode } from "react";
import styles from "./AuthCard.module.css";

/** The framed card used by every admin sign-in step. */
export function AuthCard({ title, lede, children }: { title: string; lede: ReactNode; children: ReactNode }) {
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <div className={styles.brand}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/favicon.svg" alt="" width={40} height={40} />
          <div>
            <p className={styles.wordmark}>WovenWhale</p>
            <p className={styles.sub}>Operations console</p>
          </div>
        </div>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.lede}>{lede}</p>
        {children}
      </div>
    </main>
  );
}
