"use client";

import { PRODUCT_SOURCES, type AdminCategoryDTO, type PageSection, type SectionOf, type SectionType } from "@wovenwhale/backend/contracts";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Checkbox, SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import { CategoryPicker, CtaField, Group, ImageField, ImageListField, ItemTools, moveItem, ProductPicker } from "./fields";
import styles from "./WebsiteEditor.module.css";

export interface InspectorContext {
  categories: AdminCategoryDTO[];
  productNames: Record<string, string>;
  onProductNames: (names: Record<string, string>) => void;
}

/** Changes to a section's settings; `field` groups rapid typing into one undo step. */
type Edit<T extends SectionType> = (settings: SectionOf<T>["settings"], field?: string) => void;

const SOURCE_LABELS: Record<(typeof PRODUCT_SOURCES)[number], string> = {
  new: "New arrivals",
  best: "Best sellers",
  featured: "Featured products",
  category: "A collection",
  selected: "Products I pick",
};

export function SectionInspector({ section, onChange, ctx }: { section: PageSection; onChange: (s: PageSection, field?: string) => void; ctx: InspectorContext }) {
  const edit =
    <T extends SectionType>(s: SectionOf<T>): Edit<T> =>
    (settings, field) =>
      onChange({ ...s, settings } as PageSection, field);
  switch (section.type) {
    case "hero":
      return <HeroForm s={section} set={edit(section)} />;
    case "categories":
      return <CategoriesForm s={section} set={edit(section)} ctx={ctx} />;
    case "products":
      return <ProductsForm s={section} set={edit(section)} ctx={ctx} />;
    case "editorial":
      return <EditorialForm s={section} set={edit(section)} ctx={ctx} />;
    case "promo":
      return <PromoForm s={section} set={edit(section)} ctx={ctx} />;
    case "story":
      return <StoryForm s={section} set={edit(section)} />;
    case "newsletter":
      return (
        <div className={styles.form}>
          <TextField label="Title" value={section.settings.title} onChange={(e) => edit(section)({ ...section.settings, title: e.target.value }, "title")} />
          <TextAreaField label="Text" rows={3} value={section.settings.text} onChange={(e) => edit(section)({ ...section.settings, text: e.target.value }, "text")} />
        </div>
      );
    case "banner":
      return <BannerForm s={section} set={edit(section)} />;
    case "text":
      return <TextForm s={section} set={edit(section)} />;
    case "gallery":
      return (
        <div className={styles.form}>
          <TextField label="Title (optional)" value={section.settings.title} onChange={(e) => edit(section)({ ...section.settings, title: e.target.value }, "title")} />
          <ImageListField label="Photos" value={section.settings.images} max={12} onChange={(images) => edit(section)({ ...section.settings, images })} />
        </div>
      );
    case "spacer":
      return (
        <div className={styles.form}>
          <SelectField label="Space" value={section.settings.size} onChange={(e) => edit(section)({ size: e.target.value as "sm" | "md" | "lg" })}>
            <option value="sm">Small</option>
            <option value="md">Medium</option>
            <option value="lg">Large</option>
          </SelectField>
        </div>
      );
  }
}

function HeroForm({ s, set }: { s: SectionOf<"hero">; set: Edit<"hero"> }) {
  const v = s.settings;
  return (
    <div className={styles.form}>
      <TextField label="Heading" value={v.heading} onChange={(e) => set({ ...v, heading: e.target.value }, "heading")} />
      <TextAreaField label="Subtitle" rows={3} value={v.subtitle} onChange={(e) => set({ ...v, subtitle: e.target.value }, "subtitle")} />
      <SelectField label="Text alignment" value={v.align} onChange={(e) => set({ ...v, align: e.target.value as "left" | "center" })}>
        <option value="left">Left</option>
        <option value="center">Centre</option>
      </SelectField>
      <CtaField label="First button" value={v.primary} onChange={(primary) => set({ ...v, primary }, "primary")} />
      <CtaField label="Second button" value={v.secondary} onChange={(secondary) => set({ ...v, secondary }, "secondary")} />
      <ImageListField
        label="Photo strips"
        hint={v.images.length ? "Shown as tall strips, in this order. Six fit on a desktop screen, four on a phone." : "Automatic: photos of featured and new products, each opening its product. Add images to choose your own."}
        value={v.images}
        max={8}
        onChange={(images) => set({ ...v, images })}
      />
    </div>
  );
}

