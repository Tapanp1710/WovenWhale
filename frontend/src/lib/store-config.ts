import "server-only";
import type { StoreConfigDTO } from "@wovenwhale/backend/contracts";
import { publicApi } from "./api/server";

/** Live store settings with safe fallbacks so content pages still render if the API is down. */
export async function storeConfig(): Promise<StoreConfigDTO> {
  return publicApi<StoreConfigDTO>("/catalog/config", 300).catch(() => ({
    freeShippingThresholdPaise: 99900,
    flatShippingPaise: 9900,
    codEnabled: true,
    codFeePaise: 0,
    codMaxOrderPaise: 1000000,
    cancellationWindowHours: 12,
    returnWindowDays: 14,
  }));
}
