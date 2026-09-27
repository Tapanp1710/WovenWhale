"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import styles from "./Sheet.module.css";

type Side = "right" | "left" | "bottom" | "center";

const OFFSET: Record<Side, { x?: string; y?: string; scale?: number }> = {
  right: { x: "100%" },
  left: { x: "-100%" },
  bottom: { y: "100%" },
  center: { y: "12px", scale: 0.98 },
};

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Visually hide the title (still announced to screen readers). */
  hideTitle?: boolean;
  description?: string;
  side?: Side;
  width?: string;
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * Accessible drawer / modal. Radix handles focus trapping, Escape, scroll
 * locking and ARIA; Framer Motion animates enter and exit (instant under
 * prefers-reduced-motion).
 */
export function Sheet({ open, onOpenChange, title, hideTitle, description, side = "right", width, footer, children }: SheetProps) {
  const reduce = useReducedMotion();
  const from = reduce ? { opacity: 0 } : { opacity: side === "center" ? 0 : 1, ...OFFSET[side] };
  const to = { opacity: 1, x: 0, y: 0, scale: 1 };
  const transition = reduce ? { duration: 0.01 } : { type: "tween" as const, ease: [0.22, 1, 0.36, 1] as const, duration: 0.32 };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className={styles.overlay}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount>
              <motion.div
                className={`${styles.panel} ${styles[side]}`}
                style={width ? { width } : undefined}
                initial={from}
                animate={to}
                exit={from}
                transition={transition}
              >
                <header className={styles.header}>
                  <Dialog.Title className={hideTitle ? "visually-hidden" : styles.title}>{title}</Dialog.Title>
                  <Dialog.Close className={styles.close} aria-label="Close">
                    <X size={20} aria-hidden="true" />
                  </Dialog.Close>
                </header>
                {description ? (
                  <Dialog.Description className={styles.description}>{description}</Dialog.Description>
                ) : (
                  <Dialog.Description className="visually-hidden">{title}</Dialog.Description>
                )}
                <div className={styles.body}>{children}</div>
                {footer && <footer className={styles.footer}>{footer}</footer>}
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
