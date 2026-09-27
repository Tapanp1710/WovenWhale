import { z } from "zod";
import { SHIPMENT_STATUSES } from "../../contracts/enums";
import { hmacSha256Hex, randomToken, safeEqual } from "../../lib/crypto";
import { InvalidSignatureError } from "../payments/types";
import {
  ShippingNotSupportedError,
  type CreateShipmentInput,
  type ShipmentInfo,
  type ShippingProvider,
  type TrackingEvent,
} from "./types";

const webhookSchema = z.object({
  events: z.array(
    z.object({
      awb: z.string(),
      status: z.enum(SHIPMENT_STATUSES),
      description: z.string().default(""),
      location: z.string().nullable().default(null),
      occurredAt: z.coerce.date(),
      id: z.string().nullable().default(null),
    }),
  ),
});

/**
 * Manual fulfilment: operations book the courier themselves and enter the
 * AWB/courier in the admin. Tracking updates come from admin actions or from
 * a generic signed webhook (`x-shipping-signature: hmac_sha256(secret, body)`).
 */
export class ManualShippingProvider implements ShippingProvider {
  readonly name = "manual";
  readonly automated = false;

  constructor(private readonly webhookSecret: string) {}

  async createShipment(_input: CreateShipmentInput): Promise<ShipmentInfo> {
    return { providerShipmentId: `manual_${randomToken(8)}`, awb: null, courierName: null, trackingUrl: null };
  }

  async generateAWB(): Promise<{ awb: string; courierName: string }> {
    throw new ShippingNotSupportedError("AWB generation");
  }

  async generateLabel(): Promise<{ labelUrl: string }> {
    throw new ShippingNotSupportedError("Label generation");
  }

  async track(): Promise<TrackingEvent[]> {
    return [];
  }

  async cancelShipment(): Promise<void> {
    // Nothing booked with a carrier — operations cancel the pickup directly.
  }

  async parseWebhook(rawBody: string, headers: Headers): Promise<TrackingEvent[]> {
    const signature = headers.get("x-shipping-signature") ?? "";
    if (!this.webhookSecret || !safeEqual(signature, hmacSha256Hex(this.webhookSecret, rawBody))) {
      throw new InvalidSignatureError();
    }
    return webhookSchema.parse(JSON.parse(rawBody)).events.map((e) => ({
      awb: e.awb,
      status: e.status,
      description: e.description,
      location: e.location,
      occurredAt: e.occurredAt,
      providerEventId: e.id,
    }));
  }
}
