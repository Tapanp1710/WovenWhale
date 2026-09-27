"use client";

import { AnimatePresence } from "framer-motion";
import { ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { RecentlyViewed } from "../product/RecentlyViewed";
import { useCart } from "../providers/CartProvider";
import { CartLine } from "./CartLine";
import { CartSummary } from "./CartSummary";
import styles from "./CartPageView.module.css";

export function CartPageView() {
  const { cart, itemCount } = useCart();

  if (!cart) {
    return (
      <div className={styles.page} aria-busy="true">
        <Skeleton width="220px" height="44px" />
        <div className={styles.layout}>
          <Skeleton height="180px" />
          <Skeleton height="280px" />
        </div>
      </div>
    );
  }

  if (cart.lines.length === 0) {
    return (
      <div className={styles.page}>
        <EmptyState
          icon={<ShoppingBag size={26} aria-hidden="true" />}
          title="Your bag is empty"
          action={<ButtonLink href="/shop">Browse the collection</ButtonLink>}
        >
          Pieces you add stay here, even if you leave and come back.
        </EmptyState>
        <RecentlyViewed />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>
        Your bag <span className={styles.count}>({itemCount})</span>
      </h1>
      <div className={styles.layout}>
        <ul className={styles.lines} aria-label="Items in your bag">
          <AnimatePresence initial={false}>
            {cart.lines.map((line) => (
              <CartLine key={line.id} line={line} />
            ))}
          </AnimatePresence>
        </ul>
        <aside className={styles.aside} aria-label="Bag total">
          <CartSummary cart={cart} />
          {cart.hasIssues ? (
            <Button size="lg" fullWidth disabled>
              Checkout
            </Button>
          ) : (
            <ButtonLink href="/checkout" size="lg" fullWidth>
              Checkout
            </ButtonLink>
          )}
          {cart.hasIssues && <p className={styles.issue}>Update the highlighted items to continue.</p>}
        </aside>
      </div>
    </div>
  );
}
