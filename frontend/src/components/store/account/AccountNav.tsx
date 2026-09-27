"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "../providers/SessionProvider";
import styles from "./AccountNav.module.css";

const LINKS = [
  { href: "/account", label: "Overview" },
  { href: "/account/orders", label: "Orders" },
  { href: "/account/returns", label: "Returns" },
  { href: "/account/addresses", label: "Addresses" },
  { href: "/account/wishlist", label: "Wishlist" },
];

export function AccountNav() {
  const pathname = usePathname();
  const { signOut } = useSession();
  return (
    <nav aria-label="Account" className={styles.nav}>
      <ul>
        {LINKS.map((l) => {
          const active = l.href === "/account" ? pathname === l.href : pathname.startsWith(l.href);
          return (
            <li key={l.href}>
              <Link href={l.href} aria-current={active ? "page" : undefined}>
                {l.label}
              </Link>
            </li>
          );
        })}
        <li>
          <button type="button" onClick={() => void signOut()}>
            Sign out
          </button>
        </li>
      </ul>
    </nav>
  );
}
