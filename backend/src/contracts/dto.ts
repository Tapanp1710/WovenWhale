/**
 * Response shapes returned by the commerce API. Dates are ISO-8601 strings and
 * money is integer paise throughout.
 */
import type {
  AddressType,
  AdminRole,
  CheckoutStatus,
  InventoryTxnType,
  NotificationStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Permission,
  ProductStatus,
  RecoveryStatus,
  RefundMethod,
  RefundStatus,
  ReturnStatus,
  ReturnType,
  ShipmentStatus,
  StockState,
} from "./enums";

export interface ApiErrorBody {
  error: { code: string; message: string; fields?: Record<string, string>; details?: Record<string, unknown> };
}

/* ───────────────────────────────── Catalog ───────────────────────────────── */

export interface ImageDTO {
  id: string;
  url: string;
  alt: string;
  width: number | null;
  height: number | null;
}

export interface CategoryDTO {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  productCount: number;
  seoTitle: string | null;
  seoDescription: string | null;
}

export interface VariantDTO {
  id: string;
  sku: string;
  size: string;
  color: string | null;
  pricePaise: number;
  mrpPaise: number;
  available: number;
  inStock: boolean;
  lowStock: boolean;
}

export interface ProductCardDTO {
  id: string;
  slug: string;
  name: string;
  productType: string;
  fabric: string | null;
  pattern: string | null;
  color: string | null;
  pricePaise: number;
  mrpPaise: number;
  discountPercent: number;
  images: ImageDTO[];
  sizes: { size: string; inStock: boolean; variantId: string }[];
  inStock: boolean;
  isNewArrival: boolean;
  isBestSeller: boolean;
  primaryCategory: { slug: string; name: string } | null;
}

export interface ProductDetailDTO extends ProductCardDTO {
  sku: string;
  shortDescription: string | null;
  description: string | null;
  tags: string[];
  variants: VariantDTO[];
  categories: { slug: string; name: string }[];
  seoTitle: string | null;
  seoDescription: string | null;
  updatedAt: string;
}

export interface FacetOption {
  value: string;
  count: number;
}

export interface CatalogFacets {
  sizes: FacetOption[];
  colors: FacetOption[];
  fabrics: FacetOption[];
  patterns: FacetOption[];
  types: FacetOption[];
  priceRange: { minPaise: number; maxPaise: number };
}