function CategoriesForm({ s, set, ctx }: { s: SectionOf<"categories">; set: Edit<"categories">; ctx: InspectorContext }) {
  const v = s.settings;
  return (
    <div className={styles.form}>
      <TextField label="Title" value={v.title} onChange={(e) => set({ ...v, title: e.target.value }, "title")} />
      <TextField label="How many to show" type="number" min={1} max={12} value={v.limit} onChange={(e) => set({ ...v, limit: clamp(e.target.value, 1, 12) }, "limit")} />
      <CtaField label="Link" value={v.link} onChange={(link) => set({ ...v, link }, "link")} />
      <CategoryPicker categories={ctx.categories} value={v.categorySlugs} onChange={(categorySlugs) => set({ ...v, categorySlugs })} />
    </div>
  );
}

function ProductsForm({ s, set, ctx }: { s: SectionOf<"products">; set: Edit<"products">; ctx: InspectorContext }) {
  const v = s.settings;
  return (
    <div className={styles.form}>
      <TextField label="Title" value={v.title} onChange={(e) => set({ ...v, title: e.target.value }, "title")} />
      <TextField label="Subtitle (optional)" value={v.intro} onChange={(e) => set({ ...v, intro: e.target.value }, "intro")} />
      <SelectField label="Products from" value={v.source} onChange={(e) => set({ ...v, source: e.target.value as typeof v.source })}>
        {PRODUCT_SOURCES.map((src) => (
          <option key={src} value={src}>
            {SOURCE_LABELS[src]}
          </option>
        ))}
      </SelectField>
      {v.source === "category" && (
        <SelectField label="Collection" value={v.categorySlug ?? ""} onChange={(e) => set({ ...v, categorySlug: e.target.value || null })}>
          <option value="">Choose…</option>
          {ctx.categories.map((c) => (
            <option key={c.id} value={c.slug}>
              {c.name}
            </option>
          ))}
        </SelectField>
      )}
      {v.source === "selected" && (
        <ProductPicker value={v.productIds} onChange={(productIds) => set({ ...v, productIds })} names={ctx.productNames} onNames={ctx.onProductNames} max={24} />
      )}
      <div className={styles.pair}>
        <TextField label="How many" type="number" min={1} max={12} value={v.limit} onChange={(e) => set({ ...v, limit: clamp(e.target.value, 1, 12) }, "limit")} />
        <SelectField label="Columns" value={v.columns} onChange={(e) => set({ ...v, columns: Number(e.target.value) === 3 ? 3 : 4 })}>
          <option value={4}>4</option>
          <option value={3}>3</option>
        </SelectField>
      </div>
      <CtaField label="Link" value={v.link} onChange={(link) => set({ ...v, link }, "link")} />
      <p className={styles.note}>Prices, stock and photos always come from the catalogue. Sold-out products are left out.</p>
    </div>
  );
}

function EditorialForm({ s, set, ctx }: { s: SectionOf<"editorial">; set: Edit<"editorial">; ctx: InspectorContext }) {
  const v = s.settings;
  const setItem = (i: number, patch: Partial<(typeof v.items)[number]>) => set({ ...v, items: v.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) }, `item-${i}`);
  return (
    <div className={styles.form}>
      <TextField label="Title" value={v.title} onChange={(e) => set({ ...v, title: e.target.value }, "title")} />
      <TextAreaField label="Text" rows={4} value={v.body} onChange={(e) => set({ ...v, body: e.target.value }, "body")} />
      <ProductPicker
        label="Photo from product"
        value={v.productId ? [v.productId] : []}
        onChange={(ids) => set({ ...v, productId: ids[0] ?? null })}
        names={ctx.productNames}
        onNames={ctx.onProductNames}
        max={1}
      />
      {!v.productId && <p className={styles.note}>Automatic: a best seller with a photo.</p>}
      <Group title="List">
        {v.items.map((it, i) => (
          <div key={i} className={styles.card}>
            <div className={styles.cardHead}>
              <strong>{it.name || `Item ${i + 1}`}</strong>
              <ItemTools index={i} count={v.items.length} name={it.name || `item ${i + 1}`} onChange={(by) => set({ ...v, items: by === 0 ? v.items.filter((_, j) => j !== i) : moveItem(v.items, i, by) })} />
            </div>
            <TextField label="Name" value={it.name} onChange={(e) => setItem(i, { name: e.target.value })} />
            <TextField label="Link (optional)" value={it.href ?? ""} onChange={(e) => setItem(i, { href: e.target.value.trim() ? e.target.value : null })} />
            <TextAreaField label="Text" rows={3} value={it.text} onChange={(e) => setItem(i, { text: e.target.value })} />
          </div>
        ))}
        {v.items.length < 6 && (
          <Button size="sm" variant="secondary" icon={<Plus size={15} aria-hidden="true" />} onClick={() => set({ ...v, items: [...v.items, { name: "New item", href: null, text: "" }] })}>
            Add to list
          </Button>
        )}
      </Group>
    </div>
  );
}

