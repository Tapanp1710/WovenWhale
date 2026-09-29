"use client";

import type { AdminCategoryDTO, AdminProductRowDTO, Paginated } from "@wovenwhale/backend/contracts";
import { Reorder, useDragControls } from "framer-motion";
import { ArrowDown, ArrowUp, GripVertical, ImagePlus, Plus, Trash2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox, SelectField, TextField } from "@/components/ui/Field";
import { api } from "@/lib/api/client";
import styles from "./fields.module.css";
import { MediaPicker } from "./MediaPicker";

type Cta = { label: string; href: string } | null;
type Img = { url: string; alt: string };
type LinkedImg = Img & { href: string | null };

/** Move an item one place up (-1) or down (+1). */
export function moveItem<T>(list: T[], index: number, by: -1 | 1): T[] {
  const next = [...list];
  const [item] = next.splice(index, 1);
  next.splice(index + by, 0, item!);
  return next;
}

export function ItemTools({ index, count, onChange, name }: { index: number; count: number; onChange: (by: -1 | 1 | 0) => void; name: string }) {
  return (
    <span className={styles.tools}>
      <button type="button" className={styles.tool} disabled={index === 0} onClick={() => onChange(-1)} aria-label={`Move ${name} up`}>
        <ArrowUp size={15} aria-hidden="true" />
      </button>
      <button type="button" className={styles.tool} disabled={index === count - 1} onClick={() => onChange(1)} aria-label={`Move ${name} down`}>
        <ArrowDown size={15} aria-hidden="true" />
      </button>
      <button type="button" className={`${styles.tool} ${styles.danger}`} onClick={() => onChange(0)} aria-label={`Remove ${name}`}>
        <Trash2 size={15} aria-hidden="true" />
      </button>
    </span>
  );
}

export function Group({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <fieldset className={styles.group}>
      <legend className={styles.legend}>{title}</legend>
      {hint && <p className={styles.hint}>{hint}</p>}
      {children}
    </fieldset>
  );
}

/** A button or link: text plus where it goes. Off means the section shows none. */
export function CtaField({ label, value, onChange }: { label: string; value: Cta; onChange: (value: Cta) => void }) {
  return (
    <Group title={label}>
      <Checkbox label={`Show ${label.toLowerCase()}`} checked={value !== null} onChange={(e) => onChange(e.target.checked ? { label: "Shop now", href: "/shop" } : null)} />
      {value && (
        <div className={styles.pair}>
          <TextField label="Text" value={value.label} onChange={(e) => onChange({ ...value, label: e.target.value })} />
          <TextField label="Link" value={value.href} onChange={(e) => onChange({ ...value, href: e.target.value })} hint="/shop, /shop/ikat or https://…" />
        </div>
      )}
    </Group>
  );
}

function Thumb({ url }: { url: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className={styles.thumb} />;
}

/** One image: choose or replace from the media library, describe it, or remove it. */
export function ImageField({ label, value, onChange, hint }: { label: string; value: Img | null; onChange: (value: Img | null) => void; hint?: string }) {
  const [picking, setPicking] = useState(false);
  return (
    <Group title={label} hint={hint}>
      {value ? (
        <div className={styles.imageRow}>
          <Thumb url={value.url} />
          <div className={styles.imageBody}>
            <TextField label="Alt text" value={value.alt} onChange={(e) => onChange({ ...value, alt: e.target.value })} hint="Describe the photo for screen readers." />
            <div className={styles.inline}>
              <Button size="sm" variant="secondary" onClick={() => setPicking(true)}>
                Replace image
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onChange(null)}>
                Remove
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="secondary" icon={<ImagePlus size={15} aria-hidden="true" />} onClick={() => setPicking(true)}>
          Choose image
        </Button>
      )}
      <MediaPicker open={picking} onOpenChange={setPicking} onSelect={(img) => onChange(img)} />
    </Group>
  );
}

function ImageRow({
  image,
  index,
  count,
  onChange,
  onReplace,
  onMove,
}: {
  image: LinkedImg;
  index: number;
  count: number;
  onChange: (value: LinkedImg) => void;
  onReplace: () => void;
  onMove: (by: -1 | 1 | 0) => void;
}) {
  const drag = useDragControls();
  return (
    <Reorder.Item value={image} dragListener={false} dragControls={drag} className={styles.listItem}>
      <button type="button" className={styles.grip} onPointerDown={(e) => drag.start(e)} aria-label={`Drag image ${index + 1}`}>
        <GripVertical size={16} aria-hidden="true" />
      </button>
      <Thumb url={image.url} />
      <div className={styles.imageBody}>
        <TextField label={`Alt text, image ${index + 1}`} value={image.alt} onChange={(e) => onChange({ ...image, alt: e.target.value })} />
        <TextField
          label="Opens (optional)"
          value={image.href ?? ""}
          onChange={(e) => onChange({ ...image, href: e.target.value.trim() ? e.target.value : null })}
          placeholder="/product/…"
        />
        <div className={styles.inline}>
          <Button size="sm" variant="secondary" onClick={onReplace}>
            Replace image
          </Button>
          <ItemTools index={index} count={count} onChange={onMove} name={`image ${index + 1}`} />
        </div>
      </div>
    </Reorder.Item>
  );
}

