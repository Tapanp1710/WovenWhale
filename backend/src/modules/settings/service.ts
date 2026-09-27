import { inArray } from "drizzle-orm";
import type { AdminContext } from "../../app-env";
import { env } from "../../config/env";
import type { StoreConfigDTO, StoreSettingsDTO } from "../../contracts/dto";
import { db } from "../../db/client";
import { storeSettings } from "../../db/schema";
import type { ShippingRules } from "../../domain/pricing";
import { recordAudit } from "../../lib/audit";

/** Defaults used until an admin saves settings. */
const DEFAULTS: StoreSettingsDTO = {
  freeShippingThresholdPaise: 99900,
  flatShippingPaise: 9900,
  codEnabled: true,
  codFeePaise: 0,
  codMaxOrderPaise: 1000000,
  lowStockThreshold: 3,
};

const KEY = "store";
let cache: { value: StoreSettingsDTO; at: number } | null = null;
const TTL_MS = 30_000;

export async function getStoreSettings(): Promise<StoreSettingsDTO> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const [row] = await db
    .select()
    .from(storeSettings)
    .where(inArray(storeSettings.key, [KEY]));
  const value = { ...DEFAULTS, ...((row?.value as Partial<StoreSettingsDTO>) ?? {}) };
  cache = { value, at: Date.now() };
  return value;
}

export async function updateStoreSettings(admin: AdminContext, next: StoreSettingsDTO): Promise<StoreSettingsDTO> {
  const before = await getStoreSettings();
  await db.transaction(async (tx) => {
    await tx
      .insert(storeSettings)
      .values({ key: KEY, value: next, updatedByAdminId: admin.id })
      .onConflictDoUpdate({ target: storeSettings.key, set: { value: next, updatedByAdminId: admin.id, updatedAt: new Date() } });
    await recordAudit(tx, admin, { action: "settings.updated", entityType: "settings", entityId: KEY, before, after: next });
  });
  cache = null;
  return getStoreSettings();
}

export function shippingRules(s: StoreSettingsDTO): ShippingRules {
  return {
    freeShippingThresholdPaise: s.freeShippingThresholdPaise,
    flatShippingPaise: s.flatShippingPaise,
    codFeePaise: s.codFeePaise,
  };
}

export async function getPublicStoreConfig(): Promise<StoreConfigDTO> {
  const s = await getStoreSettings();
  return {
    freeShippingThresholdPaise: s.freeShippingThresholdPaise,
    flatShippingPaise: s.flatShippingPaise,
    codEnabled: s.codEnabled,
    codFeePaise: s.codFeePaise,
    codMaxOrderPaise: s.codMaxOrderPaise,
    cancellationWindowHours: env.ORDER_CANCELLATION_WINDOW_HOURS,
    returnWindowDays: env.RETURN_WINDOW_DAYS,
  };
}
