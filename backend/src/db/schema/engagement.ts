import { boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { createdAt, id, messageDirectionEnum, notificationChannelEnum, notificationStatusEnum, updatedAt } from "./_shared";
import { products } from "./catalog";
import { users } from "./identity";

/**
 * Behavioural events for funnel analytics.
 * Privacy: stores an anonymous first-party visitor id, no IP address, no
 * user-agent string, and only small non-personal metadata.
 */
export const customerEvents = pgTable(
  "customer_events",
  {
    id: id(),
    type: varchar("type", { length: 32 }).notNull(),
    visitorId: varchar("visitor_id", { length: 64 }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    orderId: uuid("order_id"),
    path: varchar("path", { length: 256 }),
    metadata: jsonb("metadata").$type<Record<string, string | number | boolean>>(),
    createdAt: createdAt(),
  },
  (t) => [
    index("customer_events_type_created_idx").on(t.type, t.createdAt),
    index("customer_events_user_idx").on(t.userId, t.createdAt),
    index("customer_events_product_idx").on(t.productId, t.type),
    index("customer_events_visitor_idx").on(t.visitorId),
  ],
);

/** Outbound notification intents (one per channel). Providers deliver them. */
export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    channel: notificationChannelEnum("channel").notNull(),
    topic: varchar("topic", { length: 40 }).notNull(),
    recipient: varchar("recipient", { length: 254 }).notNull(),
    payload: jsonb("payload").$type<Record<string, string | number>>().notNull(),
    status: notificationStatusEnum("status").notNull().default("PENDING"),
    providerMessageId: varchar("provider_message_id", { length: 128 }),
    error: text("error"),
    orderId: uuid("order_id"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("notifications_user_idx").on(t.userId, t.createdAt),
    index("notifications_status_idx").on(t.status),
    uniqueIndex("notifications_provider_msg_uq").on(t.providerMessageId),
  ],
);

export const whatsappTemplates = pgTable("whatsapp_templates", {
  id: id(),
  /** Internal topic this template serves, e.g. ORDER_CONFIRMED. */
  topic: varchar("topic", { length: 40 }).notNull().unique(),
  /** Template name as approved in WhatsApp Business Manager. */
  providerTemplateName: varchar("provider_template_name", { length: 128 }).notNull(),
  language: varchar("language", { length: 10 }).notNull().default("en"),
  /** Ordered payload keys mapped into template body parameters. */
  variables: text("variables").array().notNull(),
  previewBody: text("preview_body").notNull(),
  isApproved: boolean("is_approved").notNull().default(false),
  isActive: boolean("is_active").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const whatsappConversations = pgTable(
  "whatsapp_conversations",
  {
    id: id(),
    phone: varchar("phone", { length: 16 }).notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    /** Customer-service window opens on inbound messages (24h on WhatsApp). */
    serviceWindowExpiresAt: timestamp("service_window_expires_at", { withTimezone: true }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("whatsapp_conversations_phone_uq").on(t.phone)],
);

export const whatsappMessages = pgTable(
  "whatsapp_messages",
  {
    id: id(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => whatsappConversations.id, { onDelete: "cascade" }),
    notificationId: uuid("notification_id").references(() => notifications.id),
    direction: messageDirectionEnum("direction").notNull(),
    templateTopic: varchar("template_topic", { length: 40 }),
    body: text("body"),
    providerMessageId: varchar("provider_message_id", { length: 128 }),
    status: notificationStatusEnum("status").notNull().default("PENDING"),
    error: text("error"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("whatsapp_messages_conversation_idx").on(t.conversationId, t.createdAt),
    uniqueIndex("whatsapp_messages_provider_uq").on(t.providerMessageId),
  ],
);

export const newsletterSubscribers = pgTable(
  "newsletter_subscribers",
  {
    id: id(),
    email: varchar("email", { length: 254 }).notNull(),
    source: varchar("source", { length: 32 }).notNull().default("footer"),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("newsletter_email_uq").on(t.email)],
);

export const supportRequests = pgTable(
  "support_requests",
  {
    id: id(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    name: varchar("name", { length: 120 }).notNull(),
    email: varchar("email", { length: 254 }),
    phone: varchar("phone", { length: 16 }),
    orderNumber: varchar("order_number", { length: 24 }),
    topic: varchar("topic", { length: 40 }).notNull(),
    message: text("message").notNull(),
    status: varchar("status", { length: 16 }).notNull().default("OPEN"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("support_requests_status_idx").on(t.status, t.createdAt)],
);
