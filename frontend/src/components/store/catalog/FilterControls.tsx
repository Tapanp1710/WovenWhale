"use client";

import type { CatalogFacets, FacetOption } from "@wovenwhale/backend/contracts";
import type { CSSProperties, ReactNode } from "react";
import { useFilterNavigation } from "@/hooks/useFilterNavigation";
import { DISCOUNT_OPTIONS, PRICE_BUCKETS, type MultiKey } from "@/lib/catalog-params";
import styles from "./FilterControls.module.css";

/** Swatch colours for the colour facet (display only; values come from the catalog). */
const SWATCH: Record<string, string> = {
  Black: "#1c1c1c",
  White: "#ffffff",
  Ivory: "#f1ead8",
  Grey: "#8a9097",
  Navy: "#1f2f4f",
  Blue: "#4f7fb8",
  Green: "#6f8f6a",
  Maroon: "#6d2330",
  Red: "#b23a3a",
  Pink: "#e2a8b5",
  Mauve: "#a78597",
  Peach: "#f0b89a",
  Yellow: "#d9a21b",
  Beige: "#d5c3a3",
  Brown: "#7a5a43",
};

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className={styles.group}>
      <legend className={styles.legend}>{title}</legend>
      {children}
    </fieldset>
  );
}

function CheckList({ facet, options, label }: { facet: MultiKey; options: FacetOption[]; label: string }) {
  const { values, toggle } = useFilterNavigation();
  const selected = values(facet);
  if (options.length === 0) return null;
  return (
    <Group title={label}>
      <ul className={styles.checks}>
        {options.map((o) => (
          <li key={o.value}>
            <label className={styles.check}>
              <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(facet, o.value)} />
              <span className={styles.checkLabel}>{o.value}</span>
              <span className={styles.count}>{o.count}</span>
            </label>
          </li>
        ))}
      </ul>
    </Group>
  );
}

export function FilterControls({ facets }: { facets: CatalogFacets }) {
  const { values, toggle, set, params } = useFilterNavigation();
  const sizes = values("size");
  const colors = values("color");
  const minPrice = params.get("minPrice");
  const maxPrice = params.get("maxPrice");
  const discount = params.get("discount");

  return (
    <div className={styles.controls}>
      <Group title="Availability">
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={params.get("availability") === "in-stock"}
            onChange={(e) => set({ availability: e.target.checked ? "in-stock" : null })}
          />
          <span className={styles.checkLabel}>In stock only</span>
        </label>
      </Group>

      {facets.sizes.length > 0 && (
        <Group title="Size">
          <div className={styles.sizes}>
            {facets.sizes.map((s) => (
              <button
                key={s.value}
                type="button"
                className={styles.size}
                aria-pressed={sizes.includes(s.value)}
                onClick={() => toggle("size", s.value)}
              >
                {s.value}
              </button>
            ))}
          </div>
        </Group>
      )}

      {facets.colors.length > 0 && (
        <Group title="Colour">
          <ul className={styles.swatches}>
            {facets.colors.map((c) => (
              <li key={c.value}>
                <button
                  type="button"
                  className={styles.swatch}
                  aria-pressed={colors.includes(c.value)}
                  onClick={() => toggle("color", c.value)}
                >
                  <span className={styles.dot} style={{ "--swatch": SWATCH[c.value] ?? "#ccc" } as CSSProperties} aria-hidden="true" />
                  {c.value}
                </button>
              </li>
            ))}
          </ul>
        </Group>
      )}

      <Group title="Price">
        <ul className={styles.checks}>
          {PRICE_BUCKETS.map((b) => {
            const active = (minPrice ?? "") === String(b.min ?? "") && (maxPrice ?? "") === String(b.max ?? "");
            return (
              <li key={b.label}>
                <label className={styles.check}>
                  <input
                    type="radio"
                    name="price"
                    checked={active}
                    onChange={() => set({ minPrice: b.min ? String(b.min) : null, maxPrice: b.max ? String(b.max) : null })}
                  />
                  <span className={styles.checkLabel}>{b.label}</span>
                </label>
              </li>
            );
          })}
        </ul>
        {(minPrice || maxPrice) && (
          <button type="button" className={styles.reset} onClick={() => set({ minPrice: null, maxPrice: null })}>
            Any price
          </button>
        )}
      </Group>

      <Group title="Discount">
        <div className={styles.sizes}>
          {DISCOUNT_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              className={styles.size}
              aria-pressed={discount === String(d)}
              onClick={() => set({ discount: discount === String(d) ? null : String(d) })}
            >
              {d}%+
            </button>
          ))}
        </div>
      </Group>

      <CheckList facet="pattern" label="Weave and print" options={facets.patterns} />
      <CheckList facet="fabric" label="Fabric" options={facets.fabrics} />
      <CheckList facet="type" label="Product type" options={facets.types} />
    </div>
  );
}
