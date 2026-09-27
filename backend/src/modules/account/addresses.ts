import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import type { z } from "zod";
import type { AppEnv } from "../../app-env";
import type { AddressDTO } from "../../contracts/dto";
import { addressInputSchema } from "../../contracts/storefront";
import { db, type DbOrTx } from "../../db/client";
import { addresses } from "../../db/schema";
import { DomainError } from "../../domain/errors";
import { readJson } from "../../lib/http";
import { customerOf, requireCustomer } from "../auth/middleware";
import { recordEvent } from "../events/service";

const MAX_ADDRESSES = 20;

type Row = typeof addresses.$inferSelect;
export const toAddressDTO = (a: Row): AddressDTO => ({
  id: a.id,
  fullName: a.fullName,
  phone: a.phone,
  email: a.email,
  line1: a.line1,
  line2: a.line2,
  area: a.area,
  city: a.city,
  state: a.state,
  pincode: a.pincode,
  landmark: a.landmark,
  addressType: a.addressType,
  isDefault: a.isDefault,
});

export async function listAddresses(userId: string) {
  const rows = await db
    .select()
    .from(addresses)
    .where(and(eq(addresses.userId, userId), isNull(addresses.deletedAt)))
    .orderBy(desc(addresses.isDefault), desc(addresses.updatedAt));
  return rows.map(toAddressDTO);
}

/** Loads an address only if it belongs to the customer (prevents IDOR). */
export async function getOwnedAddress(tx: DbOrTx, userId: string, addressId: string) {
  const [row] = await tx
    .select()
    .from(addresses)
    .where(and(eq(addresses.id, addressId), eq(addresses.userId, userId), isNull(addresses.deletedAt)));
  if (!row) throw new DomainError("ADDRESS_NOT_FOUND", "Please choose a delivery address.", 404);
  return row;
}

async function upsert(userId: string, input: z.output<typeof addressInputSchema>, addressId?: string) {
  return db.transaction(async (tx) => {
    const [{ n } = { n: 0 }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(addresses)
      .where(and(eq(addresses.userId, userId), isNull(addresses.deletedAt)));
    const makeDefault = input.isDefault || Number(n) === 0;
    if (makeDefault) {
      await tx
        .update(addresses)
        .set({ isDefault: false })
        .where(and(eq(addresses.userId, userId), eq(addresses.isDefault, true)));
    }
    if (addressId) {
      await getOwnedAddress(tx, userId, addressId);
      const [row] = await tx
        .update(addresses)
        .set({ ...input, isDefault: makeDefault || undefined })
        .where(eq(addresses.id, addressId))
        .returning();
      return toAddressDTO(row!);
    }
    if (Number(n) >= MAX_ADDRESSES) throw new DomainError("ADDRESS_LIMIT", `You can save up to ${MAX_ADDRESSES} addresses.`, 422);
    const [row] = await tx
      .insert(addresses)
      .values({ ...input, userId, isDefault: makeDefault })
      .returning();
    return toAddressDTO(row!);
  });
}

export const addressRoutes = new Hono<AppEnv>()
  .use(requireCustomer)
  .get("/", async (c) => c.json(await listAddresses(customerOf(c).id)))
  .post("/", async (c) => {
    const input = await readJson(c, addressInputSchema);
    const address = await upsert(customerOf(c).id, input);
    await recordEvent({ type: "ADDRESS_ADDED", userId: customerOf(c).id, metadata: { city: address.city } });
    return c.json(address, 201);
  })
  .put("/:id", async (c) => {
    const input = await readJson(c, addressInputSchema);
    return c.json(await upsert(customerOf(c).id, input, c.req.param("id")));
  })
  .post("/:id/default", async (c) => {
    const userId = customerOf(c).id;
    await db.transaction(async (tx) => {
      await getOwnedAddress(tx, userId, c.req.param("id"));
      await tx
        .update(addresses)
        .set({ isDefault: false })
        .where(and(eq(addresses.userId, userId), eq(addresses.isDefault, true)));
      await tx
        .update(addresses)
        .set({ isDefault: true })
        .where(eq(addresses.id, c.req.param("id")));
    });
    return c.json(await listAddresses(userId));
  })
  .delete("/:id", async (c) => {
    const userId = customerOf(c).id;
    // Soft delete: past orders keep their own address snapshot.
    await getOwnedAddress(db, userId, c.req.param("id"));
    await db
      .update(addresses)
      .set({ deletedAt: new Date(), isDefault: false })
      .where(eq(addresses.id, c.req.param("id")));
    return c.json(await listAddresses(userId));
  });
