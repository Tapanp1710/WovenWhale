import { env } from "../config/env";
import { ConsoleEmailProvider, type EmailProvider } from "./email";
import { MockOTPProvider } from "./otp/mock";
import { TwilioVerifyOTPProvider } from "./otp/twilio";
import type { OTPProvider } from "./otp/types";
import { MockPaymentProvider } from "./payments/mock";
import { RazorpayPaymentProvider } from "./payments/razorpay";
import type { PaymentProvider } from "./payments/types";
import { ManualShippingProvider } from "./shipping/manual";
import type { ShippingProvider } from "./shipping/types";
import { createStorageProvider, type StorageProvider } from "./storage";
import { LogWhatsAppProvider } from "./whatsapp/log";
import { MetaWhatsAppProvider } from "./whatsapp/meta";
import type { WhatsAppProvider } from "./whatsapp/types";

/**
 * Provider registry — the only place that maps configuration to concrete
 * adapters. Adding another provider (MSG91, Shiprocket, …) = implement the interface
 * and add a case here (see docs/integrations.md).
 */
function notConfigured(kind: string, value: string): never {
  throw new Error(`${kind}=${value} has no adapter yet. See docs/integrations.md.`);
}

function createPaymentProvider(): PaymentProvider {
  switch (env.PAYMENT_PROVIDER) {
    case "mock":
      return new MockPaymentProvider(env.MOCK_PAYMENT_WEBHOOK_SECRET);
    case "razorpay":
      return new RazorpayPaymentProvider(env.RAZORPAY_KEY_ID, env.RAZORPAY_KEY_SECRET, env.RAZORPAY_WEBHOOK_SECRET);
    default:
      return notConfigured("PAYMENT_PROVIDER", env.PAYMENT_PROVIDER);
  }
}

function createOTPProvider(): OTPProvider {
  switch (env.OTP_PROVIDER) {
    case "mock":
      return new MockOTPProvider(env.SESSION_SECRET, env.OTP_DEV_FIXED_CODE);
    case "twilio":
      return new TwilioVerifyOTPProvider({
        accountSid: env.TWILIO_ACCOUNT_SID,
        authToken: env.TWILIO_AUTH_TOKEN,
        serviceSid: env.TWILIO_VERIFY_SERVICE_SID,
        channel: env.TWILIO_VERIFY_CHANNEL,
      });
    default:
      return notConfigured("OTP_PROVIDER", env.OTP_PROVIDER);
  }
}

function createWhatsAppProvider(): WhatsAppProvider {
  switch (env.WHATSAPP_PROVIDER) {
    case "log":
      return new LogWhatsAppProvider(env.WHATSAPP_APP_SECRET);
    case "meta":
      return new MetaWhatsAppProvider({
        accessToken: env.WHATSAPP_ACCESS_TOKEN,
        phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
        appSecret: env.WHATSAPP_APP_SECRET,
        graphVersion: env.WHATSAPP_GRAPH_VERSION,
      });
    default:
      return notConfigured("WHATSAPP_PROVIDER", env.WHATSAPP_PROVIDER);
  }
}

function createShippingProvider(): ShippingProvider {
  switch (env.SHIPPING_PROVIDER) {
    case "manual":
      return new ManualShippingProvider(env.SHIPPING_WEBHOOK_SECRET);
    default:
      return notConfigured("SHIPPING_PROVIDER", env.SHIPPING_PROVIDER);
  }
}

function createEmailProvider(): EmailProvider {
  switch (env.EMAIL_PROVIDER) {
    case "console":
      return new ConsoleEmailProvider();
    default:
      return notConfigured("EMAIL_PROVIDER", env.EMAIL_PROVIDER);
  }
}

export const providers: {
  payments: PaymentProvider;
  otp: OTPProvider;
  whatsapp: WhatsAppProvider;
  shipping: ShippingProvider;
  email: EmailProvider;
  storage: StorageProvider;
} = {
  payments: createPaymentProvider(),
  otp: createOTPProvider(),
  whatsapp: createWhatsAppProvider(),
  shipping: createShippingProvider(),
  email: createEmailProvider(),
  storage: createStorageProvider(),
};
