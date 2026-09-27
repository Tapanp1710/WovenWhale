"use client";

import {
  RETURN_REASONS,
  RETURN_TYPE_LABELS,
  type OrderDetailDTO,
  type ProductDetailDTO,
  type ReturnType,
} from "@wovenwhale/backend/contracts";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { SelectField, TextAreaField } from "@/components/ui/Field";
import { QuantityStepper } from "@/components/ui/QuantityStepper";
import { Sheet } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toaster";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { formatDate } from "@/lib/format";
import styles from "./ReturnRequest.module.css";

const TYPE_HELP: Record<ReturnType, string> = {
  RETURN: "Send the item back for a refund once we receive it.",
  EXCHANGE: "Swap for a different size of the same piece.",
  REFUND: "For items that arrived damaged or incorrect, when a pickup isn't needed.",
};

interface Selection {
  quantity: number;
  exchangeVariantId?: string;
}

/** Return, exchange or refund request. Eligibility is decided by the server (14 days from delivery). */
export function ReturnRequest({ order }: { order: OrderDetailDTO }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ReturnType>("RETURN");
  const [reason, setReason] = useState<string>(RETURN_REASONS[0].value);
  const [note, setNote] = useState("");
  const [selected, setSelected] = useState<Record<string, Selection>>({});
  const [variants, setVariants] = useState<Record<string, ProductDetailDTO["variants"]>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const returnable = order.items.filter((i) => i.returnableQuantity > 0);

  // Exchanges need the live sizes of each selected product.
  useEffect(() => {
    if (type !== "EXCHANGE") return;
    for (const item of returnable) {
      if (!selected[item.id] || variants[item.productId] || !item.productSlug) continue;
      api<ProductDetailDTO>(`/catalog/products/${item.productSlug}`)
        .then((p) => setVariants((v) => ({ ...v, [item.productId]: p.variants })))
        .catch(() => setVariants((v) => ({ ...v, [item.productId]: [] })));
    }
  }, [type, selected, returnable, variants]);

  if (!order.canRequestReturn) {
    return order.returnUnavailableReason && order.status === "DELIVERED" ? (
      <p className={styles.closed}>{order.returnUnavailableReason}</p>
    ) : null;
  }

  const items = Object.entries(selected).map(([orderItemId, s]) => ({
    orderItemId,
    quantity: s.quantity,
    exchangeVariantId: s.exchangeVariantId,
  }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (items.length === 0) return setError("Select at least one item.");
    if (type === "EXCHANGE" && items.some((i) => !i.exchangeVariantId)) return setError("Choose the size you'd like for each item.");
    setBusy(true);
    try {
      const res = await api<{ returnNumber: string }>(`/orders/${order.orderNumber}/returns`, {
        method: "POST",
        body: { type, reason, note: note || undefined, items },
      });
      setOpen(false);
      setSelected({});
      toast.success(`Request ${res.returnNumber} sent. We'll update you here.`);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.entry}>
      <p className={styles.window}>
        {order.returnDeadlineAt && `Returns and exchanges are open until ${formatDate(order.returnDeadlineAt)}.`}
      </p>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Return or exchange items
      </Button>

      <Sheet open={open} onOpenChange={setOpen} title="Return or exchange" side="right" width="min(520px, 100vw)">
        <form className={styles.form} onSubmit={submit}>
          <fieldset className={styles.types}>
            <legend>What would you like to do?</legend>
            {(Object.keys(TYPE_HELP) as ReturnType[]).map((t) => (
              <label key={t} className={styles.type} data-selected={type === t || undefined}>
                <input type="radio" name="type" checked={type === t} onChange={() => setType(t)} />
                <span>
                  <strong>{RETURN_TYPE_LABELS[t]}</strong>
                  <span>{TYPE_HELP[t]}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <fieldset className={styles.items}>
            <legend>Which items?</legend>
            {returnable.map((item) => {
              const sel = selected[item.id];
              const sizes = (variants[item.productId] ?? []).filter((v) => v.size !== item.size);
              return (
                <div key={item.id} className={styles.item}>
                  <label className={styles.itemHead}>
                    <input
                      type="checkbox"
                      checked={Boolean(sel)}
                      onChange={(e) =>
                        setSelected((s) => {
                          const next = { ...s };
                          if (e.target.checked) next[item.id] = { quantity: 1 };
                          else delete next[item.id];
                          return next;
                        })
                      }
                    />
                    <span className={styles.thumb}>{item.imageUrl && <Image src={item.imageUrl} alt="" fill sizes="48px" />}</span>
                    <span>
                      <strong>{item.productName}</strong>
                      <span className={styles.muted}>
                        Size {item.size}, {item.returnableQuantity} eligible
                      </span>
                    </span>
                  </label>
                  {sel && (
                    <div className={styles.itemOptions}>
                      {item.returnableQuantity > 1 && (
                        <QuantityStepper
                          size="sm"
                          value={sel.quantity}
                          max={item.returnableQuantity}
                          label={`Quantity of ${item.productName}`}
                          onChange={(q) => setSelected((s) => ({ ...s, [item.id]: { ...sel, quantity: q } }))}
                        />
                      )}
                      {type === "EXCHANGE" && (
                        <SelectField
                          label="New size"
                          value={sel.exchangeVariantId ?? ""}
                          onChange={(e) =>
                            setSelected((s) => ({ ...s, [item.id]: { ...sel, exchangeVariantId: e.target.value || undefined } }))
                          }
                        >
                          <option value="">{variants[item.productId] ? "Choose a size" : "Loading sizes…"}</option>
                          {sizes.map((v) => (
                            <option key={v.id} value={v.id} disabled={!v.inStock}>
                              {v.size}
                              {v.inStock ? "" : " (sold out)"}
                            </option>
                          ))}
                        </SelectField>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </fieldset>

          <SelectField label="Reason" value={reason} onChange={(e) => setReason(e.target.value)}>
            {RETURN_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </SelectField>
          <TextAreaField
            label="Anything else we should know?"
            optional
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1000}
          />
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" fullWidth loading={busy}>
            Send request
          </Button>
        </form>
      </Sheet>
    </div>
  );
}
