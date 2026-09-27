"use client";

import type { AdminSessionDTO } from "@wovenwhale/backend/contracts";
import { Menu } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { AdminProvider } from "../AdminContext";
import styles from "./AdminFrame.module.css";
import { Sidebar } from "./Sidebar";

/** Fixed Loom Indigo sidebar on desktop; a top bar with a drawer on small screens. */
export function AdminFrame({ admin, codPending, children }: { admin: AdminSessionDTO; codPending: number | null; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <AdminProvider admin={admin}>
      <a href="#admin-main" className="skip-link">
        Skip to content
      </a>
      <div className={styles.frame}>
        <aside className={styles.aside}>
          <Sidebar codPending={codPending} />
        </aside>

        <header className={styles.topbar}>
          <button type="button" className={styles.menu} onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu size={20} aria-hidden="true" />
          </button>
          <Link href="/admin" className={styles.topBrand}>
            WovenWhale
          </Link>
          {codPending ? (
            <Link href="/admin/cod" className={styles.codChip}>
              {codPending} COD pending
            </Link>
          ) : null}
        </header>

        <Sheet open={open} onOpenChange={setOpen} title="Menu" side="left" width="min(300px, 88vw)">
          <div className={styles.drawer}>
            <Sidebar codPending={codPending} onNavigate={() => setOpen(false)} />
          </div>
        </Sheet>

        <main id="admin-main" className={styles.main} tabIndex={-1}>
          {children}
        </main>
      </div>
    </AdminProvider>
  );
}
