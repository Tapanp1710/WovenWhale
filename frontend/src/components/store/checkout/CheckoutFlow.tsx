"use client";

import type { AddressDTO, PaymentMethod, PlaceOrderResultDTO, QuoteDTO } from "@wovenwhale/backend/contracts";
import { AlertCircle, Banknote, CreditCard } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { useToast } from "@/components/ui/Toaster";
import { api } from "@/lib/api/client";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { formatAddress, formatINR, formatPhone } from "@/lib/format";
import { SignInForm } from "../auth/SignInForm";
import { useCart } from "../providers/CartProvider";
import { useSession } from "../providers/SessionProvider";
import { AddressPicker } from "./AddressPicker";
import { CheckoutStep } from "./CheckoutStep";
import { CheckoutSummary } from "./CheckoutSummary";
import { PaymentGateway, type GatewayResult, type PaymentSession } from "./PaymentGateway";
import { ProcessingOverlay } from "./ProcessingOverlay";
import styles from "./CheckoutFlow.module.css";

type Step = "auth" | "address" | "delivery" | "payment";
const STEP_API: Record<Step, "AUTH" | "ADDRESS" | "DELIVERY" | "PAYMENT"> = {
  auth: "AUTH",
  address: "ADDRESS",
  delivery: "DELIVERY",
  payment: "PAYMENT",
};

/**
 * Cart → Sign in → Address → Delivery → Payment/COD → Order → Confirmation.
 * Every total shown comes from the server quote; the order request only
 * carries ids, the chosen method and the total the customer saw (a
 * consistency check the API enforces).
 */
