import { z } from "zod";
import {
  ADMIN_ROLES,
  COUPON_TYPES,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  PERMISSIONS,
  RECOVERY_STATUSES,
  REFUND_METHODS,
  RETURN_STATUSES,
  RETURN_TYPES,
} from "./enums";
import { cleanText, emailSchema, requiredText, uuidSchema } from "./validation";

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens");

const skuSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9-]{1,62}$/, "SKU may contain letters, numbers and hyphens");

/** Admin forms enter money in rupees; the API stores paise. */
const rupees = z.coerce
  .number()
  .min(0)
  .max(1_000_000)
  .transform((r) => Math.round(r * 100));
const optionalDate = z
  .union([z.literal(""), z.null(), z.coerce.date()])
  .optional()
  .transform((v) => (v instanceof Date ? v : null));

/* ─────────────────────────────── Auth / admins ───────────────────────────── */

export const adminLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

export const strongPasswordSchema = z
  .string()
  .min(12, "Use at least 12 characters")
  .max(200)
  .regex(/[a-z]/, "Include a lowercase letter")
  .regex(/[A-Z]/, "Include an uppercase letter")
  .regex(/\d/, "Include a number");

export const adminCreateSchema = z.object({
  email: emailSchema,
  fullName: requiredText("Name", 120, 2),
  role: z.enum(ADMIN_ROLES),
  password: strongPasswordSchema,
});

export const adminUpdateSchema = z.object({
  fullName: requiredText("Name", 120, 2).optional(),
  role: z.enum(ADMIN_ROLES).optional(),
  isActive: z.boolean().optional(),
});

export const rolePermissionsSchema = z.object({ permissions: z.array(z.enum(PERMISSIONS)) });

/* ───────────────────────────────── Catalog ───────────────────────────────── */

export const categoryUpsertSchema = z.object({
  name: requiredText("Name", 120, 2),
  slug: slugSchema,
  description: cleanText(2000).optional().nullable(),
  sortOrder: z.coerce.number().int().default(0),
  isActive: z.boolean().default(true),
  isNavigable: z.boolean().default(true),
  seoTitle: cleanText(160).optional().nullable(),
  seoDescription: cleanText(320).optional().nullable(),
});

export const productUpsertSchema = z
  .object({
    name: requiredText("Name", 200, 2),
    slug: slugSchema,
    sku: skuSchema,
    shortDescription: cleanText(600).optional().nullable(),
    /** Plain text with paragraph breaks; rendered as text (never raw HTML). */
    description: z.string().max(10000).optional().nullable(),
    productType: requiredText("Product type", 48),
    fabric: cleanText(64).optional().nullable(),
    pattern: cleanText(64).optional().nullable(),
    color: cleanText(48).optional().nullable(),
    tags: z.array(cleanText(48)).max(30).default([]),
    mrp: rupees,
    price: rupees,
    categoryIds: z.array(uuidSchema).min(1, "Choose at least one category"),
    primaryCategoryId: uuidSchema.optional().nullable(),
    isFeatured: z.boolean().default(false),
    isBestSeller: z.boolean().default(false),
    isNewArrival: z.boolean().default(false),
    isActive: z.boolean().default(true),
    seoTitle: cleanText(160).optional().nullable(),
    seoDescription: cleanText(320).optional().nullable(),
  })
  .refine((p) => p.price > 0, { path: ["price"], message: "Selling price must be greater than zero" })
  .refine((p) => p.mrp >= p.price, { path: ["mrp"], message: "MRP must be at least the selling price" });
export type ProductUpsertInput = z.input<typeof productUpsertSchema>;

/** Quick merchandising toggles from the product list. */
export const productFlagsSchema = z
  .object({ isActive: z.boolean(), isFeatured: z.boolean(), isBestSeller: z.boolean(), isNewArrival: z.boolean() })
  .partial();

export const variantUpsertSchema = z.object({
  size: z.string().trim().toUpperCase().min(1).max(16),
  color: cleanText(48).optional().nullable(),
  sku: skuSchema,
  price: rupees.optional().nullable(),
  mrp: rupees.optional().nullable(),
  sortOrder: z.coerce.number().int().default(0),
  isActive: z.boolean().default(true),
  /** Only on create: opening stock, recorded as a STOCK_IN transaction. */
  initialStock: z.coerce.number().int().min(0).max(100000).optional(),
});

export const imageReorderSchema = z.object({ imageIds: z.array(uuidSchema).min(1) });
export const imageMetaSchema = z.object({ alt: cleanText(200).optional().nullable() });

/* ──────────────────────────────── Inventory ──────────────────────────────── */

export const inventoryAdjustSchema = z
  .object({
    type: z.enum(["STOCK_IN", "MANUAL_ADJUSTMENT", "STOCK_CORRECTION"]),
    /** STOCK_IN: positive quantity. Adjustments/corrections: signed delta. */
    quantity: z.coerce.number().int(),
    note: requiredText("Note", 300, 3),
    lowStockThreshold: z.coerce.number().int().min(0).max(1000).optional(),
  })
  .refine((v) => (v.type === "STOCK_IN" ? v.quantity > 0 : v.quantity !== 0), {
    path: ["quantity"],
    message: "Enter a valid quantity",
  });

