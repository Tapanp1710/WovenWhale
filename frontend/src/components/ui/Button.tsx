import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import styles from "./Button.module.css";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "link";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
  icon?: ReactNode;
}

/** Primary action control. `loading` keeps the width stable and announces busy state. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading = false, fullWidth = false, icon, className, children, disabled, type = "button", ...rest },
  ref,
) {
  const classes = [styles.button, styles[variant], styles[size], fullWidth && styles.full, loading && styles.loading, className]
    .filter(Boolean)
    .join(" ");
  return (
    <button ref={ref} type={type} className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading && <span className={styles.spinner} aria-hidden="true" />}
      <span className={styles.content}>
        {icon}
        {children}
      </span>
    </button>
  );
});
