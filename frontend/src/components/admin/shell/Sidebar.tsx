"use client";

import { LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/ui/Toaster";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { useAdmin } from "../AdminContext";
import { can, ROLE_LABELS } from "../labels";
import { NAV, type NavItem } from "./nav";
import styles from "./Sidebar.module.css";

/** Longest matching href wins, so /admin/settings/roles doesn't also light up /admin/settings. */
function activeHref(pathname: string, items: NavItem[]) {
  return items
    .filter((i) => pathname === i.href || (i.href !== "/admin" && pathname.startsWith(`${i.href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

export function Sidebar({ codPending, onNavigate }: { codPending: number | null; onNavigate?: () => void }) {
  const admin = useAdmin();
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();
  const [signingOut, setSigningOut] = useState(false);
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.perms.length || can(admin, ...i.perms)) })).filter(
    (g) => g.items.length,
  );
  const current = activeHref(
    pathname,
    groups.flatMap((g) => g.items),
  );

  async function signOut() {
    setSigningOut(true);
    try {
      await api("/admin/auth/logout", { method: "POST" });
      router.replace("/admin/login");
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
      setSigningOut(false);
    }
  }

  return (
    <div className={styles.sidebar}>
      <Link href="/admin" className={styles.brand} onClick={onNavigate}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/favicon.svg" alt="" width={28} height={28} />
        <span>
          WovenWhale <span className={styles.brandSub}>Operations</span>
        </span>
      </Link>

      <nav aria-label="Admin" className={styles.nav}>
        {groups.map((group) => (
          <div key={group.label} className={styles.group}>
            <p className={styles.groupLabel}>{group.label}</p>
            <ul>
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = item.href === current;
                return (
                  <li key={item.href}>
                    <Link href={item.href} className={styles.link} aria-current={active ? "page" : undefined} onClick={onNavigate}>
                      <Icon size={17} aria-hidden="true" />
                      <span className={styles.linkLabel}>{item.label}</span>
                      {item.badge === "cod" && codPending ? (
                        <span className={styles.badge} aria-label={`${codPending} awaiting approval`}>
                          {codPending}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className={styles.user}>
        <div className={styles.userText}>
          <p className={styles.userName}>{admin.fullName}</p>
          <p className={styles.userRole}>{ROLE_LABELS[admin.role]}</p>
        </div>
        <button type="button" className={styles.signOut} onClick={signOut} disabled={signingOut} aria-label="Sign out">
          <LogOut size={17} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
