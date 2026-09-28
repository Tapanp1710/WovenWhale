import { z } from "zod";

const bool = z
  .enum(["true", "false", "1", "0", ""])
  .default("false")
  .transform((v) => v === "true" || v === "1");

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    /**
     * Public demonstration deployment. Allows the mock payment gateway and mock
     * OTP under NODE_ENV=production, and labels every page as a demo. Never set
     * it on the real store.
     */
    DEMO_MODE: bool,
    SITE_URL: z.url().default("http://localhost:3000"),
    BACKEND_PORT: z.coerce.number().int().default(4000),
    ALLOWED_ORIGINS: z.string().default("http://localhost:3000"),

    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).default(10),

    SUPABASE_URL: z.string().default(""),
    SUPABASE_SERVICE_ROLE_KEY: z.string().default(""),
    SUPABASE_STORAGE_BUCKET: z.string().default("product-images"),

    SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
    CUSTOMER_SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
    ADMIN_SESSION_TTL_HOURS: z.coerce.number().int().positive().default(12),
    /** Every admin must enrol in TOTP before using the console. Always on in production. */
    ADMIN_MFA_REQUIRED: bool,
    /** Key material for encrypting TOTP secrets and keying recovery-code hashes. Falls back to SESSION_SECRET outside production. */
    MFA_ENCRYPTION_KEY: z.string().default(""),

    ORDER_CANCELLATION_WINDOW_HOURS: z.coerce.number().positive().default(12),
    RETURN_WINDOW_DAYS: z.coerce.number().positive().default(14),
    PAYMENT_TIMEOUT_MINUTES: z.coerce.number().int().positive().default(30),
    ABANDONED_CHECKOUT_THRESHOLD_MINUTES: z.coerce.number().int().positive().default(60),

    PAYMENT_PROVIDER: z.enum(["mock", "razorpay"]).default("mock"),
    OTP_PROVIDER: z.enum(["mock", "msg91", "twilio", "supabase"]).default("mock"),
    WHATSAPP_PROVIDER: z.enum(["log", "meta"]).default("log"),
    SHIPPING_PROVIDER: z.enum(["manual", "shiprocket", "delhivery"]).default("manual"),
    EMAIL_PROVIDER: z.enum(["console", "resend", "ses"]).default("console"),
    STORAGE_PROVIDER: z.enum(["local", "supabase"]).default("local"),

    OTP_DEV_FIXED_CODE: z
      .string()
      .regex(/^\d{6}$/)
      .or(z.literal(""))
      .default(""),
    MOCK_PAYMENT_WEBHOOK_SECRET: z.string().default("dev-mock-gateway-secret"),

    RAZORPAY_KEY_ID: z.string().trim().default(""),
    RAZORPAY_KEY_SECRET: z.string().trim().default(""),
    RAZORPAY_WEBHOOK_SECRET: z.string().trim().default(""),

    TWILIO_ACCOUNT_SID: z.string().trim().default(""),
    TWILIO_AUTH_TOKEN: z.string().trim().default(""),
    TWILIO_VERIFY_SERVICE_SID: z.string().trim().default(""),
    TWILIO_VERIFY_CHANNEL: z.enum(["sms", "whatsapp"]).default("sms"),

    WHATSAPP_ACCESS_TOKEN: z.string().trim().default(""),
    WHATSAPP_PHONE_NUMBER_ID: z.string().trim().default(""),
    WHATSAPP_GRAPH_VERSION: z
      .string()
      .regex(/^v\d+\.\d+$/)
      .default("v21.0"),

    WHATSAPP_APP_SECRET: z.string().default(""),
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().default(""),
    WHATSAPP_SEND_ENABLED: bool,
    SHIPPING_WEBHOOK_SECRET: z.string().default(""),

    /** Header set by your edge/CDN with the real client IP (overwritten, not appended), e.g. cf-connecting-ip. */
    CLIENT_IP_HEADER: z.string().trim().toLowerCase().default(""),
    /** Number of proxies you control that append to X-Forwarded-For in front of the API. */
    TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),

    /** Scales every rate limit (local/CI test runs only; must be 1 in production). */
    RATE_LIMIT_MULTIPLIER: z.coerce.number().int().min(1).max(1000).default(1),

    REDIS_URL: z.string().default(""),
    SENTRY_DSN: z.string().default(""),
  })
  .superRefine((env, ctx) => {
    // A selected provider needs its credentials in every environment.
    const required: Partial<Record<string, (keyof typeof env)[]>> = {
      "PAYMENT_PROVIDER=razorpay": ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"],
      "OTP_PROVIDER=twilio": ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_VERIFY_SERVICE_SID"],
      "WHATSAPP_PROVIDER=meta": [
        "WHATSAPP_ACCESS_TOKEN",
        "WHATSAPP_PHONE_NUMBER_ID",
        "WHATSAPP_APP_SECRET",
        "WHATSAPP_WEBHOOK_VERIFY_TOKEN",
      ],
    };
    const selected = [
      `PAYMENT_PROVIDER=${env.PAYMENT_PROVIDER}`,
      `OTP_PROVIDER=${env.OTP_PROVIDER}`,
      `WHATSAPP_PROVIDER=${env.WHATSAPP_PROVIDER}`,
    ];
    for (const choice of selected) {
      for (const key of required[choice] ?? []) {
        if (!env[key]) ctx.addIssue({ code: "custom", path: [key], message: `${key} is required when ${choice}` });
      }
    }

    if (env.NODE_ENV !== "production") return;
    if (env.WHATSAPP_SEND_ENABLED && env.WHATSAPP_PROVIDER !== "meta") {
      ctx.addIssue({ code: "custom", path: ["WHATSAPP_SEND_ENABLED"], message: "WHATSAPP_SEND_ENABLED needs WHATSAPP_PROVIDER=meta" });
    }
    const origins = [env.SITE_URL, ...env.ALLOWED_ORIGINS.split(",")].map((o) => o.trim()).filter(Boolean);
    // localhost is exempt so the production build can be rehearsed on one machine.
    if (origins.some((o) => !o.startsWith("https://") && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o))) {
      ctx.addIssue({ code: "custom", path: ["ALLOWED_ORIGINS"], message: "SITE_URL and ALLOWED_ORIGINS must use https:// in production" });
    }
    // Refuse to boot production with development-only providers (a labelled demo may use them).
    const devOnly: [keyof typeof env, string][] = [
      ["PAYMENT_PROVIDER", "mock"],
      ["OTP_PROVIDER", "mock"],
    ];
    for (const [key, value] of devOnly) {
      if (env[key] === value && !env.DEMO_MODE) {
        ctx.addIssue({ code: "custom", path: [key], message: `${key}=${value} is not allowed in production (only with DEMO_MODE=true)` });
      }
    }
    // Razorpay test keys take no real money: only acceptable on a labelled demo.
    if (env.PAYMENT_PROVIDER === "razorpay" && env.RAZORPAY_KEY_ID.startsWith("rzp_test_") && !env.DEMO_MODE) {
      ctx.addIssue({ code: "custom", path: ["RAZORPAY_KEY_ID"], message: "Razorpay test keys are only allowed with DEMO_MODE=true" });
    }
    if (env.DEMO_MODE && env.RAZORPAY_KEY_ID.startsWith("rzp_live_")) {
      ctx.addIssue({ code: "custom", path: ["DEMO_MODE"], message: "DEMO_MODE must not be combined with live Razorpay keys" });
    }
    if (env.RATE_LIMIT_MULTIPLIER !== 1) {
      ctx.addIssue({ code: "custom", path: ["RATE_LIMIT_MULTIPLIER"], message: "Rate limits cannot be relaxed in production" });
    }
    if (!env.ADMIN_MFA_REQUIRED && !env.DEMO_MODE) {
      ctx.addIssue({
        code: "custom",
        path: ["ADMIN_MFA_REQUIRED"],
        message: "Admin two-factor authentication is mandatory in production (only a DEMO_MODE deployment may turn it off)",
      });
    }
    if (env.MFA_ENCRYPTION_KEY.length < 32 || env.MFA_ENCRYPTION_KEY === env.SESSION_SECRET) {
      ctx.addIssue({
        code: "custom",
        path: ["MFA_ENCRYPTION_KEY"],
        message: "Set a dedicated MFA_ENCRYPTION_KEY (32+ characters) in production",
      });
    }
    if (!env.CLIENT_IP_HEADER && env.TRUSTED_PROXY_HOPS === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["CLIENT_IP_HEADER"],
        message: "Set CLIENT_IP_HEADER or TRUSTED_PROXY_HOPS so rate limits see real client addresses (see docs/deployment.md)",
      });
    }
    if (env.SESSION_SECRET.startsWith("replace-with")) {
      ctx.addIssue({ code: "custom", path: ["SESSION_SECRET"], message: "Set a real SESSION_SECRET in production" });
    }
  });

export type Env = z.infer<typeof schema>;

function load(): Env {
  // Hosting platforms (Render, Railway, Fly) announce the port to bind in PORT.
  const parsed = schema.safeParse({ ...process.env, BACKEND_PORT: process.env.BACKEND_PORT || process.env.PORT });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  • ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

export const env = load();
export const isProduction = env.NODE_ENV === "production";
/** Never rotate this in place: existing TOTP secrets and recovery codes depend on it. */
export const mfaKey = env.MFA_ENCRYPTION_KEY || env.SESSION_SECRET;
export const allowedOrigins = new Set(
  env.ALLOWED_ORIGINS.split(",")
    .map((o) => o.trim())
    .filter(Boolean),
);
