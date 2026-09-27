"use client";

import type { WishlistItemDTO } from "@wovenwhale/backend/contracts";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Heart } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { EmptyState } from "@/components/ui/EmptyState";
import { Price } from "@/components/ui/Price";
import { useToast } from "@/components/ui/Toaster";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { useCart } from "../providers/CartProvider";
import styles from "./WishlistView.module.css";

export function WishlistView({ initial }: { initial: WishlistItemDTO[] }) {
  const [items, setItems] = useState(initial);
  const [sizes, setSizes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const { refresh: refreshCart, setDrawerOpen } = useCart();
  const toast = useToast();
  const reduce = useReducedMotion();

  async function remove(productId: string) {
    setBusy(productId);
    try {
      await api(`/wishlist/items/${productId}`, { method: "DELETE" });
      setItems((list) => list.filter((i) => i.productId !== productId));
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function moveToBag(item: WishlistItemDTO) {
    const variantId = sizes[item.productId];
    if (!variantId) return toast.info("Choose a size first.");
    setBusy(item.productId);
    try {
      setItems(await api<WishlistItemDTO[]>(`/wishlist/items/${item.productId}/move-to-cart`, { method: "POST", body: { variantId } }));
      await refreshCart();
      toast.success(`Moved ${item.product.name} to your bag.`, { label: "View bag", onClick: () => setDrawerOpen(true) });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Heart size={26} aria-hidden="true" />}
        title="Your wishlist is empty"
        action={<ButtonLink href="/shop">Browse the collection</ButtonLink>}
      >
        Tap the heart on any piece to save it for later.
      </EmptyState>
    );
  }

  return (
    <ul className={styles.grid}>
      <AnimatePresence initial={false}>
        {items.map((item) => {
          const p = item.product;
          return (
            <motion.li key={item.productId} layout={!reduce} exit={{ opacity: 0, scale: 0.96 }} className={styles.card}>
              <Link href={`/product/${p.slug}`} className={styles.media}>
                {p.images[0] && <Image src={p.images[0].url} alt={p.images[0].alt} fill sizes="(min-width: 1024px) 25vw, 50vw" />}
              </Link>
              <div className={styles.body}>
                <Link href={`/product/${p.slug}`} className={styles.name}>
                  {p.name}
                </Link>
                <Price pricePaise={p.pricePaise} mrpPaise={p.mrpPaise} size="sm" />
                {p.inStock ? (
                  <>
                    <label className="visually-hidden" htmlFor={`size-${p.id}`}>
                      Size for {p.name}
                    </label>
                    <select
                      id={`size-${p.id}`}
                      className={styles.select}
                      value={sizes[p.id] ?? ""}
                      onChange={(e) => setSizes((s) => ({ ...s, [p.id]: e.target.value }))}
                    >
                      <option value="">Choose size</option>
                      {p.sizes.map((s) => (
                        <option key={s.variantId} value={s.variantId} disabled={!s.inStock}>
                          {s.size}
                          {s.inStock ? "" : " (sold out)"}
                        </option>
                      ))}
                    </select>
                    <Button size="sm" fullWidth onClick={() => void moveToBag(item)} loading={busy === p.id}>
                      Move to bag
                    </Button>
                  </>
                ) : (
                  <p className={styles.soldOut}>Sold out</p>
                )}
                <Button variant="link" onClick={() => void remove(p.id)} disabled={busy === p.id}>
                  Remove
                </Button>
              </div>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}
