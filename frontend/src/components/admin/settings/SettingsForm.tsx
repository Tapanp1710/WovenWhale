"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { storeSettingsSchema, type StoreSettingsDTO, type StoreSettingsInput } from "@wovenwhale/backend/contracts";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/Button";
import { Checkbox, TextField } from "@/components/ui/Field";
import { api } from "@/lib/api/client";
import { serverErrors, useAction } from "../AdminContext";
import { Panel } from "../ui/Panel";
import styles from "./SettingsForm.module.css";

const toInput = (s: StoreSettingsDTO): StoreSettingsInput => ({
  freeShippingThreshold: s.freeShippingThresholdPaise / 100,
  flatShippingFee: s.flatShippingPaise / 100,
  codEnabled: s.codEnabled,
  codFee: s.codFeePaise / 100,
  codMaxOrderValue: s.codMaxOrderPaise / 100,
  lowStockThreshold: s.lowStockThreshold,
});

/** Store-wide checkout rules. Amounts are rupees here; the API stores paise. */
export function SettingsForm({ settings }: { settings: StoreSettingsDTO }) {
  const { run } = useAction();
  const form = useForm<StoreSettingsInput, unknown, StoreSettingsInput>({
    resolver: zodResolver(storeSettingsSchema, undefined, { raw: true }),
    defaultValues: toInput(settings),
  });
  const e = form.formState.errors;
  const money = { type: "number", inputMode: "decimal", min: 0, step: "1" } as const;

  const submit = form.handleSubmit(async (values) => {
    const saved = await run(
      () => api<StoreSettingsDTO>("/admin/settings", { method: "PUT", body: values }),
      "Settings saved",
      serverErrors(form.setError),
    );
    if (saved) form.reset(toInput(saved));
  });

  return (
    <form onSubmit={submit} noValidate className={styles.form}>
      <Panel title="Shipping">
        <div className={styles.grid}>
          <TextField
            label="Free shipping from (₹)"
            hint="Order subtotal that unlocks free delivery."
            error={e.freeShippingThreshold?.message}
            {...money}
            {...form.register("freeShippingThreshold")}
          />
          <TextField
            label="Flat shipping fee (₹)"
            hint="Charged below the free shipping amount."
            error={e.flatShippingFee?.message}
            {...money}
            {...form.register("flatShippingFee")}
          />
        </div>
      </Panel>
      <Panel title="Cash on delivery">
        <div className={styles.stack}>
          <Checkbox label="Offer cash on delivery at checkout" {...form.register("codEnabled")} />
          <div className={styles.grid}>
            <TextField label="COD fee (₹)" error={e.codFee?.message} {...money} {...form.register("codFee")} />
            <TextField
              label="Maximum COD order (₹)"
              hint="Larger orders must be prepaid."
              error={e.codMaxOrderValue?.message}
              {...money}
              {...form.register("codMaxOrderValue")}
            />
          </div>
        </div>
      </Panel>
      <Panel title="Inventory">
        <div className={styles.grid}>
          <TextField
            label="Default low-stock threshold"
            type="number"
            inputMode="numeric"
            min={0}
            hint="Used for sizes without their own threshold."
            error={e.lowStockThreshold?.message}
            {...form.register("lowStockThreshold")}
          />
        </div>
      </Panel>
      <div className={styles.actions}>
        <Button type="submit" loading={form.formState.isSubmitting} disabled={!form.formState.isDirty}>
          Save settings
        </Button>
      </div>
    </form>
  );
}
