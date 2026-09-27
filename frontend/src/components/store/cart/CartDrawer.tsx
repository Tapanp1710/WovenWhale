"use client";

import { AnimatePresence } from "framer-motion";
import { ShoppingBag } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { EmptyState } from "@/components/ui/EmptyState";
import { Sheet } from "@/components/ui/Sheet";
import { useCart } from "../providers/CartProvider";
import { CartLine } from "./CartLine";
import { CartSummary } from "./CartSummary";
import styles from "./CartDrawer.module.css";

export function CartDrawer() {
  const { cart, drawerOpen, setDrawerOpen, itemCount } = useCart();
  const close = () => setDrawerOpen(false);
  const empty = !cart || cart.lines.length === 0;

  return (
    <Sheet
      open={drawerOpen}
      onOpenChange={setDrawerOpen}
      title={empty ? "Your bag" : `Your bag (${itemCount})`}
      footer={
        !empty && (
          <div className={styles.footer}>
            <CartSummary cart={cart} showCoupon={false} />
            {cart.hasIssues ? (
              <Button fullWidth size="lg" disabled>
                Checkout
              </Button>
            ) : (
              <ButtonLink href="/checkout" onClick={close} fullWidth size="lg">
                Checkout
              </ButtonLink>
            )}
            <Link href="/cart" onClick={close} className={styles.viewBag}>
              View bag and apply coupons
            </Link>
          </div>
        )
      }
    >
      {empty ? (
        <EmptyState
          icon={<ShoppingBag size={26} aria-hidden="true" />}
          title="Your bag is empty"
          action={
            <ButtonLink href="/shop" onClick={close} variant="secondary">
              Browse the collection
            </ButtonLink>
          }
        >
          Handwoven shirts and kurtas you add will wait here.
        </EmptyState>
      ) : (
        <ul className={styles.lines} aria-label="Items in your bag">
          <AnimatePresence initial={false}>
            {cart.lines.map((line) => (
              <CartLine key={line.id} line={line} compact onNavigate={close} />
            ))}
          </AnimatePresence>
        </ul>
      )}
    </Sheet>
  );
}