export function CheckoutFlow({ cancellationWindowHours }: { cancellationWindowHours: number }) {
  const { customer, setCustomer } = useSession();
  const { cart, refresh: refreshCart } = useCart();
  const router = useRouter();
  const toast = useToast();

  const [step, setStep] = useState<Step>(customer ? "address" : "auth");
  const [addresses, setAddresses] = useState<AddressDTO[] | null>(null);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [method, setMethod] = useState<PaymentMethod>("PREPAID");
  const [quote, setQuote] = useState<QuoteDTO | null>(null);
  const [placing, setPlacing] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [payment, setPayment] = useState<PaymentSession | null>(null);
  const [pendingOrder, setPendingOrder] = useState<string | null>(null);
  const [paymentFailure, setPaymentFailure] = useState<string | null>(null);
  // One key per checkout attempt makes retries (double-click, flaky network) idempotent.
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const progress = useCallback((s: Step) => {
    setStep(s);
    void api("/checkout/progress", { method: "POST", body: { step: STEP_API[s] } }).catch(() => undefined);
  }, []);

  // Start the checkout session and load addresses once signed in.
  useEffect(() => {
    if (!customer) return;
    void api("/checkout/start", { method: "POST" }).catch(() => undefined);
    api<AddressDTO[]>("/account/addresses")
      .then((list) => {
        setAddresses(list);
        setAddressId((current) => current ?? list.find((a) => a.isDefault)?.id ?? list[0]?.id ?? null);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [customer]);

  const loadQuote = useCallback(async () => {
    if (!customer) return;
    try {
      setQuote(await api<QuoteDTO>(`/checkout/quote?paymentMethod=${method}`));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [customer, method]);

  // Re-quote whenever the bag (coupons, quantities) or payment method changes —
  // but not once an order exists (the bag is empty by then).
  const orderPlaced = Boolean(pendingOrder || processing);
  useEffect(() => {
    if (!orderPlaced) void loadQuote();
  }, [loadQuote, cart, orderPlaced]);

  useEffect(() => {
    if (quote && !quote.codAvailable && method === "COD") setMethod("PREPAID");
  }, [quote, method]);

  const address = useMemo(() => addresses?.find((a) => a.id === addressId) ?? null, [addresses, addressId]);
  const empty = quote !== null && quote.lines.length === 0 && !pendingOrder;

  async function finishPayment(orderNumber: string, result: GatewayResult) {
    setPayment(null);
    if (result.status !== "success") {
      setPaymentFailure(result.status === "failed" ? result.message : "Payment wasn't completed.");
      return;
    }
    setProcessing("Confirming your payment");
    try {
      await api("/payments/verify", { method: "POST", body: { orderNumber, payload: result.payload } });
      router.replace(`/checkout/confirmation/${orderNumber}`);
    } catch (e) {
      setProcessing(null);
      setPaymentFailure(errorMessage(e));
    }
  }

  async function placeOrder() {
    if (!quote || !addressId) return;
    setPlacing(true);
    setError(null);
    try {
      const result = await api<PlaceOrderResultDTO>("/checkout/orders", {
        method: "POST",
        body: { addressId, paymentMethod: method, idempotencyKey, expectedTotalPaise: quote.totals.totalPaise },
      });
      if (result.payment) {
        setPendingOrder(result.orderNumber);
        setPayment(result.payment);
      } else {
        setProcessing("Placing your order");
        router.replace(`/checkout/confirmation/${result.orderNumber}`);
      }
      void refreshCart();
    } catch (e) {
      if (e instanceof ApiError && e.code === "PRICE_CHANGED") {
        await loadQuote();
        toast.info("Prices in your bag changed. Please review the new total.");
      } else if (e instanceof ApiError && (e.code === "OUT_OF_STOCK" || e.code === "INSUFFICIENT_STOCK" || e.code === "UNAVAILABLE")) {
        await Promise.all([loadQuote(), refreshCart()]);
        setError(e.message);
      } else {
        setError(errorMessage(e));
      }
    } finally {
      setPlacing(false);
    }
  }

  async function retryPayment() {
    if (!pendingOrder) return;
    setPaymentFailure(null);
    try {
      setPayment(await api<PaymentSession>(`/payments/${pendingOrder}/retry`, { method: "POST" }));
    } catch (e) {
      setPaymentFailure(errorMessage(e));
    }
  }

  if (empty) {
    return (
      <div className={styles.empty}>
        <h1 className={styles.heading}>Your bag is empty</h1>
        <p>Add something you love, then come back to check out.</p>
        <ButtonLink href="/shop">Browse the collection</ButtonLink>
      </div>
    );
  }

  return (
    <div className={styles.layout}>
      <div className={styles.steps}>
        <h1 className={styles.heading}>Checkout</h1>

        {pendingOrder && paymentFailure !== null && (
          <div className={styles.failure} role="alert">
            <AlertCircle size={20} aria-hidden="true" />
            <div>
              <p className={styles.failureTitle}>Payment for order {pendingOrder} didn&apos;t go through</p>
              <p>{paymentFailure} We&apos;re holding your items for a short while, and you haven&apos;t been charged.</p>
              <div className={styles.failureActions}>
                <Button onClick={() => void retryPayment()}>Try payment again</Button>
                <ButtonLink href={`/account/orders/${pendingOrder}`} variant="ghost">
                  View order
                </ButtonLink>
              </div>
            </div>
          </div>
        )}

        <CheckoutStep number={1} title="Sign in" state={customer ? "done" : "active"} summary={customer && formatPhone(customer.phone)}>
          <SignInForm
            onSignedIn={(c) => {
              setCustomer(c);
              window.dispatchEvent(new Event("ww:session-changed"));
              router.refresh();
              progress("address");
            }}
          />
        </CheckoutStep>

        <CheckoutStep
          number={2}
          title="Delivery address"
          state={!customer ? "upcoming" : step === "address" ? "active" : step === "auth" ? "upcoming" : "done"}
          summary={address && `${address.fullName}, ${formatAddress(address)}`}
          onChange={() => progress("address")}
        >
          {addresses === null ? (
            <p className={styles.muted}>Loading your addresses…</p>
          ) : (
            <AddressPicker
              addresses={addresses}
              selectedId={addressId}
              onSelect={setAddressId}
              defaultName={customer?.fullName ?? undefined}
              defaultPhone={customer?.phone}
              onAdded={(a) => {
                setAddresses((list) => [...(list ?? []).map((x) => (a.isDefault ? { ...x, isDefault: false } : x)), a]);
                setAddressId(a.id);
                progress("delivery");
              }}
              onContinue={() => progress("delivery")}
            />
          )}
        </CheckoutStep>

        <CheckoutStep
          number={3}
          title="Delivery"
          state={step === "delivery" ? "active" : step === "payment" ? "done" : "upcoming"}
          summary={
            quote &&
            (quote.totals.shippingPaise === 0 ? "Standard delivery, free" : `Standard delivery, ${formatINR(quote.totals.shippingPaise)}`)
          }
          onChange={() => progress("delivery")}
        >
          <div className={styles.delivery}>
            <div className={styles.option} data-selected>
              <span className={styles.optionTitle}>Standard delivery</span>
              <span>{quote ? (quote.totals.shippingPaise === 0 ? "Free" : formatINR(quote.totals.shippingPaise)) : ""}</span>
            </div>
            <p className={styles.muted}>
              We&apos;ll add tracking details to your order page as soon as it ships.
              {quote &&
                quote.totals.freeShippingRemainingPaise > 0 &&
                ` Add ${formatINR(quote.totals.freeShippingRemainingPaise)} more for free delivery.`}
            </p>
            <Button size="lg" onClick={() => progress("payment")}>
              Continue to payment
            </Button>
          </div>
        </CheckoutStep>

        <CheckoutStep number={4} title="Payment" state={step === "payment" ? "active" : "upcoming"}>
          <div className={styles.payment}>
            <div role="radiogroup" aria-label="Payment method" className={styles.methods}>
              <label className={styles.method} data-selected={method === "PREPAID" || undefined}>
                <input type="radio" name="method" checked={method === "PREPAID"} onChange={() => setMethod("PREPAID")} />
                <CreditCard size={20} aria-hidden="true" />
                <span>
                  <span className={styles.optionTitle}>Pay online</span>
                  <span className={styles.muted}>UPI, cards, netbanking and wallets. Your order is confirmed instantly.</span>
                </span>
              </label>
              <label
                className={styles.method}
                data-selected={method === "COD" || undefined}
                data-disabled={quote && !quote.codAvailable ? "" : undefined}
              >
                <input
                  type="radio"
                  name="method"
                  checked={method === "COD"}
                  disabled={!quote?.codAvailable}
                  onChange={() => setMethod("COD")}
                />
                <Banknote size={20} aria-hidden="true" />
                <span>
                  <span className={styles.optionTitle}>Cash on delivery</span>
                  <span className={styles.muted}>
                    {quote && !quote.codAvailable
                      ? quote.codUnavailableReason
                      : `Pay when it arrives${quote && quote.totals.codFeePaise > 0 ? ` (+${formatINR(quote.totals.codFeePaise)} COD fee)` : ""}. Our team confirms COD orders before they ship.`}
                  </span>
                </span>
              </label>
            </div>

            {quote?.couponErrors.length ? (
              <p className={styles.warning} role="alert">
                Remove the coupon that no longer applies before placing your order.
              </p>
            ) : null}
            {quote?.hasIssues && (
              <p className={styles.warning} role="alert">
                Some items in your bag need attention. Update your bag to continue.
              </p>
            )}
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}

            <Button
              size="lg"
              fullWidth
              onClick={() => void placeOrder()}
              loading={placing}
              disabled={!quote || !address || quote.hasIssues || quote.couponErrors.length > 0 || Boolean(pendingOrder)}
            >
              {method === "COD" ? "Place order" : `Pay ${quote ? formatINR(quote.totals.totalPaise) : ""}`}
            </Button>
            <p className={styles.muted}>
              By placing your order you agree to our terms and return policy. You can cancel within {cancellationWindowHours} hours from
              your account.
            </p>
          </div>
        </CheckoutStep>
      </div>

      <aside className={styles.aside} aria-label="Order summary">
        <CheckoutSummary quote={quote} />
      </aside>

      <PaymentGateway session={payment} onResult={(r) => pendingOrder && void finishPayment(pendingOrder, r)} />
      <ProcessingOverlay message={processing} />
    </div>
  );
}
