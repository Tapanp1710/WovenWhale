"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  discountPercent,
  productUpsertSchema,
  rupeesToPaise,
  type AdminCategoryDTO,
  type AdminProductDetailDTO,
  type ProductUpsertInput,
} from "@wovenwhale/backend/contracts";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/Button";
import { Checkbox, SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import { api } from "@/lib/api/client";
import { serverErrors, useAction, useCan } from "../AdminContext";
import { Panel } from "../ui/Panel";
import styles from "./ProductForm.module.css";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const nullIfEmpty = (v: unknown) => (v === "" ? null : v);

function defaults(p: AdminProductDetailDTO | null): ProductUpsertInput {
  return {
    name: p?.name ?? "",
    slug: p?.slug ?? "",
    sku: p?.sku ?? "",
    shortDescription: p?.shortDescription ?? "",
    description: p?.description ?? "",
    productType: p?.productType ?? "Shirt",
    fabric: p?.fabric ?? "",
    pattern: p?.pattern ?? "",
    color: p?.color ?? "",
    tags: p?.tags ?? [],
    mrp: p ? p.mrpPaise / 100 : "",
    price: p ? p.pricePaise / 100 : "",
    categoryIds: p?.categoryIds ?? [],
    primaryCategoryId: p?.primaryCategoryId ?? null,
    isFeatured: p?.isFeatured ?? false,
    isBestSeller: p?.isBestSeller ?? false,
    isNewArrival: p?.isNewArrival ?? true,
    isActive: p?.isActive ?? true,
    seoTitle: p?.seoTitle ?? "",
    seoDescription: p?.seoDescription ?? "",
  };
}

/**
 * Product fields validated with the API's own productUpsertSchema. Prices are
 * entered in rupees; the raw form values are sent and the API converts them.
 */
export function ProductForm({ product, categories }: { product: AdminProductDetailDTO | null; categories: AdminCategoryDTO[] }) {
  const router = useRouter();
  const canManage = useCan("products.manage");
  const { run } = useAction();
  const form = useForm<ProductUpsertInput, unknown, ProductUpsertInput>({
    resolver: zodResolver(productUpsertSchema, undefined, { raw: true }),
    defaultValues: defaults(product),
  });
  const { register, control, formState } = form;
  const e = formState.errors;
  const [mrp, price, chosen, seoTitle, seoDescription] = useWatch({
    control,
    name: ["mrp", "price", "categoryIds", "seoTitle", "seoDescription"],
  });
  const off = discountPercent(rupeesToPaise(Number(mrp) || 0), rupeesToPaise(Number(price) || 0));
  const chosenIds = chosen ?? [];

  const submit = form.handleSubmit(async (values) => {
    const saved = await run(
      () =>
        api<AdminProductDetailDTO>(product ? `/admin/catalog/products/${product.id}` : "/admin/catalog/products", {
          method: product ? "PUT" : "POST",
          body: values,
        }),
      product ? "Product saved" : "Product created. Add sizes and photos next.",
      serverErrors(form.setError),
    );
    if (saved && !product) router.push(`/admin/products/${saved.id}`);
    if (saved) form.reset(defaults(saved));
  });

  return (
    <form onSubmit={submit} noValidate className={styles.form}>
      <fieldset disabled={!canManage} className={styles.fieldset}>
        <div className={styles.layout}>
          <div className={styles.main}>
            <Panel title="Basics">
              <div className={styles.grid}>
                <TextField
                  label="Name"
                  error={e.name?.message}
                  {...register("name", {
                    onChange: (ev: { target: { value: string } }) => {
                      if (!product && !formState.dirtyFields.slug) form.setValue("slug", slugify(ev.target.value));
                    },
                  })}
                />
                <TextField label="URL slug" hint="Used in the product link." error={e.slug?.message} {...register("slug")} />
                <TextField label="SKU" autoCapitalize="characters" error={e.sku?.message} {...register("sku")} />
                <TextField label="Product type" placeholder="Shirt" error={e.productType?.message} {...register("productType")} />
                <TextField label="Fabric" optional error={e.fabric?.message} {...register("fabric")} />
                <TextField label="Pattern" optional error={e.pattern?.message} {...register("pattern")} />
                <TextField label="Colour" optional error={e.color?.message} {...register("color")} />
              </div>
            </Panel>

            <Panel title="Description">
              <div className={styles.stack}>
                <TextAreaField
                  label="Short description"
                  optional
                  rows={4}
                  error={e.shortDescription?.message}
                  {...register("shortDescription")}
                />
                <TextAreaField
                  label="Full description"
                  optional
                  rows={10}
                  hint="Plain text. Leave a blank line between paragraphs."
                  error={e.description?.message}
                  {...register("description")}
                />
              </div>
            </Panel>

            <Panel title="Search engines" description="Shown in Google results and link previews.">
              <div className={styles.stack}>
                <TextField
                  label="SEO title"
                  optional
                  hint={`${(seoTitle ?? "").length} of 160 characters`}
                  error={e.seoTitle?.message}
                  {...register("seoTitle")}
                />
                <TextAreaField
                  label="SEO description"
                  optional
                  rows={3}
                  hint={`${(seoDescription ?? "").length} of 320 characters`}
                  error={e.seoDescription?.message}
                  {...register("seoDescription")}
                />
              </div>
            </Panel>
          </div>

          <div className={styles.side}>
            <Panel title="Pricing" description="In rupees. Sizes can override these.">
              <div className={styles.stack}>
                <TextField
                  label="Selling price (₹)"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="1"
                  error={e.price?.message}
                  {...register("price")}
                />
                <TextField label="MRP (₹)" type="number" inputMode="decimal" min={0} step="1" error={e.mrp?.message} {...register("mrp")} />
                <p className={styles.note}>{off > 0 ? `Customers see ${off}% off.` : "No discount shown."}</p>
              </div>
            </Panel>

            <Panel title="Categories">
              <fieldset className={styles.checks} aria-describedby={e.categoryIds ? "category-error" : undefined}>
                <legend className="visually-hidden">Categories</legend>
                {categories.map((c) => (
                  <Checkbox key={c.id} value={c.id} label={c.isActive ? c.name : `${c.name} (hidden)`} {...register("categoryIds")} />
                ))}
              </fieldset>
              {e.categoryIds && (
                <p id="category-error" role="alert" className={styles.error}>
                  {e.categoryIds.message}
                </p>
              )}
              <div className={styles.primary}>
                <SelectField
                  label="Primary category"
                  hint="Used for breadcrumbs. Defaults to the first one chosen."
                  {...register("primaryCategoryId", { setValueAs: nullIfEmpty })}
                >
                  <option value="">First chosen</option>
                  {categories
                    .filter((c) => chosenIds.includes(c.id))
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </SelectField>
              </div>
            </Panel>

            <Panel title="Merchandising">
              <div className={styles.checks}>
                <Checkbox label="Active (visible in the store)" {...register("isActive")} />
                <Checkbox label="Featured on the home page" {...register("isFeatured")} />
                <Checkbox label="Best seller" {...register("isBestSeller")} />
                <Checkbox label="New arrival" {...register("isNewArrival")} />
              </div>
            </Panel>

            <Panel title="Tags">
              <Controller
                control={control}
                name="tags"
                render={({ field, fieldState }) => (
                  <TextAreaField
                    label="Tags"
                    rows={3}
                    hint="Separate with commas. Used by search."
                    error={fieldState.error?.message}
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    defaultValue={(field.value ?? []).join(", ")}
                    onChange={(ev) =>
                      field.onChange(
                        ev.target.value
                          .split(",")
                          .map((t) => t.trim())
                          .filter(Boolean),
                      )
                    }
                  />
                )}
              />
            </Panel>
          </div>
        </div>
      </fieldset>

      {canManage && (
        <div className={styles.saveBar}>
          <p className={styles.note}>{formState.isDirty ? "You have unsaved changes." : product ? "All changes saved." : "New product"}</p>
          <Button type="submit" loading={formState.isSubmitting}>
            {product ? "Save product" : "Create product"}
          </Button>
        </div>
      )}
    </form>
  );
}
