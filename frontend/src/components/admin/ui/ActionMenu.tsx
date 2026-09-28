"use client";

import { MoreVertical } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import styles from "./ActionMenu.module.css";

export interface MenuItem {
  label: string;
  onSelect: () => void;
  tone?: "danger";
  hidden?: boolean;
}

/**
 * "⋮" row menu. A real button that opens a list of real buttons; closes on
 * Escape, outside click or selection, and returns focus to the trigger.
 */
export function ActionMenu({ label, items, icon }: { label: string; items: MenuItem[]; icon?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const visible = items.filter((i) => !i.hidden);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    wrap.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!visible.length) return null;
  return (
    <div className={styles.wrap} ref={wrap}>
      <button
        ref={trigger}
        type="button"
        className={styles.trigger}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        {icon ?? <MoreVertical size={17} aria-hidden="true" />}
      </button>
      {open && (
        <div id={id} role="menu" className={styles.menu}>
          {visible.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={item.tone === "danger" ? `${styles.item} ${styles.danger}` : styles.item}
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
