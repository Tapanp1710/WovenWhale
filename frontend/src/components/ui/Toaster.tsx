"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CheckCircle2, CircleAlert, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import styles from "./Toaster.module.css";

type Tone = "success" | "error" | "info";
interface Toast {
  id: number;
  tone: Tone;
  message: string;
  action?: { label: string; onClick: () => void };
}

interface ToastApi {
  success: (message: string, action?: Toast["action"]) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const ICONS = { success: CheckCircle2, error: CircleAlert, info: Info };

/** Toast stack announced through a polite live region (assertive for errors). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const reduce = useReducedMotion();

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (tone: Tone, message: string, action?: Toast["action"]) => {
      const id = nextId.current++;
      setToasts((all) => [...all.slice(-2), { id, tone, message, action }]);
      setTimeout(() => dismiss(id), tone === "error" ? 6000 : 3500);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (m, a) => push("success", m, a),
      error: (m) => push("error", m),
      info: (m) => push("info", m),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className={styles.region} aria-live="polite" aria-relevant="additions">
        <AnimatePresence initial={false}>
          {toasts.map((t) => {
            const Icon = ICONS[t.tone];
            return (
              <motion.div
                key={t.id}
                layout={!reduce}
                role={t.tone === "error" ? "alert" : "status"}
                className={`${styles.toast} ${styles[t.tone]}`}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8, transition: { duration: 0.15 } }}
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              >
                <Icon size={18} aria-hidden="true" className={styles.icon} />
                <p className={styles.message}>{t.message}</p>
                {t.action && (
                  <button
                    type="button"
                    className={styles.action}
                    onClick={() => {
                      t.action!.onClick();
                      dismiss(t.id);
                    }}
                  >
                    {t.action.label}
                  </button>
                )}
                <button type="button" className={styles.dismiss} onClick={() => dismiss(t.id)} aria-label="Dismiss notification">
                  <X size={16} aria-hidden="true" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
