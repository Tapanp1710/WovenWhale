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

/** Hono environment: per-request variables set by middleware. */
export interface AppEnv {
  Variables: {
    requestId: string;
    visitorId: string | null;
    customer: CustomerContext | null;
    admin: AdminContext | null;
  };
}
