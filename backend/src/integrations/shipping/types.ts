import type { ShipmentStatus } from "../../contracts/enums";

/**
 * Shipping aggregator contract (ShippingService transport). Shiprocket,
 * Delhivery, etc. become adapters implementing this interface.
 */
export interface CreateShipmentInput {
  orderNumber: string;
  address: {
    fullName: string;
    phone: string;
    line1: string;
    line2: string;
    area: string;
    city: string;
    state: string;
    pincode: string;
  };
  items: { sku: string; name: string; quantity: number; unitPricePaise: number }[];
  codAmountPaise: number;
  weightGrams: number;
}

export interface ShipmentInfo {
  providerShipmentId: string;
  awb: string | null;
  courierName: string | null;
  trackingUrl: string | null;
}

export interface TrackingEvent {
  awb: string;
  status: ShipmentStatus;
  description: string;
  location: string | null;
  occurredAt: Date;
  providerEventId: string | null;
}

export interface ShippingProvider {
  readonly name: string;
  /** Whether AWB/label generation is automated (false = entered manually by ops). */
  readonly automated: boolean;
  createShipment(input: CreateShipmentInput): Promise<ShipmentInfo>;
  generateAWB(providerShipmentId: string): Promise<{ awb: string; courierName: string }>;
  generateLabel(providerShipmentId: string): Promise<{ labelUrl: string }>;
  track(awb: string): Promise<TrackingEvent[]>;
  cancelShipment(providerShipmentId: string): Promise<void>;
  /** Verifies and parses a tracking webhook. Throws on an invalid signature. */
  parseWebhook(rawBody: string, headers: Headers): Promise<TrackingEvent[]>;
}

export class ShippingNotSupportedError extends Error {
  constructor(operation: string) {
    super(`${operation} is not supported by the configured shipping provider`);
    this.name = "ShippingNotSupportedError";
  }
}
