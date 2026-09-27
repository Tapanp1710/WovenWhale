"use client";

import { refundProcessSchema, type RefundDTO, type RefundMethod } from "@wovenwhale/backend/contracts";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api/client";
import { formatDateTime, formatINR } from "@/lib/format";
import { useAction, useCan } from "../AdminContext";
import { ReasonDialog } from "../ui/ReasonDialog";
import { RefundStatusBadge } from "../ui/StatusBadges";
import { cell, Table } from "../ui/Table";

export const REFUND_METHOD_LABELS: Record<RefundMethod, string> = {
  ORIGINAL_PAYMENT: "Original payment",
  BANK_TRANSFER: "Bank transfer",
  UPI: "UPI",
};

/**
 * Refunds with the two manual actions the API supports: recording a bank/UPI
 * payout as processed, and retrying a failed gateway refund.
 */
export function RefundsTable({ refunds }: { refunds: RefundDTO[] }) {
  const canApprove = useCan("refunds.approve");
  const { run, pending } = useAction();
  const [processing, setProcessing] = useState<RefundDTO | null>(null);

  return (
    <>
      <Table label="Refunds" minWidth={640}>
        <thead>
          <tr>
            <th scope="col">Created</th>
            <th scope="col">Method</th>
            <th scope="col">Reason</th>
            <th scope="col" className={cell.num}>
              Amount
            </th>
            <th scope="col">Status</th>
            {canApprove && (
              <th scope="col" className={cell.actions}>
                <span className="visually-hidden">Actions</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {refunds.map((r) => (
            <tr key={r.id}>
              <td className={cell.nowrap}>
                {formatDateTime(r.createdAt)}
                {r.processedAt && <span className={cell.sub}>Processed {formatDateTime(r.processedAt)}</span>}
              </td>
              <td>{REFUND_METHOD_LABELS[r.method]}</td>
              <td>
                {r.reason}
                {r.returnNumber && <span className={cell.sub}>Return {r.returnNumber}</span>}
              </td>
              <td className={`${cell.num} ${cell.strong}`}>{formatINR(r.amountPaise)}</td>
              <td>
                <RefundStatusBadge status={r.status} />
              </td>
              {canApprove && (
                <td className={cell.actions}>
                  {r.method !== "ORIGINAL_PAYMENT" && r.status !== "PROCESSED" && (
                    <Button size="sm" variant="secondary" onClick={() => setProcessing(r)}>
                      Mark as paid
                    </Button>
                  )}
                  {r.status === "FAILED" && (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={pending}
                      onClick={() => run(() => api(`/admin/refunds/${r.id}/retry`, { method: "POST" }), "Refund queued for retry")}
                    >
                      Retry
                    </Button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </Table>
      <ReasonDialog
        open={processing !== null}
        onOpenChange={(o) => !o && setProcessing(null)}
        title="Record manual refund"
        description={
          processing
            ? `Confirm you've sent ${formatINR(processing.amountPaise)} by ${REFUND_METHOD_LABELS[processing.method].toLowerCase()}.`
            : undefined
        }
        name="reference"
        label="Transaction reference"
        multiline={false}
        schema={refundProcessSchema}
        confirmLabel="Mark as paid"
        onConfirm={(v) =>
          run(() => api(`/admin/refunds/${processing!.id}/mark-processed`, { method: "POST", body: v }), "Refund marked as paid")
        }
      />
    </>
  );
}
