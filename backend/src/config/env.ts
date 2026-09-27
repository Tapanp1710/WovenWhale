import { z } from "zod";

const bool = z
  .enum(["true", "false", "1", "0", ""])
  .default("false")
  .transform((v) => v === "true" || v === "1");

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
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

    WHATSAPP_APP_SECRET: z.string().default(""),
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().default(""),
    WHATSAPP_SEND_ENABLED: bool,
    SHIPPING_WEBHOOK_SECRET: z.string().default(""),

    REDIS_URL: z.string().default(""),
    SENTRY_DSN: z.string().default(""),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== "production") return;
    // Refuse to boot production with development-only providers.
    const devOnly: [keyof typeof env, string][] = [
      ["PAYMENT_PROVIDER", "mock"],
      ["OTP_PROVIDER", "mock"],
    ];
    for (const [key, value] of devOnly) {
      if (env[key] === value) {
        ctx.addIssue({ code: "custom", path: [key], message: `${key}=${value} is not allowed in production` });
      }
    }
    if (env.SESSION_SECRET.startsWith("replace-with")) {
      ctx.addIssue({ code: "custom", path: ["SESSION_SECRET"], message: "Set a real SESSION_SECRET in production" });
    }
  });

export type Env = z.infer<typeof schema>;

function load(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  • ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

export const env = load();
export const isProduction = env.NODE_ENV === "production";
export const allowedOrigins = new Set(
  env.ALLOWED_ORIGINS.split(",")
    .map((o) => o.trim())
    .filter(Boolean),
);
