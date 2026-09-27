"use client";

import type { ProductDetailDTO } from "@wovenwhale/backend/contracts";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Price } from "@/components/ui/Price";
import { QuantityStepper } from "@/components/ui/QuantityStepper";
import { recentlyViewed, track } from "@/lib/track";
import { useCart } from "../providers/CartProvider";
import { SizeGuide } from "./SizeGuide";
import { WishlistButton } from "./WishlistButton";
import styles from "./ProductPurchase.module.css";

export function ProductPurchase({ product, galleryId }: { product: ProductDetailDTO; galleryId: string }) {
  const { addItem, busy } = useCart();
  const router = useRouter();
  const inStockVariants = product.variants.filter((v) => v.inStock);
  // Preselect only when a single size is available; otherwise ask explicitly.
  const [variantId, setVariantId] = useState<string | null>(inStockVariants.length === 1 ? inStockVariants[0]!.id : null);
  const [quantity, setQuantity] = useState(1);
  const [sizeError, setSizeError] = useState(false);
  const [action, setAction] = useState<"add" | "buy" | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const [showSticky, setShowSticky] = useState(false);

  const variant = product.variants.find((v) => v.id === variantId) ?? null;
  const maxQty = Math.max(1, Math.min(10, variant?.available ?? 10));

  useEffect(() => {
    track({ type: "PRODUCT_VIEW", productId: product.id, path: `/product/${product.slug}` });
    recentlyViewed.add(product.id);
  }, [product.id, product.slug]);

  // Sticky mobile purchase bar.
  useEffect(() => {
    const el = addButton.current;
    if (!el) return;
    // Only once the button has scrolled up out of view, not before the shopper reaches it.
    const io = new IntersectionObserver(([entry]) => setShowSticky(!entry!.isIntersecting && entry!.boundingClientRect.top < 0));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => setQuantity((q) => Math.min(q, maxQty)), [maxQty]);

  async function submit(kind: "add" | "buy") {
    if (!variant) {
      setSizeError(true);
      document.getElementById("size-options")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setAction(kind);
    const ok = await addItem(variant.id, quantity, { from: document.getElementById(galleryId), openDrawer: kind === "add" });
    setAction(null);
    if (ok && kind === "buy") router.push("/checkout");
  }

  const stockNote = !product.inStock
    ? "Sold out in every size."
    : variant
      ? variant.lowStock
        ? `Only ${variant.available} left in ${variant.size}.`
        : `In stock in ${variant.size}.`
      : null;

  return (
    <div className={styles.panel}>
      <div className={styles.titleRow}>
        <h1 className={styles.name}>{product.name}</h1>
        <WishlistButton productId={product.id} name={product.name} />
      </div>
      <Price pricePaise={variant?.pricePaise ?? product.pricePaise} mrpPaise={variant?.mrpPaise ?? product.mrpPaise} size="lg" />
      <p className={styles.tax}>Inclusive of all taxes</p>

      {product.shortDescription && <p className={styles.short}>{product.shortDescription}</p>}

      <fieldset className={styles.sizes} id="size-options" aria-describedby={sizeError ? "size-error" : undefined}>
        <div className={styles.sizeHead}>
          <legend className={styles.legend}>Size{variant ? <span className={styles.selected}>: {variant.size}</span> : null}</legend>
          <SizeGuide sizes={product.variants.map((v) => v.size)} />
        </div>
        <div className={styles.sizeGrid} role="radiogroup" aria-label="Choose a size">
          {product.variants.map((v) => (
            <button
              key={v.id}
              type="button"
              role="radio"
              aria-checked={variantId === v.id}
              disabled={!v.inStock}
              className={styles.size}
              onClick={() => {
                setVariantId(v.id);
                setSizeError(false);
              }}
              aria-label={`${v.size}${v.inStock ? (v.lowStock ? `, only ${v.available} left` : "") : ", sold out"}`}
            >
              {v.size}
            </button>
          ))}
        </div>
        <AnimatePresence>
          {sizeError && (
            <motion.p
              id="size-error"
              className={styles.error}
              role="alert"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              Choose a size to continue.
            </motion.p>
          )}
        </AnimatePresence>
        {stockNote && <p className={variant?.lowStock ? styles.low : styles.stock}>{stockNote}</p>}
      </fieldset>

      {product.inStock && (
        <>
          <div className={styles.qtyRow}>
            <span className={styles.legend} id="qty-label">
              Quantity
            </span>
            <QuantityStepper value={quantity} max={maxQty} onChange={setQuantity} />
          </div>
          <div className={styles.actions}>
            <Button
              ref={addButton}
              size="lg"
              fullWidth
              onClick={() => void submit("add")}
              loading={action === "add"}
              disabled={busy && action !== "add"}
            >
              Add to bag
            </Button>
            <Button
              size="lg"
              variant="secondary"
              fullWidth
              onClick={() => void submit("buy")}
              loading={action === "buy"}
              disabled={busy && action !== "buy"}
            >
              Buy now
            </Button>
          </div>
        </>
      )}

      <AnimatePresence>
        {showSticky && product.inStock && (
          <motion.div
            className={styles.sticky}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className={styles.stickyInfo}>
              <span className={styles.stickyName}>{product.name}</span>
              <Price pricePaise={variant?.pricePaise ?? product.pricePaise} mrpPaise={variant?.mrpPaise ?? product.mrpPaise} size="sm" />
            </div>
            <Button onClick={() => void submit("add")} loading={action === "add"}>
              {variant ? `Add ${variant.size}` : "Choose size"}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
