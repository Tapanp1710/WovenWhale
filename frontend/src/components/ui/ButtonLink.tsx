import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import styles from "./Button.module.css";

type Props = ComponentProps<typeof Link> & {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
  icon?: ReactNode;
};

/** A navigation link styled as a button (never a <button> nested in an <a>). */
export function ButtonLink({ variant = "primary", size = "md", fullWidth, icon, className, children, ...rest }: Props) {
  const classes = [styles.button, styles[variant], styles[size], fullWidth && styles.full, className].filter(Boolean).join(" ");
  return (
    <Link className={classes} {...rest}>
      <span className={styles.content}>
        {icon}
        {children}
      </span>
    </Link>
  );
}
