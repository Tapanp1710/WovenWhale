"use client";

import { RETURN_REASONS, RETURN_TYPE_LABELS, type ReturnSummaryDTO } from "@wovenwhale/backend/contracts";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { TextAreaField } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toaster";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { formatDate, formatINR } from "@/lib/format";
import { ReturnStatusBadge } from "./StatusBadge";
import styles from "./ReturnList.module.css";

const reasonLabel = (value: string) => RETURN_REASONS.find((r) => r.value === value)?.label ?? value;

export function ReturnList({ returns, showOrder = false }: { returns: ReturnSummaryDTO[]; showOrder?: boolean }) {
  return (
    <ul className={styles.list}>
      {returns.map((r) => (
        <ReturnItem key={r.id} item={r} showOrder={showOrder} />
      ))}
    </ul>
  );
}

function ReturnItem({ item, showOrder }: { item: ReturnSummaryDTO; showOrder: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState<"reply" | "cancel" | null>(null);

  async function sendReply(e: FormEvent) {
    e.preventDefault();
    setBusy("reply");
    try {
      await api(`/returns/${item.returnNumber}/reply`, { method: "POST", body: { message: reply } });
      toast.success("Reply sent.");
      setReply("");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function withdraw() {
    setBusy("cancel");
    try {
      await api(`/returns/${item.returnNumber}/cancel`, { method: "POST" });
      toast.success("Request withdrawn.");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const canWithdraw = item.status === "REQUESTED" || item.status === "INFO_REQUESTED";

  return (
    <li className={styles.item}>
      <div className={styles.head}>
        <p className={styles.title}>
          {RETURN_TYPE_LABELS[item.type]} {item.returnNumber}
          {showOrder && <span className={styles.muted}> for order {item.orderNumber}</span>}
        </p>
        <ReturnStatusBadge status={item.status} />
      </div>
      <p className={styles.muted}>
        Requested {formatDate(item.createdAt)}. {reasonLabel(item.reason)}.
      </p>
      <ul className={styles.lines}>
        {item.items.map((l) => (
          <li key={l.orderItemId}>
            {l.productName}, size {l.size}, qty {l.quantity}
            {l.exchangeSize && `, exchanging for size ${l.exchangeSize}`}
          </li>
        ))}
      </ul>
      {item.refundPaise !== null && <p className={styles.refund}>Refund: {formatINR(item.refundPaise)}</p>}
      {item.status === "INFO_REQUESTED" && item.infoRequest && (
        <form className={styles.reply} onSubmit={sendReply}>
          <p className={styles.question}>
            <strong>We need a little more information:</strong> {item.infoRequest}
          </p>
          <TextAreaField
            label="Your reply"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            required
            minLength={2}
            maxLength={1000}
          />
          <Button type="submit" size="sm" loading={busy === "reply"} disabled={reply.trim().length < 2}>
            Send reply
          </Button>
        </form>
      )}
      {canWithdraw && (
        <Button variant="link" onClick={() => void withdraw()} loading={busy === "cancel"}>
          Withdraw request
        </Button>
      )}
    </li>
  );
}
