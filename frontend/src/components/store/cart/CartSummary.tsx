"use client";

import type { CartDTO } from "@wovenwhale/backend/contracts";
import { X } from "lucide-react";
import { useState, type CSSProperties, type FormEvent } from "react";
import { AnimatedAmount } from "@/components/ui/AnimatedAmount";
import { Button } from "@/components/ui/Button";
import { formatINR } from "@/lib/format";
import { useCart } from "../providers/CartProvider";
import styles from "./CartSummary.module.css";

/** Server-computed totals. Nothing here is calculated in the browser. */
export function CartSummary({ cart, showCoupon = true }: { cart: CartDTO; showCoupon?: boolean }) {
  const { totals } = cart;
  const threshold = totals.freeShippingRemainingPaise + (totals.subtotalPaise - totals.discountPaise);
  const progress = threshold > 0 ? Math.min(1, (totals.subtotalPaise - totals.discountPaise) / threshold) : 1;

  return (
    <div className={styles.summary}>
      {totals.itemCount > 0 && (
        <div className={styles.shipping}>
          <p>
            {totals.freeShippingRemainingPaise > 0 ? (
              <>
                Add <strong>{formatINR(totals.freeShippingRemainingPaise)}</strong> more for free delivery.
              </>
            ) : (
              <>Your order ships free.</>
            )}
          </p>
          <div
            className={styles.meter}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            aria-label="Progress to free delivery"
          >
            <span style={{ "--progress": progress } as CSSProperties} />
          </div>
        </div>
      )}

      {showCoupon && <CouponForm cart={cart} />}

      <dl className={styles.rows}>
        <div>
          <dt>Subtotal</dt>
          <dd>
            <AnimatedAmount paise={totals.subtotalPaise} />
          </dd>
        </div>
        {totals.productSavingsPaise > 0 && (
          <div className={styles.saving}>
            <dt>You save on MRP</dt>
            <dd>{formatINR(totals.productSavingsPaise)}</dd>
          </div>
        )}
        {totals.discountPaise > 0 && (
          <div className={styles.saving}>
            <dt>Coupon discount</dt>
            <dd>
              −<AnimatedAmount paise={totals.discountPaise} />
            </dd>
          </div>
        )}
        <div>
          <dt>Delivery</dt>
          <dd>{totals.shippingPaise === 0 ? "Free" : <AnimatedAmount paise={totals.shippingPaise} />}</dd>
        </div>
        {totals.codFeePaise > 0 && (
          <div>
            <dt>Cash on delivery fee</dt>
            <dd>{formatINR(totals.codFeePaise)}</dd>
          </div>
        )}
        <div className={styles.total}>
          <dt>Total</dt>
          <dd>
            <AnimatedAmount paise={totals.totalPaise} />
          </dd>
        </div>
      </dl>
      <p className={styles.tax}>Prices include GST.</p>
    </div>
  );
}

function CouponForm({ cart }: { cart: CartDTO }) {
  const { applyCoupon, removeCoupon, busy } = useCart();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    const problem = await applyCoupon(code.trim());
    setError(problem);
    if (!problem) setCode("");
  }

  return (
    <div className={styles.coupon}>
      <form onSubmit={submit} className={styles.couponForm} noValidate>
        <label htmlFor="coupon-code" className="visually-hidden">
          Coupon code
        </label>
        <input
          id="coupon-code"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            setError(null);
          }}
          placeholder="Coupon code"
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "coupon-error" : undefined}
        />
        <Button type="submit" variant="secondary" size="sm" disabled={!code.trim()} loading={busy && Boolean(code)}>
          Apply
        </Button>
      </form>
      {error && (
        <p id="coupon-error" className={styles.couponError} role="alert">
          {error}
        </p>
      )}
      {cart.appliedCoupons.length > 0 && (
        <ul className={styles.applied}>
          {cart.appliedCoupons.map((c) => (
            <li key={c.code}>
              <span>
                <strong>{c.code}</strong> saves {formatINR(c.discountPaise)}
              </span>
              <button type="button" onClick={() => void removeCoupon(c.code)} aria-label={`Remove coupon ${c.code}`}>
                <X size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {cart.couponErrors.length > 0 && (
        <ul className={styles.rejected}>
          {cart.couponErrors.map((c) => (
            <li key={c.code}>
              <span>
                <strong>{c.code}</strong>: {c.message}
              </span>
              <button type="button" onClick={() => void removeCoupon(c.code)} aria-label={`Remove coupon ${c.code}`}>
                <X size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
