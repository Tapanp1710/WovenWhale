"use client";

import type { AddressDTO } from "@wovenwhale/backend/contracts";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { formatAddress, formatPhone } from "@/lib/format";
import { AddressForm } from "../account/AddressForm";
import styles from "./AddressPicker.module.css";

export function AddressPicker({
  addresses,
  selectedId,
  onSelect,
  onAdded,
  onContinue,
  defaultName,
  defaultPhone,
}: {
  addresses: AddressDTO[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdded: (a: AddressDTO) => void;
  onContinue: () => void;
  defaultName?: string;
  defaultPhone?: string;
}) {
  const [adding, setAdding] = useState(addresses.length === 0);

  if (adding) {
    return (
      <AddressForm
        defaults={{ fullName: defaultName, phone: defaultPhone?.replace(/^\+91/, "") }}
        submitLabel="Deliver to this address"
        onCancel={addresses.length ? () => setAdding(false) : undefined}
        onSaved={(a) => {
          onAdded(a);
          setAdding(false);
        }}
      />
    );
  }

  return (
    <div className={styles.picker}>
      <ul className={styles.list} role="radiogroup" aria-label="Saved addresses">
        {addresses.map((a) => (
          <li key={a.id}>
            <label className={styles.option} data-selected={selectedId === a.id || undefined}>
              <input type="radio" name="address" checked={selectedId === a.id} onChange={() => onSelect(a.id)} />
              <span className={styles.text}>
                <span className={styles.name}>
                  {a.fullName}
                  <span className={styles.tag}>{a.addressType.charAt(0) + a.addressType.slice(1).toLowerCase()}</span>
                  {a.isDefault && <span className={styles.tag}>Default</span>}
                </span>
                <span>{formatAddress(a)}</span>
                <span className={styles.phone}>{formatPhone(a.phone)}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <button type="button" className={styles.add} onClick={() => setAdding(true)}>
        <Plus size={18} aria-hidden="true" /> Add a new address
      </button>
      <Button size="lg" onClick={onContinue} disabled={!selectedId}>
        Deliver here
      </Button>
    </div>
  );
}
