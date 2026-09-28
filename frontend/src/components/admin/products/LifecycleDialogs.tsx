"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { api } from "@/lib/api/client";
import { useAction } from "../AdminContext";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import styles from "./LifecycleDialogs.module.css";

type Product = { id: string; name: string };

export function ArchiveDialog({ product, onClose }: { product: Product; onClose: () => void }) {
  const { run } = useAction();
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Archive this product?"
      description="Archived products will no longer appear in the storefront but historical orders will remain intact. You can restore it later."
      confirmLabel="Archive product"
      cancelLabel="Cancel"
      onConfirm={() => run(() => api(`/admin/catalog/products/${product.id}/archive`, { method: "POST" }), `${product.name} archived`)}
    />
  );
}

/** Restore as a draft (safe default) or straight to the store; the API refuses "active" for an incomplete product. */
export function RestoreDialog({ product, onClose }: { product: Product; onClose: () => void }) {
  const { run } = useAction();
  const [busy, setBusy] = useState<"DRAFT" | "ACTIVE" | null>(null);

  async function restore(to: "DRAFT" | "ACTIVE") {
    setBusy(to);
    const ok = await run(
      () => api(`/admin/catalog/products/${product.id}/restore`, { method: "POST", body: { to } }),
      to === "ACTIVE" ? `${product.name} is back in the store` : `${product.name} restored as a draft`,
    );
    setBusy(null);
    if (ok) onClose();
  }

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      side="center"
      title={`Restore ${product.name}?`}
      description="Restore it as a draft to check it first, or put it straight back in the store."
      footer={
        <div className={styles.footer}>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="secondary" loading={busy === "DRAFT"} disabled={busy !== null} onClick={() => restore("DRAFT")}>
            Restore as draft
          </Button>
          <Button loading={busy === "ACTIVE"} disabled={busy !== null} onClick={() => restore("ACTIVE")}>
            Restore and publish
          </Button>
        </div>
      }
    >
      <p>Publishing needs a price, at least one active size and a product photo.</p>
    </Sheet>
  );
}

/** Permanent delete: offered only when the API says nothing refers to the product. */
export function DeleteDialog({ product, onClose }: { product: Product; onClose: () => void }) {
  const router = useRouter();
  const { run } = useAction();
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Delete ${product.name} permanently?`}
      description="This product has never been ordered and has no stock history, so it can be removed completely. This can't be undone."
      confirmLabel="Delete permanently"
      cancelLabel="Cancel"
      onConfirm={async () => {
        const ok = await run(() => api(`/admin/catalog/products/${product.id}`, { method: "DELETE" }), `${product.name} deleted`);
        if (ok) router.push("/admin/products?status=ARCHIVED");
        return ok;
      }}
    />
  );
}
