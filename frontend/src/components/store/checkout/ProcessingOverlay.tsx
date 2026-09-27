"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import styles from "./ProcessingOverlay.module.css";

/** Blocking state while the server verifies a payment or places an order. Announced politely. */
export function ProcessingOverlay({ message }: { message: string | null }) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          className={styles.overlay}
          role="status"
          aria-live="polite"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className={styles.card}>
            <div className={styles.threads} aria-hidden="true">
              {[0, 1, 2, 3, 4].map((i) => (
                <motion.span
                  key={i}
                  animate={reduce ? undefined : { scaleY: [0.3, 1, 0.3] }}
                  transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.12, ease: "easeInOut" }}
                />
              ))}
            </div>
            <p className={styles.message}>{message}</p>
            <p className={styles.hint}>Please keep this page open.</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