/** Several images in order: drag (or the arrows) to reorder, replace, describe, link, remove. */
export function ImageListField({
  label,
  hint,
  value,
  onChange,
  max,
}: {
  label: string;
  hint?: ReactNode;
  value: LinkedImg[];
  onChange: (value: LinkedImg[]) => void;
  max: number;
}) {
  const [picking, setPicking] = useState<number | "new" | null>(null);
  const [dragging, setDragging] = useState<LinkedImg[] | null>(null);
  const list = dragging ?? value;
  return (
    <Group title={label} hint={hint}>
      {list.length > 0 && (
        <Reorder.Group
          axis="y"
          values={list}
          onReorder={setDragging}
          className={styles.list}
          onPointerUp={() => {
            if (dragging) onChange(dragging);
            setDragging(null);
          }}
        >
          {list.map((img, i) => (
            <ImageRow
              key={`${img.url}-${i}`}
              image={img}
              index={i}
              count={list.length}
              onChange={(v) => onChange(value.map((x, j) => (j === i ? v : x)))}
              onReplace={() => setPicking(i)}
              onMove={(by) => onChange(by === 0 ? value.filter((_, j) => j !== i) : moveItem(value, i, by))}
            />
          ))}
        </Reorder.Group>
      )}
      {value.length < max && (
        <Button size="sm" variant="secondary" icon={<ImagePlus size={15} aria-hidden="true" />} onClick={() => setPicking("new")}>
          Add image
        </Button>
      )}
      <MediaPicker
        open={picking !== null}
        onOpenChange={(o) => !o && setPicking(null)}
        onSelect={(img) => {
          if (picking === "new") onChange([...value, { ...img, href: null }]);
          else if (typeof picking === "number") onChange(value.map((x, j) => (j === picking ? { ...x, url: img.url, alt: img.alt || x.alt } : x)));
        }}
      />
    </Group>
  );
}

/** Products picked by hand, in order. Search finds active products by name or SKU. */
export function ProductPicker({
  value,
  onChange,
  names,
  onNames,
  max,
  label = "Products",
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  names: Record<string, string>;
  onNames: (names: Record<string, string>) => void;
  max: number;
  label?: string;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<AdminProductRowDTO[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) return setResults([]);
    const t = setTimeout(async () => {
      const res = await api<Paginated<AdminProductRowDTO>>(`/admin/catalog/products?status=ACTIVE&pageSize=8&q=${encodeURIComponent(q.trim())}`).catch(
        () => null,
      );
      setResults(res?.items ?? []);
      if (res) onNames(Object.fromEntries(res.items.map((p) => [p.id, p.name])));
    }, 250);
    return () => clearTimeout(t);
  }, [q, onNames]);

  return (
    <Group title={label} hint={value.length >= max ? `Up to ${max}.` : undefined}>
      {value.length > 0 && (
        <ol className={styles.list}>
          {value.map((id, i) => (
            <li key={id} className={styles.textItem}>
              <span>{names[id] ?? "Product"}</span>
              <ItemTools
                index={i}
                count={value.length}
                name={names[id] ?? "product"}
                onChange={(by) => onChange(by === 0 ? value.filter((x) => x !== id) : moveItem(value, i, by))}
              />
            </li>
          ))}
        </ol>
      )}
      {value.length < max && (
        <>
          <TextField label="Find a product" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or SKU" />
          {results.length > 0 && (
            <ul className={styles.results}>
              {results
                .filter((p) => !value.includes(p.id))
                .map((p) => (
                  <li key={p.id}>
                    <button type="button" className={styles.result} onClick={() => onChange([...value, p.id])}>
                      <Plus size={14} aria-hidden="true" /> {p.name} <span className={styles.muted}>{p.sku}</span>
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </>
      )}
    </Group>
  );
}

/** Collections in the order they should appear. Empty means "every collection with photos". */
export function CategoryPicker({ categories, value, onChange }: { categories: AdminCategoryDTO[]; value: string[]; onChange: (slugs: string[]) => void }) {
  const nameOf = (slug: string) => categories.find((c) => c.slug === slug)?.name ?? slug;
  const available = categories.filter((c) => !value.includes(c.slug));
  return (
    <Group title="Collections" hint={value.length ? undefined : "Showing every collection that has photos. Add some to choose which, and in what order."}>
      {value.length > 0 && (
        <ol className={styles.list}>
          {value.map((slug, i) => (
            <li key={slug} className={styles.textItem}>
              <span>{nameOf(slug)}</span>
              <ItemTools
                index={i}
                count={value.length}
                name={nameOf(slug)}
                onChange={(by) => onChange(by === 0 ? value.filter((x) => x !== slug) : moveItem(value, i, by))}
              />
            </li>
          ))}
        </ol>
      )}
      {available.length > 0 && value.length < 12 && (
        <SelectField label="Add a collection" value="" onChange={(e) => e.target.value && onChange([...value, e.target.value])}>
          <option value="">Choose…</option>
          {available.map((c) => (
            <option key={c.id} value={c.slug}>
              {c.name}
            </option>
          ))}
        </SelectField>
      )}
    </Group>
  );
}
