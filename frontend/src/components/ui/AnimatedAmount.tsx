"use client";

import { animate, useReducedMotion } from "framer-motion";
import { useEffect, useRef } from "react";
import { formatINR } from "@/lib/format";
import styles from "./AnimatedAmount.module.css";

/** Rupee amount that counts to its new value so price changes are noticeable, not jarring. */
export function AnimatedAmount({ paise, className }: { paise: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const previous = useRef(paise);
  const reduce = useReducedMotion();

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (reduce || previous.current === paise) {
      node.textContent = formatINR(paise);
      previous.current = paise;
      return;
    }
    const controls = animate(previous.current, paise, {
      duration: 0.45,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        node.textContent = formatINR(Math.round(v / 100) * 100);
      },
      onComplete: () => {
        node.textContent = formatINR(paise);
      },
    });
    previous.current = paise;
    return () => controls.stop();
  }, [paise, reduce]);

  return (
    <span ref={ref} className={[styles.amount, className].filter(Boolean).join(" ")}>
      {formatINR(paise)}
    </span>
  );
}
