"use client";

import type { ProductCardDTO } from "@wovenwhale/backend/contracts";
import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { recentlyViewed } from "@/lib/track";
import { Section } from "../home/Section";
import { ProductGrid } from "./ProductGrid";

/** Products this browser viewed recently (ids kept locally; details fetched fresh). */
export function RecentlyViewed({ excludeId }: { excludeId?: string }) {
  const [products, setProducts] = useState<ProductCardDTO[]>([]);

  useEffect(() => {
    const ids = recentlyViewed
      .list()
      .filter((id) => id !== excludeId)
      .slice(0, 4);
    if (ids.length === 0) return;
    api<ProductCardDTO[]>("/catalog/products/by-ids", { method: "POST", body: { ids } })
      .then(setProducts)
      .catch(() => undefined);
  }, [excludeId]);

  if (products.length === 0) return null;
  return (
    <Section id="recently-viewed" title="Recently viewed">
      <ProductGrid products={products} />
    </Section>
  );
}
