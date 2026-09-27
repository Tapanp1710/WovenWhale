import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { addressTypeEnum, createdAt, deletedAt, id, sessionSubjectEnum, updatedAt } from "./_shared";

/** Customer identities. Phone (E.164) is the primary login identifier. */
export const users = pgTable(
  "users",
  {
    id: id(),
    phone: varchar("phone", { length: 16 }).notNull(),
    email: varchar("email", { length: 254 }),
    fullName: varchar("full_name", { length: 120 }),
    phoneVerifiedAt: timestamp("phone_verified_at", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    isBlocked: boolean("is_blocked").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex("users_phone_uq").on(t.phone),
    uniqueIndex("users_email_uq")
      .on(sql`lower(${t.email})`)
      .where(sql`${t.email} is not null`),
  ],
);

export const customerProfiles = pgTable("customer_profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  marketingOptIn: boolean("marketing_opt_in").notNull().default(false),
  whatsappOptIn: boolean("whatsapp_opt_in").notNull().default(false),
  acquisitionSource: varchar("acquisition_source", { length: 64 }),
  /** Only campaign attribution (utm_*) — no device fingerprinting. */
  attribution: jsonb("attribution").$type<Record<string, string>>(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const addresses = pgTable(
  "addresses",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    fullName: varchar("full_name", { length: 120 }).notNull(),
    phone: varchar("phone", { length: 16 }).notNull(),
    email: varchar("email", { length: 254 }),
    line1: varchar("line1", { length: 160 }).notNull(),
    line2: varchar("line2", { length: 160 }).notNull(),
    area: varchar("area", { length: 120 }).notNull(),
    city: varchar("city", { length: 80 }).notNull(),
    state: varchar("state", { length: 80 }).notNull(),
    pincode: varchar("pincode", { length: 6 }).notNull(),
    landmark: varchar("landmark", { length: 120 }),
    addressType: addressTypeEnum("address_type").notNull().default("HOME"),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    index("addresses_user_idx").on(t.userId),
    uniqueIndex("addresses_one_default_uq")
      .on(t.userId)
      .where(sql`${t.isDefault} and ${t.deletedAt} is null`),
  ],
);

/** One-time-password challenges. Codes are stored hashed, never in plain text. */
export const otpChallenges = pgTable(
  "otp_challenges",
  {
    id: id(),
    phone: varchar("phone", { length: 16 }).notNull(),
    provider: varchar("provider", { length: 32 }).notNull(),
    providerRef: varchar("provider_ref", { length: 128 }),
    codeHash: varchar("code_hash", { length: 128 }),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("otp_phone_created_idx").on(t.phone, t.createdAt)],
);

/** Server-side sessions for customers and admins. Only a SHA-256 of the token is stored. */
export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    subject: sessionSubjectEnum("subject").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    adminUserId: uuid("admin_user_id").references(() => adminUsers.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    userAgent: varchar("user_agent", { length: 256 }),
    /** 2FA-ready: an admin session is fully privileged only once the second factor is satisfied. */
    mfaVerified: boolean("mfa_verified").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("sessions_token_uq").on(t.tokenHash),
    index("sessions_user_idx").on(t.userId),
    index("sessions_admin_idx").on(t.adminUserId),
  ],
);

/* ────────────────────────────── Admin / RBAC ────────────────────────────── */

export const roles = pgTable("roles", {
  id: id(),
  key: varchar("key", { length: 40 }).notNull().unique(),
  name: varchar("name", { length: 80 }).notNull(),
  description: text("description"),
  createdAt: createdAt(),
});

export const permissions = pgTable("permissions", {
  id: id(),
  key: varchar("key", { length: 64 }).notNull().unique(),
  description: text("description"),
});

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })],
);

export const adminUsers = pgTable(
  "admin_users",
  {
    id: id(),
    email: varchar("email", { length: 254 }).notNull(),
    fullName: varchar("full_name", { length: 120 }).notNull(),
    passwordHash: varchar("password_hash", { length: 256 }).notNull(),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id),
    isActive: boolean("is_active").notNull().default(true),
    /** Encrypted TOTP secret. Null = 2FA not enrolled. */
    totpSecret: varchar("totp_secret", { length: 256 }),
    failedLoginCount: integer("failed_login_count").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("admin_users_email_uq").on(sql`lower(${t.email})`)],
);
