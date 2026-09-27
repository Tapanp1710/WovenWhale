"use client";

import type { AdminSessionDTO, Permission } from "@wovenwhale/backend/contracts";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { useToast } from "@/components/ui/Toaster";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { can } from "./labels";

const AdminContext = createContext<AdminSessionDTO | null>(null);

export function AdminProvider({ admin, children }: { admin: AdminSessionDTO; children: ReactNode }) {
  return <AdminContext.Provider value={admin}>{children}</AdminContext.Provider>;
}

export function useAdmin() {
  const admin = useContext(AdminContext);
  if (!admin) throw new Error("useAdmin must be used inside AdminProvider");
  return admin;
}

/** `useCan("orders.manage")` — hides controls the API would refuse anyway. */
export const useCan = (...perms: Permission[]) => can(useAdmin(), ...perms);

/**
 * Runs an admin mutation: shows a toast, refreshes server data on success and
 * sends the admin back to sign-in when the session has expired.
 * Resolves to the result, or undefined when the call failed.
 */
export function useAction() {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);

  const run = useCallback(
    async <T,>(fn: () => Promise<T>, success?: string, onError?: (error: unknown) => void): Promise<T | undefined> => {
      setPending(true);
      try {
        const result = await fn();
        if (success) toast.success(success);
        router.refresh();
        return result;
      } catch (error) {
        onError?.(error);
        if (error instanceof ApiError && error.status === 401) {
          router.push(`/admin/login?next=${encodeURIComponent(location.pathname + location.search)}`);
        }
        toast.error(error instanceof ApiError && error.status === 403 ? "You don't have permission to do that." : errorMessage(error));
        return undefined;
      } finally {
        setPending(false);
      }
    },
    [router, toast],
  );

  return { run, pending };
}

/** Maps API validation errors (`fields`) onto React Hook Form fields. */
export const serverErrors =
  <T extends FieldValues>(setError: UseFormSetError<T>) =>
  (error: unknown) => {
    if (!(error instanceof ApiError)) return;
    for (const [name, message] of Object.entries(error.fields)) setError(name as Path<T>, { message });
  };
