import { z } from "zod";
import { ADDRESS_TYPES, CLIENT_REPORTABLE_EVENTS, PAYMENT_METHODS, PRODUCT_SORTS, RETURN_TYPES } from "./enums";
import {
  INDIAN_STATES,
  cleanText,
  emailSchema,
  optionalEmailSchema,
  otpCodeSchema,
  phoneSchema,
  pincodeSchema,
  requiredText,
  uuidSchema,
} from "./validation";

/* ───────────────────────────── Catalog queries ───────────────────────────── */

const csv = z
  .string()
  .optional()
  .transform((s) => (s ? s.split(",").map((v) => v.trim()).filter(Boolean).slice(0, 20) : []));

/** Mirrors the storefront URL: /shop?category=ikat&size=L&sort=price-low */
export const productListQuerySchema = z.object({
  category: z.string().max(96).optional(),
  q: cleanText(80).optional(),
  size: csv,
  color: csv,
  fabric: csv,
  pattern: csv,
  type: csv,
  /** Whole rupees in the URL for readability. */
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  availability: z.enum(["in-stock"]).optional(),
  /** Minimum discount percent, e.g. 30 → 30% off or more. */
  discount: z.coerce.number().int().min(1).max(90).optional(),
  sort: z.enum(PRODUCT_SORTS).default("featured"),
  page: z.coerce.number().int().min(1).max(500).default(1),
  pageSize: z.coerce.number().int().min(1).max(60).default(24),
});
export type ProductListQuery = z.infer<typeof productListQuerySchema>;

/* ─────────────────────────────────── Auth ────────────────────────────────── */

export const sendOtpSchema = z.object({ phone: phoneSchema });
export const verifyOtpSchema = z.object({ phone: phoneSchema, code: otpCodeSchema });

export const profileUpdateSchema = z.object({
  fullName: requiredText("Name", 120, 2),
  email: optionalEmailSchema.optional(),
  whatsappOptIn: z.boolean().optional(),
  marketingOptIn: z.boolean().optional(),
});

/* ───────────────────────────────── Address ───────────────────────────────── */

export const addressInputSchema = z.object({
  fullName: requiredText("Full name", 120, 2),
  phone: phoneSchema,
  email: optionalEmailSchema.optional().default(null),
  line1: requiredText("House / flat", 160),
  line2: requiredText("Street", 160),
  area: requiredText("Area / locality", 120),
  city: requiredText("City", 80, 2),
  state: z.enum(INDIAN_STATES, { error: "Select a state" }),
  pincode: pincodeSchema,
  landmark: cleanText(120)
    .optional()
    .transform((s) => s || null),
  addressType: z.enum(ADDRESS_TYPES).default("HOME"),
  isDefault: z.boolean().default(false),
});
export type AddressInput = z.input<typeof addressInputSchema>;

/* ─────────────────────────────── Cart & wishlist ─────────────────────────── */

export const MAX_QTY_PER_LINE = 10;

export const addCartItemSchema = z.object({
  variantId: uuidSchema,
  quantity: z.number().int().min(1).max(MAX_QTY_PER_LINE).default(1),
});
export const updateCartItemSchema = z.object({ quantity: z.number().int().min(1).max(MAX_QTY_PER_LINE) });
export const applyCouponSchema = z.object({ code: z.string().trim().min(2).max(32).toUpperCase() });
export const wishlistAddSchema = z.object({ productId: uuidSchema });
export const moveToCartSchema = z.object({ variantId: uuidSchema });

/* ──────────────────────────────── Checkout ───────────────────────────────── */

export const CHECKOUT_STEPS = ["AUTH", "ADDRESS", "DELIVERY", "PAYMENT", "REVIEW"] as const;
export const checkoutProgressSchema = z.object({ step: z.enum(CHECKOUT_STEPS) });

export const quoteQuerySchema = z.object({
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
});

export const placeOrderSchema = z.object({
  addressId: uuidSchema,
  paymentMethod: z.enum(PAYMENT_METHODS),
  /** Client-generated per checkout attempt; makes order placement idempotent. */
  idempotencyKey: z.string().min(16).max(64),
  /** The total the customer saw. Order is refused if the server total differs. */
  expectedTotalPaise: z.number().int().min(0),
});

export const paymentCallbackSchema = z.object({
  orderNumber: z.string().min(4).max(24),
  payload: z.record(z.string(), z.unknown()),
});

/* ────────────────────────────── Orders & returns ─────────────────────────── */

export const cancelOrderSchema = z.object({ reason: requiredText("Reason", 300, 3) });

export const trackOrderSchema = z.object({
  orderNumber: z.string().trim().toUpperCase().min(4).max(24),
  phone: phoneSchema,
});

export const RETURN_REASONS = [
  { value: "SIZE_ISSUE", label: "Size doesn't fit" },
  { value: "DAMAGED", label: "Arrived damaged or defective" },
  { value: "WRONG_ITEM", label: "Received a different item" },
  { value: "NOT_AS_DESCRIBED", label: "Not as described" },
  { value: "QUALITY", label: "Quality not as expected" },
  { value: "CHANGED_MIND", label: "Changed my mind" },
] as const;

export const createReturnSchema = z.object({
  type: z.enum(RETURN_TYPES),
  reason: z.enum(RETURN_REASONS.map((r) => r.value) as [string, ...string[]]),
  note: cleanText(1000).optional(),
  items: z
    .array(
      z.object({
        orderItemId: uuidSchema,
        quantity: z.number().int().min(1).max(10),
        exchangeVariantId: uuidSchema.optional(),
      }),
    )
    .min(1, "Select at least one item"),
});
export type CreateReturnInput = z.input<typeof createReturnSchema>;

export const returnReplySchema = z.object({ message: requiredText("Reply", 1000, 2) });

/* ─────────────────────────────── Engagement ─────────────────────────────── */

export const trackEventSchema = z.object({
  type: z.enum(CLIENT_REPORTABLE_EVENTS),
  path: z.string().max(256).optional(),
  productId: uuidSchema.optional(),
  query: cleanText(80).optional(),
});

export const newsletterSchema = z.object({ email: emailSchema, source: z.string().max(32).default("footer") });

export const SUPPORT_TOPICS = ["ORDER", "RETURN", "PRODUCT", "SIZING", "PAYMENT", "OTHER"] as const;
export const supportRequestSchema = z.object({
  name: requiredText("Name", 120, 2),
  email: optionalEmailSchema.optional().default(null),
  phone: phoneSchema.optional(),
  orderNumber: cleanText(24).optional(),
  topic: z.enum(SUPPORT_TOPICS),
  message: requiredText("Message", 2000, 10),
});