function PromoForm({ s, set, ctx }: { s: SectionOf<"promo">; set: Edit<"promo">; ctx: InspectorContext }) {
  const v = s.settings;
  return (
    <div className={styles.form}>
      <TextField label="Title" value={v.title} onChange={(e) => set({ ...v, title: e.target.value }, "title")} />
      <TextAreaField
        label="Text"
        rows={3}
        value={v.text}
        onChange={(e) => set({ ...v, text: e.target.value }, "text")}
        hint="{count} becomes the number of styles in the collection, {styles} becomes “style” or “styles”."
      />
      <SelectField label="Collection (optional)" value={v.categorySlug ?? ""} onChange={(e) => set({ ...v, categorySlug: e.target.value || null })}>
        <option value="">None</option>
        {ctx.categories.map((c) => (
          <option key={c.id} value={c.slug}>
            {c.name}
          </option>
        ))}
      </SelectField>
      {v.categorySlug && <p className={styles.note}>The strip only shows while this collection exists.</p>}
      <CtaField label="Link" value={v.link} onChange={(link) => set({ ...v, link }, "link")} />
    </div>
  );
}

function StoryForm({ s, set }: { s: SectionOf<"story">; set: Edit<"story"> }) {
  const v = s.settings;
  return (
    <div className={styles.form}>
      <TextField label="Title" value={v.title} onChange={(e) => set({ ...v, title: e.target.value }, "title")} />
      <TextAreaField label="Text" rows={5} value={v.body} onChange={(e) => set({ ...v, body: e.target.value }, "body")} hint="Leave a blank line between paragraphs." />
      <CtaField label="Link" value={v.link} onChange={(link) => set({ ...v, link }, "link")} />
      <Checkbox label="Show delivery, returns and payment promises" checked={v.showReassurance} onChange={(e) => set({ ...v, showReassurance: e.target.checked })} />
    </div>
  );
}

function BannerForm({ s, set }: { s: SectionOf<"banner">; set: Edit<"banner"> }) {
  const v = s.settings;
  return (
    <div className={styles.form}>
      <TextField label="Heading" value={v.heading} onChange={(e) => set({ ...v, heading: e.target.value }, "heading")} />
      <TextAreaField label="Subtitle" rows={3} value={v.subtitle} onChange={(e) => set({ ...v, subtitle: e.target.value }, "subtitle")} />
      <SelectField label="Text position" value={v.align} onChange={(e) => set({ ...v, align: e.target.value as typeof v.align })}>
        <option value="left">Left</option>
        <option value="center">Centre</option>
        <option value="right">Right</option>
      </SelectField>
      <TextField
        label={`Darken the image: ${v.overlay}%`}
        type="range"
        min={0}
        max={80}
        step={5}
        value={v.overlay}
        onChange={(e) => set({ ...v, overlay: clamp(e.target.value, 0, 80) }, "overlay")}
        hint="Keeps white text readable on bright photos."
      />
      <CtaField label="Button" value={v.cta} onChange={(cta) => set({ ...v, cta }, "cta")} />
      <ImageField label="Image" value={v.image} onChange={(image) => set({ ...v, image })} hint="A wide photo works best (about 16:7)." />
      <ImageField label="Phone image (optional)" value={v.mobileImage} onChange={(mobileImage) => set({ ...v, mobileImage })} hint="Used on screens narrower than 640px. A tall photo works best." />
    </div>
  );
}

function TextForm({ s, set }: { s: SectionOf<"text">; set: Edit<"text"> }) {
  const v = s.settings;
  return (
    <div className={styles.form}>
      <TextField label="Heading (optional)" value={v.heading} onChange={(e) => set({ ...v, heading: e.target.value }, "heading")} />
      <TextAreaField label="Text" rows={6} value={v.body} onChange={(e) => set({ ...v, body: e.target.value }, "body")} hint="Leave a blank line between paragraphs." />
      <SelectField label="Alignment" value={v.align} onChange={(e) => set({ ...v, align: e.target.value as "left" | "center" })}>
        <option value="left">Left</option>
        <option value="center">Centre</option>
      </SelectField>
      <CtaField label="Button" value={v.cta} onChange={(cta) => set({ ...v, cta }, "cta")} />
    </div>
  );
}

function clamp(raw: string, min: number, max: number) {
  const n = Math.round(Number(raw));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
}
