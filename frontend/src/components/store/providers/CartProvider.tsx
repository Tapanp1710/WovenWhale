"use client";

import type { CartDTO } from "@wovenwhale/backend/contracts";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { useToast } from "@/components/ui/Toaster";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { CartDrawer } from "../cart/CartDrawer";
import styles from "./CartProvider.module.css";

interface CartApi {
  cart: CartDTO | null;
  itemCount: number;
  busy: boolean;
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  bagIconRef: RefObject<HTMLAnchorElement | null>;
  /** Adds a variant. `from` is the product image to fly into the bag icon. */
  addItem: (variantId: string, quantity: number, opts?: { from?: HTMLElement | null; openDrawer?: boolean }) => Promise<boolean>;
  updateQuantity: (lineId: string, quantity: number) => Promise<void>;
  removeItem: (lineId: string) => Promise<void>;
  applyCoupon: (code: string) => Promise<string | null>;
  removeCoupon: (code: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const CartContext = createContext<CartApi | null>(null);

interface Flight {
  id: number;
  src: string;
  from: DOMRect;
  to: DOMRect;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartDTO | null>(null);
  const [busy, setBusy] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [flights, setFlights] = useState<Flight[]>([]);
  const bagIconRef = useRef<HTMLAnchorElement | null>(null);
  const reduce = useReducedMotion();
  const toast = useToast();

  const refresh = useCallback(async () => {
    try {
      setCart(await api<CartDTO>("/cart"));
    } catch {
      // Bag stays as-is; the next action will surface the error.
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onSession = () => void refresh();
    window.addEventListener("ww:session-changed", onSession);
    return () => window.removeEventListener("ww:session-changed", onSession);
  }, [refresh]);

  const fly = useCallback(
    (from: HTMLElement | null | undefined) => {
      const img = from?.querySelector("img") ?? (from instanceof HTMLImageElement ? from : null);
      const target = bagIconRef.current;
      if (reduce || !img || !target) return;
      const src = img.currentSrc || img.src;
      const id = Date.now();
      setFlights((f) => [...f, { id, src, from: img.getBoundingClientRect(), to: target.getBoundingClientRect() }]);
      setTimeout(() => setFlights((f) => f.filter((x) => x.id !== id)), 900);
    },
    [reduce],
  );

  const mutate = useCallback(
    async (fn: () => Promise<CartDTO>) => {
      setBusy(true);
      try {
        setCart(await fn());
        return true;
      } catch (error) {
        toast.error(errorMessage(error));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );

  const value = useMemo<CartApi>(
    () => ({
      cart,
      itemCount: cart?.totals.itemCount ?? 0,
      busy,
      drawerOpen,
      setDrawerOpen,
      bagIconRef,
      addItem: async (variantId, quantity, opts) => {
        fly(opts?.from);
        const ok = await mutate(() => api<CartDTO>("/cart/items", { method: "POST", body: { variantId, quantity } }));
        if (ok) {
          if (opts?.openDrawer === false) toast.success("Added to your bag.", { label: "View bag", onClick: () => setDrawerOpen(true) });
          else setTimeout(() => setDrawerOpen(true), reduce ? 0 : 450);
        }
        return ok;
      },
      updateQuantity: async (lineId, quantity) => {
        await mutate(() => api<CartDTO>(`/cart/items/${lineId}`, { method: "PATCH", body: { quantity } }));
      },
      removeItem: async (lineId) => {
        await mutate(() => api<CartDTO>(`/cart/items/${lineId}`, { method: "DELETE" }));
      },
      applyCoupon: async (code) => {
        setBusy(true);
        try {
          setCart(await api<CartDTO>("/cart/coupons", { method: "POST", body: { code } }));
          return null;
        } catch (error) {
          return errorMessage(error);
        } finally {
          setBusy(false);
        }
      },
      removeCoupon: async (code) => {
        await mutate(() => api<CartDTO>(`/cart/coupons/${encodeURIComponent(code)}`, { method: "DELETE" }));
      },
      refresh,
    }),
    [cart, busy, drawerOpen, fly, mutate, refresh, toast, reduce],
  );

  return (
    <CartContext.Provider value={value}>
      {children}
      <CartDrawer />
      <AnimatePresence>
        {flights.map((f) => (
          <motion.img
            key={f.id}
            src={f.src}
            alt=""
            aria-hidden="true"
            className={styles.flight}
            initial={{ left: f.from.left, top: f.from.top, width: f.from.width, height: f.from.height, opacity: 0.95 }}
            animate={{
              left: f.to.left + f.to.width / 2 - 12,
              top: f.to.top + f.to.height / 2 - 16,
              width: 24,
              height: 32,
              opacity: 0.4,
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: [0.55, 0, 0.2, 1] }}
          />
        ))}
      </AnimatePresence>
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}
