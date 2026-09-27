"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useToast } from "@/components/ui/Toaster";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { useSession } from "./SessionProvider";

interface WishlistApi {
  has: (productId: string) => boolean;
  toggle: (productId: string, name: string) => void;
}

const WishlistContext = createContext<WishlistApi | null>(null);

/** Wishlist is an account feature: toggling while signed out opens sign-in first. */
export function WishlistProvider({ children }: { children: ReactNode }) {
  const { customer, requireSignIn } = useSession();
  const [ids, setIds] = useState<Set<string>>(new Set());
  const toast = useToast();

  useEffect(() => {
    if (!customer) {
      setIds(new Set());
      return;
    }
    api<string[]>("/wishlist/ids")
      .then((list) => setIds(new Set(list)))
      .catch(() => undefined);
  }, [customer]);

  const toggle = useCallback(
    (productId: string, name: string) => {
      requireSignIn(async () => {
        const saved = ids.has(productId);
        // Optimistic: flip immediately, roll back on failure.
        setIds((prev) => {
          const next = new Set(prev);
          if (saved) next.delete(productId);
          else next.add(productId);
          return next;
        });
        try {
          if (saved) await api(`/wishlist/items/${productId}`, { method: "DELETE" });
          else await api("/wishlist/items", { method: "POST", body: { productId } });
          toast.success(saved ? `Removed ${name} from your wishlist.` : `Saved ${name} to your wishlist.`);
        } catch (error) {
          setIds((prev) => {
            const next = new Set(prev);
            if (saved) next.add(productId);
            else next.delete(productId);
            return next;
          });
          toast.error(errorMessage(error));
        }
      });
    },
    [ids, requireSignIn, toast],
  );

  const value = useMemo(() => ({ has: (id: string) => ids.has(id), toggle }), [ids, toggle]);
  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist() {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error("useWishlist must be used inside WishlistProvider");
  return ctx;
}
