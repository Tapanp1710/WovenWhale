import { ORDER_SORTS, ORDER_STATUSES, PAYMENT_METHODS, PAYMENT_STATUSES } from "@wovenwhale/backend/contracts";
import { SelectField, TextField } from "@/components/ui/Field";
import { ORDER_STATUS_ADMIN_LABELS, PAYMENT_STATUS_ADMIN_LABELS } from "../labels";
import { FilterForm } from "../ui/FilterForm";

const SORT_LABELS: Record<(typeof ORDER_SORTS)[number], string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  "total-high": "Highest total",
  "total-low": "Lowest total",
};

export const PAYMENT_METHOD_LABELS = { PREPAID: "Prepaid", COD: "Cash on delivery" } as const;

export function OrderFilters({ params }: { params: Record<string, string> }) {
  const has = Object.keys(params).some((k) => k !== "page" && k !== "sort");
  return (
    <FilterForm key={JSON.stringify(params)} hasFilters={has}>
      <TextField label="Search" name="q" type="search" placeholder="Order number, name or phone" defaultValue={params.q} />
      <SelectField label="Order status" name="status" defaultValue={params.status ?? ""}>
        <option value="">Any status</option>
        {ORDER_STATUSES.map((s) => (
          <option key={s} value={s}>
            {ORDER_STATUS_ADMIN_LABELS[s]}
          </option>
        ))}
      </SelectField>
      <SelectField label="Payment status" name="paymentStatus" defaultValue={params.paymentStatus ?? ""}>
        <option value="">Any payment status</option>
        {PAYMENT_STATUSES.map((s) => (
          <option key={s} value={s}>
            {PAYMENT_STATUS_ADMIN_LABELS[s]}
          </option>
        ))}
      </SelectField>
      <SelectField label="Payment method" name="paymentMethod" defaultValue={params.paymentMethod ?? ""}>
        <option value="">Any method</option>
        {PAYMENT_METHODS.map((m) => (
          <option key={m} value={m}>
            {PAYMENT_METHOD_LABELS[m]}
          </option>
        ))}
      </SelectField>
      <TextField label="Placed from" name="from" type="date" defaultValue={params.from} />
      <TextField label="Placed to" name="to" type="date" defaultValue={params.to} />
      <SelectField label="Sort" name="sort" defaultValue={params.sort ?? "newest"}>
        {ORDER_SORTS.map((s) => (
          <option key={s} value={s}>
            {SORT_LABELS[s]}
          </option>
        ))}
      </SelectField>
    </FilterForm>
  );
}
