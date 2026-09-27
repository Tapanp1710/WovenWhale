"use client";

import type { CatalogFacets } from "@wovenwhale/backend/contracts";
import { ArrowDownUp, SlidersHorizontal, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { useFilterNavigation } from "@/hooks/useFilterNavigation";
import { activeFilterCount, MULTI_KEYS, SORT_OPTIONS } from "@/lib/catalog-params";
import { FilterControls } from "./FilterControls";
import styles from "./CatalogToolbar.module.css";

const LABELS: Record<string, string> = { availability: "In stock", discount: "% off or more" };

/** Result count, active filter chips, sort control and the mobile filter/sort drawers. */
export function CatalogToolbar({ facets, total }: { facets: CatalogFacets; total: number }) {
  const { params, set, toggle, clearAll, pending } = useFilterNavigation();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const sort = params.get("sort") ?? "featured";
  const count = activeFilterCount(params);

  const chips: { key: string; label: string; remove: () => void }[] = [];
  for (const key of MULTI_KEYS) {
    for (const value of params.get(key)?.split(",").filter(Boolean) ?? []) {
      chips.push({ key: `${key}:${value}`, label: key === "size" ? `Size ${value}` : value, remove: () => toggle(key, value) });
    }
  }
  if (params.get("availability"))
    chips.push({ key: "availability", label: LABELS.availability!, remove: () => set({ availability: null }) });
  if (params.get("discount"))
    chips.push({ key: "discount", label: `${params.get("discount")}${LABELS.discount}`, remove: () => set({ discount: null }) });
  const min = params.get("minPrice");
  const max = params.get("maxPrice");
  if (min || max) {
    chips.push({
      key: "price",
      label: min && max ? `₹${min} to ₹${max}` : min ? `₹${min} and above` : `Under ₹${Number(max) + 1}`,
      remove: () => set({ minPrice: null, maxPrice: null }),
    });
  }

  return (
    <div className={styles.toolbar} aria-busy={pending}>
      <div className={styles.row}>
        <p className={styles.count} aria-live="polite">
          {total} {total === 1 ? "style" : "styles"}
        </p>

        <div className={styles.mobileButtons}>
          <Button
            variant="secondary"
            size="sm"
            icon={<SlidersHorizontal size={16} aria-hidden="true" />}
            onClick={() => setFiltersOpen(true)}
          >
            Filter{count > 0 ? ` (${count})` : ""}
          </Button>
          <Button variant="secondary" size="sm" icon={<ArrowDownUp size={16} aria-hidden="true" />} onClick={() => setSortOpen(true)}>
            Sort
          </Button>
        </div>

        <label className={styles.sort}>
          <span>Sort by</span>
          <select value={sort} onChange={(e) => set({ sort: e.target.value === "featured" ? null : e.target.value })}>
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {chips.length > 0 && (
        <ul className={styles.chips} aria-label="Active filters">
          {chips.map((c) => (
            <li key={c.key}>
              <button type="button" onClick={c.remove} aria-label={`Remove filter ${c.label}`}>
                {c.label}
                <X size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
          <li>
            <button type="button" className={styles.clear} onClick={clearAll}>
              Clear all
            </button>
          </li>
        </ul>
      )}

      <Sheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        title="Filter"
        side="bottom"
        footer={
          <div className={styles.sheetFooter}>
            <Button variant="ghost" onClick={clearAll} disabled={count === 0}>
              Clear all
            </Button>
            <Button onClick={() => setFiltersOpen(false)} loading={pending}>
              Show {total} {total === 1 ? "style" : "styles"}
            </Button>
          </div>
        }
      >
        <FilterControls facets={facets} />
      </Sheet>

      <Sheet open={sortOpen} onOpenChange={setSortOpen} title="Sort by" side="bottom">
        <ul className={styles.sortList} role="radiogroup" aria-label="Sort by">
          {SORT_OPTIONS.map((o) => (
            <li key={o.value}>
              <button
                type="button"
                role="radio"
                aria-checked={sort === o.value}
                onClick={() => {
                  set({ sort: o.value === "featured" ? null : o.value });
                  setSortOpen(false);
                }}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    </div>
  );
}
