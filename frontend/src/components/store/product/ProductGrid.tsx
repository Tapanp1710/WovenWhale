import type { ProductCardDTO } from "@wovenwhale/backend/contracts";
import { ProductCard } from "./ProductCard";
import styles from "./ProductGrid.module.css";

export function ProductGrid({
  products,
  preloadFirst = 0,
  columns = 4,
}: {
  products: ProductCardDTO[];
  preloadFirst?: number;
  columns?: 3 | 4;
}) {
  return (
    <ul className={`${styles.grid} ${columns === 3 ? styles.three : ""}`}>
      {products.map((p, i) => (
        <li key={p.id}>
          <ProductCard product={p} preload={i < preloadFirst} />
        </li>
      ))}
    </ul>
  );
}
