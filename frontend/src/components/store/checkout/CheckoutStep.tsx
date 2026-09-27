"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import styles from "./CheckoutStep.module.css";

type State = "active" | "done" | "upcoming";

/** One numbered checkout step. Completed steps collapse to a summary with a "Change" action. */
export function CheckoutStep({
  number,
  title,
  state,
  summary,
  onChange,
  children,
}: {
  number: number;
  title: string;
  state: State;
  summary?: ReactNode;
  onChange?: () => void;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <section
      className={`${styles.step} ${styles[state]}`}
      aria-current={state === "active" ? "step" : undefined}
      aria-labelledby={`step-${number}`}
    >
      <header className={styles.header}>
        <span className={styles.marker} aria-hidden="true">
          {state === "done" ? <Check size={16} /> : number}
        </span>
        <h2 id={`step-${number}`} className={styles.title}>
          {title}
        </h2>
        {state === "done" && onChange && (
          <button type="button" className={styles.change} onClick={onChange} aria-label={`Change ${title.toLowerCase()}`}>
            Change
          </button>
        )}
      </header>
      {state === "done" && summary && <div className={styles.summary}>{summary}</div>}
      <AnimatePresence initial={false}>
        {state === "active" && (
          <motion.div
            className={styles.body}
            initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className={styles.inner}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
