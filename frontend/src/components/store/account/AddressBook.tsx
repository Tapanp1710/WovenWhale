"use client";

import type { AddressDTO } from "@wovenwhale/backend/contracts";
import { MapPin, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Sheet } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toaster";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { formatAddress, formatPhone } from "@/lib/format";
import { AddressForm } from "./AddressForm";
import styles from "./AddressBook.module.css";

export function AddressBook({ initial }: { initial: AddressDTO[] }) {
  const [addresses, setAddresses] = useState(initial);
  const [editing, setEditing] = useState<AddressDTO | "new" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();

  async function run(id: string, fn: () => Promise<AddressDTO[]>, message: string) {
    setBusy(id);
    try {
      setAddresses(await fn());
      toast.success(message);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  const reload = () => api<AddressDTO[]>("/account/addresses");

  return (
    <div className={styles.book}>
      {addresses.length === 0 ? (
        <EmptyState
          icon={<MapPin size={26} aria-hidden="true" />}
          title="No saved addresses"
          action={<Button onClick={() => setEditing("new")}>Add an address</Button>}
        >
          Save an address to check out faster.
        </EmptyState>
      ) : (
        <>
          <ul className={styles.list}>
            {addresses.map((a) => (
              <li key={a.id} className={styles.card}>
                <p className={styles.name}>
                  {a.fullName}
                  {a.isDefault && <span className={styles.tag}>Default</span>}
                </p>
                <p className={styles.text}>{formatAddress(a)}</p>
                <p className={styles.text}>{formatPhone(a.phone)}</p>
                <div className={styles.actions}>
                  <Button variant="link" onClick={() => setEditing(a)}>
                    Edit
                  </Button>
                  {!a.isDefault && (
                    <Button
                      variant="link"
                      loading={busy === `default-${a.id}`}
                      onClick={() =>
                        void run(
                          `default-${a.id}`,
                          () => api(`/account/addresses/${a.id}/default`, { method: "POST" }),
                          "Default address updated.",
                        )
                      }
                    >
                      Make default
                    </Button>
                  )}
                  <Button
                    variant="link"
                    loading={busy === `delete-${a.id}`}
                    onClick={() =>
                      void run(`delete-${a.id}`, () => api(`/account/addresses/${a.id}`, { method: "DELETE" }), "Address removed.")
                    }
                  >
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <Button variant="secondary" icon={<Plus size={18} aria-hidden="true" />} onClick={() => setEditing("new")}>
            Add an address
          </Button>
        </>
      )}

      <Sheet
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing === "new" ? "New address" : "Edit address"}
        side="right"
        width="min(560px, 100vw)"
      >
        {editing !== null && (
          <AddressForm
            address={editing === "new" ? undefined : editing}
            onCancel={() => setEditing(null)}
            onSaved={async () => {
              setEditing(null);
              setAddresses(await reload());
              toast.success("Address saved.");
            }}
          />
        )}
      </Sheet>
    </div>
  );
}
