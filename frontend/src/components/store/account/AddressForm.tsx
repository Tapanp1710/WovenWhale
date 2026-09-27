"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ADDRESS_TYPES, INDIAN_STATES, addressInputSchema, type AddressDTO, type AddressInput } from "@wovenwhale/backend/contracts";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Checkbox, SelectField, TextField } from "@/components/ui/Field";
import { api } from "@/lib/api/client";
import { ApiError, errorMessage } from "@/lib/api/errors";
import styles from "./AddressForm.module.css";

type Output = z.output<typeof addressInputSchema>;

const TYPE_LABEL: Record<(typeof ADDRESS_TYPES)[number], string> = { HOME: "Home", WORK: "Work", OTHER: "Other" };

/** Create or edit a delivery address. Validated client-side and again by the API. */
export function AddressForm({
  address,
  defaults,
  onSaved,
  onCancel,
  submitLabel = "Save address",
}: {
  address?: AddressDTO;
  defaults?: Partial<AddressInput>;
  onSaved: (address: AddressDTO) => void;
  onCancel?: () => void;
  submitLabel?: string;
}) {
  const form = useForm<AddressInput, unknown, Output>({
    resolver: zodResolver(addressInputSchema),
    defaultValues: address
      ? {
          ...address,
          state: address.state as AddressInput["state"],
          phone: address.phone.replace(/^\+91/, ""),
          email: address.email ?? "",
          landmark: address.landmark ?? "",
        }
      : { addressType: "HOME", isDefault: false, state: undefined, ...defaults },
  });
  const { errors, isSubmitting } = form.formState;

  async function submit(values: Output) {
    try {
      const saved = await api<AddressDTO>(address ? `/account/addresses/${address.id}` : "/account/addresses", {
        method: address ? "PUT" : "POST",
        body: values,
      });
      onSaved(saved);
    } catch (error) {
      if (error instanceof ApiError && Object.keys(error.fields).length) {
        for (const [field, message] of Object.entries(error.fields)) form.setError(field as keyof AddressInput, { message });
      } else {
        form.setError("root", { message: errorMessage(error) });
      }
    }
  }

  return (
    <form className={styles.form} onSubmit={form.handleSubmit(submit)} noValidate>
      <div className={styles.grid}>
        <TextField label="Full name" autoComplete="name" error={errors.fullName?.message} {...form.register("fullName")} />
        <TextField
          label="Mobile number"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          error={errors.phone?.message}
          {...form.register("phone")}
        />
        <div className={styles.full}>
          <TextField
            label="Flat, house number, building"
            autoComplete="address-line1"
            error={errors.line1?.message}
            {...form.register("line1")}
          />
        </div>
        <div className={styles.full}>
          <TextField label="Street" autoComplete="address-line2" error={errors.line2?.message} {...form.register("line2")} />
        </div>
        <TextField label="Area or locality" autoComplete="address-level3" error={errors.area?.message} {...form.register("area")} />
        <TextField label="Landmark" optional error={errors.landmark?.message} {...form.register("landmark")} />
        <TextField label="City" autoComplete="address-level2" error={errors.city?.message} {...form.register("city")} />
        <SelectField label="State" autoComplete="address-level1" error={errors.state?.message} defaultValue="" {...form.register("state")}>
          <option value="" disabled>
            Select a state
          </option>
          {INDIAN_STATES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Pincode"
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={6}
          error={errors.pincode?.message}
          {...form.register("pincode")}
        />
        <TextField
          label="Email for order updates"
          type="email"
          optional
          autoComplete="email"
          error={errors.email?.message}
          {...form.register("email")}
        />
      </div>

      <fieldset className={styles.types}>
        <legend>Address type</legend>
        <div>
          {ADDRESS_TYPES.map((t) => (
            <label key={t} className={styles.type}>
              <input type="radio" value={t} {...form.register("addressType")} />
              <span>{TYPE_LABEL[t]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <Checkbox label="Make this my default address" {...form.register("isDefault")} />

      {errors.root && (
        <p className={styles.error} role="alert">
          {errors.root.message}
        </p>
      )}
      <div className={styles.actions}>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" loading={isSubmitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
