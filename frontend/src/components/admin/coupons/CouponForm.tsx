"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { couponUpsertSchema, type AdminCategoryDTO, type AdminCouponDTO, type CouponUpsertInput } from "@wovenwhale/backend/contracts";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/Button";
import { Checkbox, SelectField, TextField } from "@/components/ui/Field";
import { api } from "@/lib/api/client";
import { formatINR } from "@/lib/format";
import { serverErrors, useAction, useCan } from "../AdminContext";
import { Panel } from "../ui/Panel";
import styles from "./CouponForm.module.css";

const emptyToNull = (v: unknown) => (v === "" || v === null ? null : v);
/** ISO → value for <input type="datetime-local"> in the admin's own time zone. */
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const toIso = (v: unknown) => (typeof v === "string" && v ? new Date(v).toISOString() : null);

function defaults(c: AdminCouponDTO | null): CouponUpsertInput {
  return {
    code: c?.code ?? "",
    description: c?.description ?? "",
    type: c?.type ?? "PERCENTAGE",
    value: c ? (c.type === "FIXED_AMOUNT" ? c.value / 100 : c.value) : "",
    minOrder: c ? c.minOrderPaise / 100 : 0,
    maxDiscount: c?.maxDiscountPaise != null ? c.maxDiscountPaise / 100 : null,
    startsAt: toLocalInput(c?.startsAt ?? null),
    endsAt: toLocalInput(c?.endsAt ?? null),
    usageLimit: c?.usageLimit ?? null,
    perCustomerLimit: c?.perCustomerLimit ?? null,
    isActive: c?.isActive ?? true,
    newCustomersOnly: c?.newCustomersOnly ?? false,
    firstOrderOnly: c?.firstOrderOnly ?? false,
    isStackable: c?.isStackable ?? false,
    productIds: c?.productIds ?? [],
    categoryIds: c?.categoryIds ?? [],
  };
}

