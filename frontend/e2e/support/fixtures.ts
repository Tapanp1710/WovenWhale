import { request as playwrightRequest, type APIRequestContext, type Browser, type BrowserContext } from "@playwright/test";
import type {
  AddressDTO,
  OrderDetailDTO,
  PlaceOrderResultDTO,
  ProductDetailDTO,
  ProductListResponse,
  QuoteDTO,
} from "@wovenwhale/backend/contracts";
import postgres from "postgres";

export const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
export const OTP_CODE = process.env.OTP_DEV_FIXED_CODE || "123456";
const ORIGIN = { Origin: BASE_URL };

/** A fresh, valid Indian mobile number per test so OTP and COD history never collide. */
export function uniquePhone(): string {
  return `6${String(Date.now()).slice(-6)}${String(Math.floor(Math.random() * 1000)).padStart(3, "0")}`;
}

async function json<T>(res: Awaited<ReturnType<APIRequestContext["get"]>>): Promise<T> {
  if (!res.ok()) throw new Error(`${res.url()} → ${res.status()} ${await res.text()}`);
  return (await res.json()) as T;
}

/** API client that behaves like the storefront (same origin, cookie session). */
export async function customerApi(phone = uniquePhone()) {
  const api = await playwrightRequest.newContext({ baseURL: BASE_URL, extraHTTPHeaders: ORIGIN });
  await json(await api.post("/api/auth/otp/send", { data: { phone } }));
  await json(await api.post("/api/auth/otp/verify", { data: { phone, code: OTP_CODE } }));
  return { api, phone };
}

export async function adminApi() {
  const api = await playwrightRequest.newContext({ baseURL: BASE_URL, extraHTTPHeaders: ORIGIN });
  await json(
    await api.post("/api/admin/auth/login", {
      data: {
        email: process.env.SEED_SUPER_ADMIN_EMAIL ?? "owner@wovenwhale.local",
        password: process.env.SEED_SUPER_ADMIN_PASSWORD ?? "ChangeMe!2026",
      },
    }),
  );
  return api;
}

/** Slug and variant of a product with stock left in the chosen size. */
export async function inStockProduct(api: APIRequestContext) {
  const list = await json<ProductListResponse>(await api.get("/api/catalog/products?availability=in-stock&sort=newest&pageSize=10"));
  for (const card of list.items) {
    const product = await json<ProductDetailDTO>(await api.get(`/api/catalog/products/${card.slug}`));
    const variant = product.variants.find((v) => v.available >= 3);
    if (variant) return { product, variant };
  }
  throw new Error("No product with enough stock for tests — run `npm run db:seed`.");
}

export async function addAddress(api: APIRequestContext, phone: string) {
  return json<AddressDTO>(
    await api.post("/api/account/addresses", {
      data: {
        fullName: "Test Customer",
        phone,
        line1: "Flat 7, Test Residency",
        line2: "1st Main Road",
        area: "Indiranagar",
        city: "Bengaluru",
        state: "Karnataka",
        pincode: "560038",
      },
    }),
  );
}

/** Places a real order through the API (cart → address → quote → order). */
export async function placeOrder(api: APIRequestContext, phone: string, method: "COD" | "PREPAID") {
  const { variant } = await inStockProduct(api);
  await json(await api.post("/api/cart/items", { data: { variantId: variant.id, quantity: 1 } }));
  const address = await addAddress(api, phone);
  const quote = await json<QuoteDTO>(await api.get(`/api/checkout/quote?paymentMethod=${method}`));
  return json<PlaceOrderResultDTO>(
    await api.post("/api/checkout/orders", {
      data: {
        addressId: address.id,
        paymentMethod: method,
        idempotencyKey: crypto.randomUUID(),
        expectedTotalPaise: quote.totals.totalPaise,
      },
    }),
  );
}

export async function orderId(admin: APIRequestContext, orderNumber: string) {
  const res = await json<{ items: { id: string }[] }>(await admin.get(`/api/admin/orders?q=${orderNumber}`));
  if (!res.items[0]) throw new Error(`Order ${orderNumber} not found`);
  return res.items[0].id;
}

/** Drives a COD order through approval and fulfilment to DELIVERED via the admin API. */
export async function deliverCodOrder(admin: APIRequestContext, orderNumber: string) {
  const id = await orderId(admin, orderNumber);
  await json(await admin.post(`/api/admin/orders/${id}/approve-cod`, { data: {} }));
  await json(await admin.post(`/api/admin/orders/${id}/status`, { data: { to: "PROCESSING" } }));
  await json(await admin.post(`/api/admin/orders/${id}/status`, { data: { to: "PACKED" } }));
  await json(
    await admin.post(`/api/admin/orders/${id}/shipments`, {
      data: { courierName: "Test Courier", awb: `E2E${Date.now()}`, trackingUrl: "" },
    }),
  );
  await json(await admin.post(`/api/admin/orders/${id}/status`, { data: { to: "DELIVERED" } }));
  return id;
}

export async function customerOrder(api: APIRequestContext, orderNumber: string) {
  return json<OrderDetailDTO>(await api.get(`/api/orders/${orderNumber}`));
}

/** Opens a browser context signed in as the same customer as `api`. */
export async function browserAs(browser: Browser, api: APIRequestContext): Promise<BrowserContext> {
  return browser.newContext({ storageState: await api.storageState(), baseURL: BASE_URL });
}

/**
 * Test-only clock control: moves an order's server-side deadlines into the
 * past, exactly as if the time had elapsed (the app never trusts the client clock).
 */
export async function expireDeadline(orderNumber: string, column: "cancel_deadline_at" | "return_deadline_at") {
  const sql = postgres(process.env.DATABASE_URL ?? "postgres://wovenwhale:wovenwhale@localhost:54329/wovenwhale", { onnotice: () => {} });
  try {
    await sql`update orders set ${sql(column)} = now() - interval '1 minute' where order_number = ${orderNumber}`;
  } finally {
    await sql.end();
  }
}
