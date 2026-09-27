"use client";

import type { ButtonHTMLAttributes } from "react";
import styles from "./Switch.module.css";

/** Compact on/off control (role="switch"). The label is required for screen readers. */
export function Switch({
  checked,
  label,
  showLabel,
  ...rest
}: { checked: boolean; label: string; showLabel?: boolean } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "role">) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={showLabel ? undefined : label}
      className={styles.switch}
      {...rest}
    >
      <span className={styles.track} aria-hidden="true">
        <span className={styles.thumb} />
      </span>
      {showLabel && <span className={styles.label}>{label}</span>}
    </button>
  );
}