/** Every coupon rule, validated with the API's couponUpsertSchema (money in rupees). */
export function CouponForm({
  coupon,
  categories,
  products,
}: {
  coupon: AdminCouponDTO | null;
  categories: AdminCategoryDTO[];
  products: { id: string; name: string; sku: string }[];
}) {
  const router = useRouter();
  const canManage = useCan("coupons.manage");
  const { run } = useAction();
  const [productFilter, setProductFilter] = useState("");
  const form = useForm<CouponUpsertInput, unknown, CouponUpsertInput>({
    resolver: zodResolver(couponUpsertSchema, undefined, { raw: true }),
    defaultValues: defaults(coupon),
  });
  const { register, formState } = form;
  const e = formState.errors;
  const [type, productIds, categoryIds] = useWatch({ control: form.control, name: ["type", "productIds", "categoryIds"] });
  const needle = productFilter.trim().toLowerCase();

  const submit = form.handleSubmit(async (values) => {
    const body = { ...values, startsAt: toIso(values.startsAt), endsAt: toIso(values.endsAt) };
    const saved = await run(
      () => api<AdminCouponDTO>(coupon ? `/admin/coupons/${coupon.id}` : "/admin/coupons", { method: coupon ? "PUT" : "POST", body }),
      coupon ? "Coupon saved" : "Coupon created",
      serverErrors(form.setError),
    );
    if (saved && !coupon) router.push(`/admin/coupons/${saved.id}`);
    else if (saved) form.reset(defaults(saved));
  });

  return (
    <form onSubmit={submit} noValidate className={styles.form}>
      <fieldset disabled={!canManage} className={styles.fieldset}>
        <div className={styles.layout}>
          <div className={styles.col}>
            <Panel title="Code and discount">
              <div className={styles.grid}>
                <TextField
                  label="Code"
                  autoCapitalize="characters"
                  hint="Letters and numbers, 3 to 32 characters."
                  error={e.code?.message}
                  {...register("code")}
                />
                <TextField label="Internal description" optional error={e.description?.message} {...register("description")} />
                <SelectField label="Type" {...register("type")}>
                  <option value="PERCENTAGE">Percentage off</option>
                  <option value="FIXED_AMOUNT">Fixed amount off</option>
                </SelectField>
                <TextField
                  label={type === "PERCENTAGE" ? "Percent off" : "Amount off (₹)"}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  error={e.value?.message}
                  {...register("value")}
                />
                <TextField
                  label="Minimum order (₹)"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  error={e.minOrder?.message}
                  {...register("minOrder")}
                />
                {type === "PERCENTAGE" && (
                  <TextField
                    label="Maximum discount (₹)"
                    optional
                    type="number"
                    inputMode="decimal"
                    min={0}
                    error={e.maxDiscount?.message}
                    {...register("maxDiscount", { setValueAs: emptyToNull })}
                  />
                )}
              </div>
            </Panel>

            <Panel title="Schedule and limits">
              <div className={styles.grid}>
                <TextField label="Starts" optional type="datetime-local" error={e.startsAt?.message} {...register("startsAt")} />
                <TextField label="Ends" optional type="datetime-local" error={e.endsAt?.message} {...register("endsAt")} />
                <TextField
                  label="Total uses"
                  optional
                  type="number"
                  inputMode="numeric"
                  min={1}
                  hint="Leave empty for unlimited."
                  error={e.usageLimit?.message}
                  {...register("usageLimit", { setValueAs: emptyToNull })}
                />
                <TextField
                  label="Uses per customer"
                  optional
                  type="number"
                  inputMode="numeric"
                  min={1}
                  error={e.perCustomerLimit?.message}
                  {...register("perCustomerLimit", { setValueAs: emptyToNull })}
                />
              </div>
            </Panel>

            <Panel title="Who can use it">
              <div className={styles.checks}>
                <Checkbox label="Active" {...register("isActive")} />
                <Checkbox label="First order only" {...register("firstOrderOnly")} />
                <Checkbox label="New customers only (signed up recently, no past orders)" {...register("newCustomersOnly")} />
                <Checkbox label="Can be combined with other coupons" {...register("isStackable")} />
              </div>
            </Panel>
          </div>

          <div className={styles.col}>
            {coupon && (
              <Panel title="Performance">
                <dl className={styles.stats}>
                  <div>
                    <dt>Times used</dt>
                    <dd>
                      {coupon.usedCount}
                      {coupon.usageLimit !== null && ` of ${coupon.usageLimit}`}
                    </dd>
                  </div>
                  <div>
                    <dt>Total discount given</dt>
                    <dd>{formatINR(coupon.totalDiscountPaise)}</dd>
                  </div>
                </dl>
              </Panel>
            )}
            <Panel
              title="Applies to"
              description={
                (productIds?.length ?? 0) + (categoryIds?.length ?? 0) === 0
                  ? "Every product. Choose categories or products to limit it."
                  : "Only the chosen categories and products."
              }
            >
              <fieldset className={styles.scope}>
                <legend className={styles.legend}>Categories</legend>
                <div className={styles.scroll}>
                  {categories.map((c) => (
                    <Checkbox key={c.id} value={c.id} label={c.name} {...register("categoryIds")} />
                  ))}
                </div>
              </fieldset>
              <fieldset className={styles.scope}>
                <legend className={styles.legend}>Products ({productIds?.length ?? 0} chosen)</legend>
                <TextField
                  label="Filter products"
                  type="search"
                  value={productFilter}
                  onChange={(ev) => setProductFilter(ev.target.value)}
                />
                <div className={styles.scroll}>
                  {products.map((p) => (
                    <div key={p.id} hidden={Boolean(needle) && !`${p.name} ${p.sku}`.toLowerCase().includes(needle)}>
                      <Checkbox value={p.id} label={p.name} {...register("productIds")} />
                    </div>
                  ))}
                </div>
              </fieldset>
            </Panel>
          </div>
        </div>
      </fieldset>
      {canManage && (
        <div className={styles.saveBar}>
          <p className={styles.note}>{formState.isDirty ? "You have unsaved changes." : coupon ? "All changes saved." : "New coupon"}</p>
          <Button type="submit" loading={formState.isSubmitting}>
            {coupon ? "Save coupon" : "Create coupon"}
          </Button>
        </div>
      )}
    </form>
  );
}
