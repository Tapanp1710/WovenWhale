"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { categoryUpsertSchema, type AdminCategoryDTO } from "@wovenwhale/backend/contracts";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Checkbox, TextAreaField, TextField } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import { api } from "@/lib/api/client";
import { serverErrors, useAction, useCan } from "../AdminContext";
import { Badge } from "../ui/Badge";
import { PageHeader } from "../ui/PageHeader";
import { Panel } from "../ui/Panel";
import { cell, Table } from "../ui/Table";
import styles from "./CategoryManager.module.css";

type Input = z.input<typeof categoryUpsertSchema>;

export function CategoryManager({ categories }: { categories: AdminCategoryDTO[] }) {
  const canManage = useCan("products.manage");
  const [editing, setEditing] = useState<AdminCategoryDTO | null | undefined>(undefined);

  return (
    <>
      <PageHeader
        title="Categories"
        description="Group products for navigation and coupons. Hidden categories stay assignable but don't appear in the store."
        actions={
          canManage && (
            <Button size="sm" onClick={() => setEditing(null)} icon={<Plus size={16} aria-hidden="true" />}>
              Add category
            </Button>
          )
        }
      />
      <Panel flush>
        <Table label="Categories" minWidth={640}>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Slug</th>
              <th scope="col" className={cell.num}>
                Products
              </th>
              <th scope="col" className={cell.num}>
                Order
              </th>
              <th scope="col">Visibility</th>
              {canManage && (
                <th scope="col" className={cell.actions}>
                  <span className="visually-hidden">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.id}>
                <td className={cell.strong}>{c.name}</td>
                <td className={cell.muted}>{c.slug}</td>
                <td className={cell.num}>{c.productCount}</td>
                <td className={cell.num}>{c.sortOrder}</td>
                <td>
                  {c.isActive ? <Badge tone="success">Active</Badge> : <Badge>Hidden</Badge>}{" "}
                  {c.isActive && !c.isNavigable && <Badge tone="info">Not in menu</Badge>}
                </td>
                {canManage && (
                  <td className={cell.actions}>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(c)} aria-label={`Edit ${c.name}`}>
                      Edit
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </Table>
      </Panel>
      {editing !== undefined && <CategoryDialog key={editing?.id ?? "new"} category={editing} onClose={() => setEditing(undefined)} />}
    </>
  );
}

function CategoryDialog({ category, onClose }: { category: AdminCategoryDTO | null; onClose: () => void }) {
  const { run } = useAction();
  const form = useForm<Input, unknown, Input>({
    resolver: zodResolver(categoryUpsertSchema, undefined, { raw: true }),
    defaultValues: {
      name: category?.name ?? "",
      slug: category?.slug ?? "",
      description: category?.description ?? "",
      sortOrder: category?.sortOrder ?? 0,
      isActive: category?.isActive ?? true,
      isNavigable: category?.isNavigable ?? true,
      seoTitle: category?.seoTitle ?? "",
      seoDescription: category?.seoDescription ?? "",
    },
  });
  const e = form.formState.errors;
  const submit = form.handleSubmit(async (values) => {
    const ok = await run(
      () =>
        api(category ? `/admin/catalog/categories/${category.id}` : "/admin/catalog/categories", {
          method: category ? "PUT" : "POST",
          body: values,
        }),
      category ? "Category saved" : "Category created",
      serverErrors(form.setError),
    );
    if (ok) onClose();
  });

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={category ? `Edit ${category.name}` : "Add a category"}
      footer={
        <div className={styles.footer}>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="category-form" loading={form.formState.isSubmitting}>
            {category ? "Save category" : "Create category"}
          </Button>
        </div>
      }
    >
      <form id="category-form" className={styles.form} onSubmit={submit} noValidate>
        <TextField label="Name" error={e.name?.message} {...form.register("name")} />
        <TextField label="URL slug" error={e.slug?.message} {...form.register("slug")} />
        <TextAreaField label="Description" optional rows={3} error={e.description?.message} {...form.register("description")} />
        <TextField
          label="Sort order"
          type="number"
          inputMode="numeric"
          hint="Lower numbers come first."
          error={e.sortOrder?.message}
          {...form.register("sortOrder")}
        />
        <Checkbox label="Active" {...form.register("isActive")} />
        <Checkbox label="Show in the store menu" {...form.register("isNavigable")} />
        <TextField label="SEO title" optional error={e.seoTitle?.message} {...form.register("seoTitle")} />
        <TextAreaField label="SEO description" optional rows={3} error={e.seoDescription?.message} {...form.register("seoDescription")} />
      </form>
    </Sheet>
  );
}
