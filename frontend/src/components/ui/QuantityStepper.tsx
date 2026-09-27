"use client";

import { Minus, Plus } from "lucide-react";
import styles from "./QuantityStepper.module.css";

interface Props {
  value: number;
  min?: number;
  max: number;
  onChange: (next: number) => void;
  disabled?: boolean;
  label?: string;
  size?: "sm" | "md";
}

/** Touch-friendly quantity control; the value is announced to assistive tech. */
export function QuantityStepper({ value, min = 1, max, onChange, disabled, label = "Quantity", size = "md" }: Props) {
  return (
    <div className={`${styles.stepper} ${styles[size]}`} role="group" aria-label={label}>
      <button
        type="button"
        onClick={() => onChange(value - 1)}
        disabled={disabled || value <= min}
        aria-label={`Decrease ${label.toLowerCase()}`}
      >
        <Minus size={16} aria-hidden="true" />
      </button>
      <output aria-live="polite" aria-label={`${label} ${value}`}>
        {value}
      </output>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        disabled={disabled || value >= max}
        aria-label={`Increase ${label.toLowerCase()}`}
      >
        <Plus size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
