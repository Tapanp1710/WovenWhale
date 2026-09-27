import { index, jsonb, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { createdAt, id } from "./_shared";
import { adminUsers } from "./identity";

/** Immutable record of every admin action that changes business data. */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    actorAdminId: uuid("actor_admin_id").references(() => adminUsers.id),
    /** Denormalised so the trail survives admin deletion. */
    actorEmail: varchar("actor_email", { length: 254 }),
    action: varchar("action", { length: 64 }).notNull(),
    entityType: varchar("entity_type", { length: 40 }).notNull(),
    entityId: varchar("entity_id", { length: 64 }).notNull(),
    before: jsonb("before").$type<Record<string, unknown>>(),
    after: jsonb("after").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_logs_entity_idx").on(t.entityType, t.entityId),
    index("audit_logs_actor_idx").on(t.actorAdminId, t.createdAt),
    index("audit_logs_created_idx").on(t.createdAt),
  ],
);

/** Business configuration editable from the admin (shipping fees, COD rules…). */
export const storeSettings = pgTable("store_settings", {
  key: varchar("key", { length: 64 }).primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedByAdminId: uuid("updated_by_admin_id").references(() => adminUsers.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
