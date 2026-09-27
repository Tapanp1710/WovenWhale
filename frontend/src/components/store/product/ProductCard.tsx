"use client";

import type { ProductCardDTO } from "@wovenwhale/backend/contracts";
import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";
import { Price } from "@/components/ui/Price";
import { useCart } from "../providers/CartProvider";
import { WishlistButton } from "./WishlistButton";
import styles from "./ProductCard.module.css";

export function ProductCard({
  product,
  preload = false,
  sizes = "(min-width: 1280px) 25vw, (min-width: 768px) 33vw, 50vw",
}: {
  product: ProductCardDTO;
  preload?: boolean;
  sizes?: string;
}) {
  const { addItem } = useCart();
  const media = useRef<HTMLDivElement>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [primary, secondary] = product.images;
  const detail = [product.pattern !== "Handwoven" ? product.pattern : null, product.fabric].filter(Boolean).join(", ");

  return (
    <article className={`${styles.card} ${!product.inStock ? styles.soldOut : ""}`}>
      <div className={styles.media} ref={media}>
        <Link href={`/product/${product.slug}`} className={styles.imageLink} aria-label={product.name}>
          {primary && <Image src={primary.url} alt={primary.alt} fill sizes={sizes} preload={preload} className={styles.primary} />}
          {secondary && <Image src={secondary.url} alt="" fill sizes={sizes} className={styles.secondary} />}
        </Link>
        <div className={styles.flags}>
          {!product.inStock ? (
            <span className={styles.flag}>Sold out</span>
          ) : product.isNewArrival ? (
            <span className={styles.flag}>New</span>
          ) : null}
        </div>
        <div className={styles.wish}>
          <WishlistButton productId={product.id} name={product.name} />
        </div>
        {product.inStock && product.sizes.length > 0 && (
          <div className={styles.quick} role="group" aria-label={`Quick add ${product.name}`}>
            <span className={styles.quickLabel}>Add size</span>
            <div className={styles.quickSizes}>
              {product.sizes.map((s) => (
                <button
                  key={s.size}
                  type="button"
                  disabled={!s.inStock || adding !== null}
                  aria-label={`Add size ${s.size} to bag${s.inStock ? "" : " (sold out)"}`}
                  onClick={async () => {
                    setAdding(s.size);
                    await addItem(s.variantId, 1, { from: media.current, openDrawer: false });
                    setAdding(null);
                  }}
                  data-busy={adding === s.size || undefined}
                >
                  {s.size}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className={styles.body}>
        <h3 className={styles.name}>
          <Link href={`/product/${product.slug}`}>{product.name}</Link>
        </h3>
        {detail && <p className={styles.detail}>{detail}</p>}
        <Price pricePaise={product.pricePaise} mrpPaise={product.mrpPaise} size="sm" />
      </div>
    </article>
  );
}
