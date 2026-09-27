"use client";

import type { CustomerDTO } from "@wovenwhale/backend/contracts";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toaster";
import { api } from "@/lib/api/client";
import { SignInForm } from "../auth/SignInForm";

interface SessionApi {
  customer: CustomerDTO | null;
  setCustomer: (c: CustomerDTO | null) => void;
  /** Opens the sign-in sheet; `then` runs after a successful sign-in. */
  requireSignIn: (then?: () => void) => void;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionApi | null>(null);

export function SessionProvider({ initialCustomer, children }: { initialCustomer: CustomerDTO | null; children: ReactNode }) {
  const [customer, setCustomer] = useState(initialCustomer);
  const [open, setOpen] = useState(false);
  const pending = useRef<(() => void) | undefined>(undefined);
  const router = useRouter();
  const toast = useToast();

  const requireSignIn = useCallback(
    (then?: () => void) => {
      if (customer) return then?.();
      pending.current = then;
      setOpen(true);
    },
    [customer],
  );

  const signOut = useCallback(async () => {
    await api("/auth/logout", { method: "POST" });
    setCustomer(null);
    router.push("/");
    router.refresh();
    toast.info("You've been signed out.");
  }, [router, toast]);

  const value = useMemo(() => ({ customer, setCustomer, requireSignIn, signOut }), [customer, requireSignIn, signOut]);

  return (
    <SessionContext.Provider value={value}>
      {children}
      <Sheet open={open} onOpenChange={setOpen} title="Sign in" side="center">
        <SignInForm
          onSignedIn={(c, isNew) => {
            setCustomer(c);
            setOpen(false);
            toast.success(isNew ? "Welcome to WovenWhale." : "Signed in.");
            // Server components (bag, account) re-read the new session.
            router.refresh();
            window.dispatchEvent(new Event("ww:session-changed"));
            pending.current?.();
            pending.current = undefined;
          }}
        />
      </Sheet>
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}
