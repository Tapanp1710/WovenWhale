"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown, Heart, Menu, Search, ShoppingBag, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { useCart } from "../providers/CartProvider";
import { useSession } from "../providers/SessionProvider";
import { SearchPanel } from "../search/SearchPanel";
import type { Navigation } from "./nav";
import styles from "./Header.module.css";

export function Header({ nav, announcement }: { nav: Navigation; announcement: string }) {
  const { itemCount, setDrawerOpen, bagIconRef } = useCart();
  const { customer } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [weavesOpen, setWeavesOpen] = useState(false);
  const pathname = usePathname();
  const reduce = useReducedMotion();
  const weavesRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    setMenuOpen(false);
    setSearchOpen(false);
    setWeavesOpen(false);
  }, [pathname]);

  // Close the desktop weaves menu on outside click or Escape.
  useEffect(() => {
    if (!weavesOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!weavesRef.current?.contains(e.target as Node)) setWeavesOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setWeavesOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [weavesOpen]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      <p className={styles.announcement}>{announcement}</p>
      <header className={styles.header}>
        <div className={styles.inner}>
          <div className={styles.left}>
            <button
              type="button"
              className={`${styles.icon} ${styles.menuButton}`}
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={22} aria-hidden="true" />
            </button>
            <nav aria-label="Main" className={styles.nav}>
              <ul>
                <li>
                  <Link href="/shop" className={styles.navLink} aria-current={pathname === "/shop" ? "page" : undefined}>
                    Shop all
                  </Link>
                </li>
                {nav.primary.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className={styles.navLink} aria-current={isActive(l.href) ? "page" : undefined}>
                      {l.label}
                    </Link>
                  </li>
                ))}
                {nav.weaves.length > 0 && (
                  <li ref={weavesRef} className={styles.dropdown}>
                    <button
                      type="button"
                      className={styles.navLink}
                      aria-expanded={weavesOpen}
                      aria-controls="weaves-menu"
                      onClick={() => setWeavesOpen((o) => !o)}
                    >
                      Weaves
                      <ChevronDown size={15} aria-hidden="true" className={styles.chevron} />
                    </button>
                    <AnimatePresence>
                      {weavesOpen && (
                        <motion.ul
                          id="weaves-menu"
                          className={styles.menu}
                          initial={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.18 }}
                        >
                          {nav.weaves.map((l) => (
                            <li key={l.href}>
                              <Link href={l.href}>{l.label}</Link>
                            </li>
                          ))}
                        </motion.ul>
                      )}
                    </AnimatePresence>
                  </li>
                )}
              </ul>
            </nav>
          </div>

          <Link href="/" className={styles.wordmark} aria-label="WovenWhale home">
            Woven Whale
          </Link>

          <div className={styles.right}>
            <button type="button" className={styles.icon} onClick={() => setSearchOpen(true)} aria-label="Search">
              <Search size={21} aria-hidden="true" />
            </button>
            <Link href="/account" className={`${styles.icon} ${styles.hideSmall}`} aria-label={customer ? "Your account" : "Sign in"}>
              <User size={21} aria-hidden="true" />
            </Link>
            <Link href="/account/wishlist" className={`${styles.icon} ${styles.hideSmall}`} aria-label="Wishlist">
              <Heart size={21} aria-hidden="true" />
            </Link>
            <a
              href="/cart"
              ref={bagIconRef}
              className={styles.icon}
              onClick={(e) => {
                e.preventDefault();
                setDrawerOpen(true);
              }}
              aria-label={`Bag, ${itemCount} item${itemCount === 1 ? "" : "s"}`}
            >
              <ShoppingBag size={21} aria-hidden="true" />
              <AnimatePresence>
                {itemCount > 0 && (
                  <motion.span
                    key={itemCount}
                    className={styles.count}
                    initial={reduce ? false : { scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.4, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 520, damping: 26 }}
                    aria-hidden="true"
                  >
                    {itemCount}
                  </motion.span>
                )}
              </AnimatePresence>
            </a>
          </div>
        </div>
      </header>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen} title="Menu" side="left" width="min(360px, 88vw)">
        <nav aria-label="Mobile" className={styles.mobileNav}>
          <ul className={styles.mobileList}>
            <li>
              <Link href="/shop">Shop all</Link>
            </li>
            {nav.primary.map((l) => (
              <li key={l.href}>
                <Link href={l.href}>{l.label}</Link>
              </li>
            ))}
          </ul>
          {nav.weaves.length > 0 && (
            <>
              <h2 className={styles.mobileHeading}>Weaves</h2>
              <ul className={styles.mobileList}>
                {nav.weaves.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href}>{l.label}</Link>
                  </li>
                ))}
              </ul>
            </>
          )}
          <ul className={styles.mobileSecondary}>
            <li>
              <Link href="/account">{customer ? "Your account" : "Sign in"}</Link>
            </li>
            <li>
              <Link href="/account/wishlist">Wishlist</Link>
            </li>
            <li>
              <Link href="/track-order">Track an order</Link>
            </li>
            <li>
              <Link href="/support">Help and support</Link>
            </li>
          </ul>
        </nav>
      </Sheet>

      <SearchPanel open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}