export interface ProductListResponse {
  items: ProductCardDTO[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  facets: CatalogFacets;
  category: CategoryDTO | null;
}

export interface SearchSuggestion {
  products: { slug: string; name: string; pricePaise: number; imageUrl: string | null }[];
  categories: { slug: string; name: string }[];
}

export interface HomeFeedDTO {
  featured: ProductCardDTO[];
  newArrivals: ProductCardDTO[];
  bestSellers: ProductCardDTO[];
  categories: (CategoryDTO & { coverImageUrl: string | null })[];
}

export interface StoreConfigDTO {
  freeShippingThresholdPaise: number;
  flatShippingPaise: number;
  codEnabled: boolean;
  codFeePaise: number;
  codMaxOrderPaise: number;
  cancellationWindowHours: number;
  returnWindowDays: number;
  /** Present only on a demo deployment (DEMO_MODE): drives the "demo store" banner. */
  demo: { otpCode: string | null; payments: "mock" | "razorpay-test" } | null;
}

/* ───────────────────────────── Customer & cart ───────────────────────────── */

export interface CustomerDTO {
  id: string;
  phone: string;
  email: string | null;
  fullName: string | null;
  whatsappOptIn: boolean;
  marketingOptIn: boolean;
}

export interface AddressDTO {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  line1: string;
  line2: string;
  area: string;
  city: string;
  state: string;
  pincode: string;
  landmark: string | null;
  addressType: AddressType;
  isDefault: boolean;
}

export interface CartLineDTO {
  id: string;
  variantId: string;
  productId: string;
  slug: string;
  name: string;
  size: string;
  color: string | null;
  imageUrl: string | null;
  quantity: number;
  unitPricePaise: number;
  unitMrpPaise: number;
  lineSubtotalPaise: number;
  discountPaise: number;
  lineTotalPaise: number;
  available: number;
  /** Set when the line can't be purchased as-is (out of stock, inactive…). */
  issue: "OUT_OF_STOCK" | "INSUFFICIENT_STOCK" | "UNAVAILABLE" | null;
}

export interface CartTotalsDTO {
  mrpTotalPaise: number;
  subtotalPaise: number;
  productSavingsPaise: number;
  discountPaise: number;
  shippingPaise: number;
  codFeePaise: number;
  totalPaise: number;
  itemCount: number;
  freeShippingRemainingPaise: number;
}

export interface CartDTO {
  id: string | null;
  lines: CartLineDTO[];
  totals: CartTotalsDTO;
  appliedCoupons: { code: string; discountPaise: number }[];
  couponErrors: { code: string; errorCode: string; message: string }[];
  hasIssues: boolean;
}

export interface WishlistItemDTO {
  productId: string;
  addedAt: string;
  product: ProductCardDTO;
}

/* ─────────────────────────────── Checkout ─────────────────────────────── */

export interface QuoteDTO extends CartDTO {
  paymentMethod: PaymentMethod | null;
  codAvailable: boolean;
  codUnavailableReason: string | null;
}

export interface PlaceOrderResultDTO {
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  totalPaise: number;
  /** Present for prepaid orders: data for the gateway's client checkout. */
  payment: { provider: string; clientCheckout: Record<string, string | number> } | null;
}

/* ───────────────────────────────── Orders ───────────────────────────────── */

export interface OrderItemDTO {
  id: string;
  productId: string;
  variantId: string;
  sku: string;
  productName: string;
  size: string;
  imageUrl: string | null;
  quantity: number;
  unitMrpPaise: number;
  unitPricePaise: number;
  lineSubtotalPaise: number;
  discountPaise: number;
  lineTotalPaise: number;
  /** Units still eligible for a new return/exchange/refund request. */
  returnableQuantity: number;
  productSlug: string | null;
}

export interface StatusHistoryDTO {
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  actorType: "CUSTOMER" | "ADMIN" | "SYSTEM";
  note: string | null;
  createdAt: string;
}

export interface ShipmentDTO {
  id: string;
  courierName: string | null;
  awb: string | null;
  trackingUrl: string | null;
  status: ShipmentStatus;
  events: { status: ShipmentStatus; description: string | null; location: string | null; occurredAt: string }[];
}

export interface OrderSummaryDTO {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  totalPaise: number;
  itemCount: number;
  placedAt: string;
  previewImages: string[];
}

export interface OrderDetailDTO extends OrderSummaryDTO {
  subtotalPaise: number;
  discountPaise: number;
  shippingPaise: number;
  codFeePaise: number;
  couponCodes: string[];
  shippingAddress: Omit<AddressDTO, "id" | "isDefault">;
  items: OrderItemDTO[];
  history: StatusHistoryDTO[];
  shipments: ShipmentDTO[];
  cancelDeadlineAt: string;
  canCancel: boolean;
  deliveredAt: string | null;
  returnDeadlineAt: string | null;
  canRequestReturn: boolean;
  returnUnavailableReason: string | null;
  returns: ReturnSummaryDTO[];
  refunds: RefundDTO[];
  cancelReason: string | null;
  paymentExpiresAt: string | null;
}

export interface TrackOrderDTO {
  orderNumber: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  placedAt: string;
  itemCount: number;
  city: string;
  history: StatusHistoryDTO[];
  shipments: ShipmentDTO[];
}

export interface ReturnSummaryDTO {
  id: string;
  returnNumber: string;
  orderNumber: string;
  type: ReturnType;
  status: ReturnStatus;
  reason: string;
  customerNote: string | null;
  infoRequest: string | null;
  createdAt: string;
  items: { orderItemId: string; productName: string; size: string; quantity: number; exchangeSize: string | null }[];
  refundPaise: number | null;
}

export interface RefundDTO {
  id: string;
  amountPaise: number;
  method: RefundMethod;
  status: RefundStatus;
  reason: string;
  returnNumber: string | null;
  createdAt: string;
  processedAt: string | null;
}

/* ───────────────────────────────── Admin ───────────────────────────────── */

/** A refund in the admin refunds queue, with the order it belongs to. */
export interface AdminRefundRowDTO extends RefundDTO {
  orderId: string;
  orderNumber: string;
  paymentMethod: PaymentMethod;
  failureReason: string | null;
}

export interface AdminSessionDTO {
  id: string;
  email: string;
  fullName: string;
  role: AdminRole;
  permissions: Permission[];
  mfaEnabled: boolean;
  mfaRequired: boolean;
}

/** What the admin must do after a correct password. */
export type AdminLoginStep = "verify" | "enroll" | "done";

export interface AdminMfaStatusDTO {
  email: string;
  enabled: boolean;
  required: boolean;
  /** False while the session is waiting for the second factor or for enrolment. */
  sessionVerified: boolean;
  recoveryCodesRemaining: number;
}

export interface AdminMfaSetupDTO {
  secret: string;
  otpauthUrl: string;
  qrDataUrl: string;
}

export interface KpiDTO {
  revenuePaise: number;
  orders: number;
  customers: number;
  newCustomers: number;
  averageOrderValuePaise: number;
  conversionRate: number;
  abandonedCheckouts: number;
  codPendingApproval: number;
  refundsPaise: number;
  refundCount: number;
  openReturns: number;
  lowStockVariants: number;
}

export interface TimePoint {
  date: string;
  revenuePaise: number;
  orders: number;
  customers: number;
}

export interface DashboardDTO {
  range: { from: string; to: string };
  kpis: KpiDTO;
  series: TimePoint[];
  salesByCategory: { category: string; revenuePaise: number; units: number }[];
  topProducts: { productId: string; name: string; units: number; revenuePaise: number }[];
  orderStatusDistribution: { status: OrderStatus; count: number }[];
  paymentStatusDistribution: { status: PaymentStatus; count: number }[];
  acquisition: { source: string; customers: number }[];
  funnel: { stage: string; count: number }[];
  codPending: AdminOrderRowDTO[];
  lowStock: LowStockRowDTO[];
  inventory: InventorySummaryDTO;
}

export interface InventorySummaryDTO {
  totalProducts: number;
  activeProducts: number;
  lowStockProducts: number;
  outOfStockProducts: number;
  recentRestocks: {
    productId: string;
    productName: string;
    size: string;
    quantity: number;
    actor: string | null;
    createdAt: string;
  }[];
}

export interface AnalyticsDTO {
  range: { from: string; to: string };
  visitors: number;
  productViews: number;
  addToCartRate: number;
  checkoutRate: number;
  paymentSuccessRate: number;
  conversionRate: number;
  averageOrderValuePaise: number;
  revenuePaise: number;
  returningCustomers: number;
  returningCustomerRate: number;
  abandonedCheckoutRate: number;
  cartRecoveryRate: number;
  topProducts: { productId: string; name: string; views: number; addToCarts: number; units: number; revenuePaise: number }[];
  categoryPerformance: { category: string; revenuePaise: number; units: number; orders: number }[];
  topSearches: { query: string; count: number }[];
  series: { date: string; visitors: number; orders: number; revenuePaise: number }[];
}

export interface AdminOrderRowDTO {
  id: string;
  orderNumber: string;
  customerName: string | null;
  customerPhone: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  totalPaise: number;
  itemCount: number;
  placedAt: string;
  city: string;
  pincode: string;
  riskFlags: string[];
  items: { productName: string; size: string; quantity: number }[];
  shippingAddress?: Omit<AddressDTO, "id" | "isDefault">;
  /** COD review snoozed until this time ("remind me later"), or null. */
  codReviewRemindedUntil: string | null;
}

export interface AdminOrderDetailDTO extends OrderDetailDTO {
  customer: { id: string; fullName: string | null; phone: string; email: string | null; orderCount: number };
  riskFlags: string[];
  payments: {
    id: string;
    provider: string;
    providerOrderId: string | null;
    providerPaymentId: string | null;
    amountPaise: number;
    status: PaymentStatus;
    isDuplicate: boolean;
    failureReason: string | null;
    createdAt: string;
  }[];
  notes: { id: string; body: string; author: string; createdAt: string }[];
  audit: AuditLogDTO[];
  allowedTransitions: OrderStatus[];
}

export interface LowStockRowDTO {
  variantId: string;
  productId: string;
  productName: string;
  sku: string;
  size: string;
  onHand: number;
  reserved: number;
  available: number;
  lowStockThreshold: number;
}

export interface InventoryRowDTO extends LowStockRowDTO {
  imageUrl: string | null;
  isActive: boolean;
}

export interface InventoryTxnDTO {
  id: string;
  type: InventoryTxnType;
  onHandDelta: number;
  reservedDelta: number;
  onHandAfter: number;
  reservedAfter: number;
  orderNumber: string | null;
  note: string | null;
  actor: string | null;
  createdAt: string;
}

export interface AdminProductRowDTO {
  id: string;
  name: string;
  slug: string;
  sku: string;
  imageUrl: string | null;
  pricePaise: number;
  mrpPaise: number;
  discountPercent: number;
  isActive: boolean;
  isFeatured: boolean;
  isBestSeller: boolean;
  isNewArrival: boolean;
  totalStock: number;
  variantCount: number;
  /** Active sizes at or below their low-stock threshold (but not zero), and sizes with nothing available. */
  lowVariants: number;
  outVariants: number;
  status: ProductStatus;
  stockState: StockState;
  categories: string[];
  updatedAt: string;
}

export interface AdminProductDetailDTO {
  id: string;
  name: string;
  slug: string;
  sku: string;
  shortDescription: string | null;
  description: string | null;
  productType: string;
  fabric: string | null;
  pattern: string | null;
  color: string | null;
  tags: string[];
  mrpPaise: number;
  pricePaise: number;
  categoryIds: string[];
  primaryCategoryId: string | null;
  isFeatured: boolean;
  isBestSeller: boolean;
  isNewArrival: boolean;
  isActive: boolean;
  status: ProductStatus;
  archivedAt: string | null;
  /** True only when nothing references the product (no orders, no stock movements): safe to delete permanently. */
  deletable: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
  images: (ImageDTO & { provider: string; sortOrder: number })[];
  variants: (VariantDTO & {
    isActive: boolean;
    onHand: number;
    reserved: number;
    pricePaiseOverride: number | null;
    mrpPaiseOverride: number | null;
    sortOrder: number;
    lowStockThreshold: number;
  })[];
}

export interface AdminCategoryDTO extends CategoryDTO {
  sortOrder: number;
  isActive: boolean;
  isNavigable: boolean;
}

export interface AdminCustomerRowDTO {
  id: string;
  fullName: string | null;
  phone: string;
  email: string | null;
  orderCount: number;
  totalSpentPaise: number;
  lastOrderAt: string | null;
  createdAt: string;
  isBlocked: boolean;
}

export interface AdminCustomerDetailDTO extends AdminCustomerRowDTO {
  averageOrderValuePaise: number;
  whatsappOptIn: boolean;
  marketingOptIn: boolean;
  acquisitionSource: string | null;
  addresses: AddressDTO[];
  orders: OrderSummaryDTO[];
  wishlist: { productId: string; name: string; slug: string }[];
  cart: { name: string; size: string; quantity: number }[];
  checkouts: { id: string; status: CheckoutStatus; totalPaise: number; lastActivityAt: string; recoveryStatus: RecoveryStatus }[];
  returns: ReturnSummaryDTO[];
  refunds: RefundDTO[];
  events: { type: string; path: string | null; createdAt: string; metadata: Record<string, unknown> | null }[];
  whatsappMessages: {
    direction: "INBOUND" | "OUTBOUND";
    body: string | null;
    status: NotificationStatus;
    createdAt: string;
    templateTopic: string | null;
  }[];
}

export interface AdminCouponDTO {
  id: string;
  code: string;
  description: string | null;
  type: "PERCENTAGE" | "FIXED_AMOUNT";
  value: number;
  minOrderPaise: number;
  maxDiscountPaise: number | null;
  startsAt: string | null;
  endsAt: string | null;
  usageLimit: number | null;
  usedCount: number;
  perCustomerLimit: number | null;
  isActive: boolean;
  newCustomersOnly: boolean;
  firstOrderOnly: boolean;
  isStackable: boolean;
  productIds: string[];
  categoryIds: string[];
  totalDiscountPaise: number;
  createdAt: string;
}

export interface AdminReturnRowDTO extends ReturnSummaryDTO {
  orderId: string;
  customerName: string | null;
  customerPhone: string;
  adminNote: string | null;
  refundablePaise: number;
  refunds: RefundDTO[];
  paymentMethod: PaymentMethod;
  allowedTransitions: ReturnStatus[];
}

export interface AbandonedCheckoutDTO {
  id: string;
  customerId: string;
  customerName: string | null;
  customerPhone: string;
  status: CheckoutStatus;
  recoveryStatus: RecoveryStatus;
  totalPaise: number;
  items: { name: string; size: string; quantity: number; unitPricePaise: number }[];
  step: string;
  lastActivityAt: string;
  abandonedAt: string | null;
  convertedOrderNumber: string | null;
}

export interface AuditLogDTO {
  id: string;
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
}

export interface AdminUserDTO {
  id: string;
  email: string;
  fullName: string;
  role: AdminRole;
  isActive: boolean;
  lastLoginAt: string | null;
  mfaEnrolled: boolean;
  createdAt: string;
}

export interface RoleDTO {
  id: string;
  key: AdminRole;
  name: string;
  description: string | null;
  permissions: Permission[];
}

export interface WhatsAppConversationDTO {
  id: string;
  phone: string;
  customerName: string | null;
  lastMessageAt: string | null;
  messageCount: number;
  /** Free-form replies are allowed until this time (24h after the customer's last message). */
  serviceWindowExpiresAt: string | null;
}

export interface WhatsAppTemplateDTO {
  id: string;
  topic: string;
  providerTemplateName: string;
  language: string;
  variables: string[];
  previewBody: string;
  isApproved: boolean;
  isActive: boolean;
}

export interface StoreSettingsDTO {
  freeShippingThresholdPaise: number;
  flatShippingPaise: number;
  codEnabled: boolean;
  codFeePaise: number;
  codMaxOrderPaise: number;
  lowStockThreshold: number;
}