export const inventoryQuerySchema = z.object({
  q: cleanText(80).optional(),
  lowStock: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

/* ───────────────────────────────── Orders ────────────────────────────────── */

export const ORDER_SORTS = ["newest", "oldest", "total-high", "total-low"] as const;

export const adminOrderQuerySchema = z.object({
  q: cleanText(80).optional(),
  status: z.enum(ORDER_STATUSES).optional(),
  paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  sort: z.enum(ORDER_SORTS).default("newest"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const orderStatusUpdateSchema = z.object({
  to: z.enum(["PROCESSING", "PACKED", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"]),
  note: cleanText(500).optional(),
});

export const codDecisionSchema = z.object({ note: cleanText(500).optional() });
export const codRejectSchema = z.object({ reason: requiredText("Reason", 500, 3) });
export const adminCancelSchema = z.object({ reason: requiredText("Reason", 500, 3) });
export const orderNoteSchema = z.object({ body: requiredText("Note", 2000, 2) });

export const shipmentCreateSchema = z.object({
  courierName: requiredText("Courier", 80, 2),
  awb: z.string().trim().toUpperCase().min(4).max(64),
  trackingUrl: z
    .url()
    .optional()
    .or(z.literal(""))
    .transform((v) => v || null),
});

/* ───────────────────────────────── Coupons ───────────────────────────────── */

export const couponUpsertSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{3,32}$/, "Use 3–32 letters or numbers"),
    description: cleanText(300).optional().nullable(),
    type: z.enum(COUPON_TYPES),
    /** PERCENTAGE: percent. FIXED_AMOUNT: rupees (converted to paise server-side). */
    value: z.coerce.number().positive(),
    minOrder: rupees.default(0),
    maxDiscount: rupees.optional().nullable(),
    startsAt: optionalDate,
    endsAt: optionalDate,
    usageLimit: z.coerce.number().int().positive().optional().nullable(),
    perCustomerLimit: z.coerce.number().int().positive().optional().nullable(),
    isActive: z.boolean().default(true),
    newCustomersOnly: z.boolean().default(false),
    firstOrderOnly: z.boolean().default(false),
    isStackable: z.boolean().default(false),
    productIds: z.array(uuidSchema).default([]),
    categoryIds: z.array(uuidSchema).default([]),
  })
  .refine((c) => c.type !== "PERCENTAGE" || (Number.isInteger(c.value) && c.value <= 90), {
    path: ["value"],
    message: "Percentage must be a whole number up to 90",
  })
  .refine((c) => !c.startsAt || !c.endsAt || c.endsAt > c.startsAt, {
    path: ["endsAt"],
    message: "End date must be after the start date",
  });
export type CouponUpsertInput = z.input<typeof couponUpsertSchema>;

/* ───────────────────────────── Returns & refunds ─────────────────────────── */

export const adminReturnQuerySchema = z.object({
  status: z.enum(RETURN_STATUSES).optional(),
  type: z.enum(RETURN_TYPES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const returnTransitionSchema = z.object({
  to: z.enum(["APPROVED", "REJECTED", "INFO_REQUESTED", "RECEIVED", "COMPLETED"]),
  note: cleanText(1000).optional(),
  infoRequest: cleanText(1000).optional(),
  /** RECEIVED only: whether received units go back into sellable stock. */
  restock: z.boolean().default(true),
});

export const refundApproveSchema = z.object({
  method: z.enum(REFUND_METHODS),
  /** Optional override in rupees; defaults to the computed refundable amount. */
  amount: rupees.optional(),
  note: cleanText(500).optional(),
});

export const refundProcessSchema = z.object({ reference: requiredText("Reference", 128, 3) });

/* ──────────────────────── Customers / analytics / misc ───────────────────── */

export const listQuerySchema = z.object({
  q: cleanText(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const customerUpdateSchema = z.object({
  fullName: requiredText("Name", 120, 2).optional(),
  email: emailSchema.optional().nullable(),
  isBlocked: z.boolean().optional(),
});

export const rangeQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const recoveryUpdateSchema = z.object({ recoveryStatus: z.enum(RECOVERY_STATUSES) });

export const auditQuerySchema = z.object({
  entityType: z.string().max(40).optional(),
  entityId: z.string().max(64).optional(),
  action: z.string().max(64).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export const storeSettingsSchema = z.object({
  freeShippingThreshold: rupees,
  flatShippingFee: rupees,
  codEnabled: z.boolean(),
  codFee: rupees,
  codMaxOrderValue: rupees,
  lowStockThreshold: z.coerce.number().int().min(0).max(1000),
});
export type StoreSettingsInput = z.input<typeof storeSettingsSchema>;

export const whatsappTemplateUpdateSchema = z.object({
  providerTemplateName: z.string().trim().min(1).max(128),
  language: z.string().trim().min(2).max(10),
  isApproved: z.boolean(),
  isActive: z.boolean(),
});
