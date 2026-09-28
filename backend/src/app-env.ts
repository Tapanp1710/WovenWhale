import type { AdminRole, Permission } from "./contracts/enums";

export interface CustomerContext {
  id: string;
  phone: string;
  sessionId: string;
}

export interface AdminContext {
  id: string;
  email: string;
  fullName: string;
  role: AdminRole;
  permissions: ReadonlySet<Permission>;
  sessionId: string;
}

/** A signed-in admin whose session may still be waiting for the second factor. */
export interface AdminSessionContext {
  id: string;
  email: string;
  sessionId: string;
  mfaVerified: boolean;
  mfaEnabled: boolean;
}

/** Hono environment: per-request variables set by middleware. */
export interface AppEnv {
  Variables: {
    requestId: string;
    visitorId: string | null;
    customer: CustomerContext | null;
    admin: AdminContext | null;
    adminSession: AdminSessionContext | null;
  };
}
