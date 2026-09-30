import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv } from "../../app-env";
import { adminReturnQuerySchema, refundApproveSchema, returnTransitionSchema } from "../../contracts/admin";
import type { AdminReturnRowDTO } from "../../contracts/dto";
import { RETURN_STATUSES } from "../../contracts/enums";
import { db } from "../../db/client";
import { orders, returns, users } from "../../db/schema";
import { evaluateReturnTransition } from "../../domain/returns";
import { notFound, readJson, readQuery } from "../../lib/http";
import { adminOf, requirePermission } from "../auth/middleware";
import { orderRefunds, returnSummaries } from "../orders/queries";
import { adminTransitionReturn, approveReturnRefund, refundableForReturn } from "../returns/service";

export async function adminReturnRows(ids: string[]): Promise<AdminReturnRowDTO[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({ r: returns, name: users.fullName, phone: users.phone, paymentMethod: orders.paymentMethod })
    .from(returns)
    .innerJoin(users, eq(users.id, returns.userId))
    .innerJoin(orders, eq(orders.id, returns.orderId))
    .where(inArray(returns.id, ids));
  const summaries = await returnSummaries({ orderIds: [...new Set(rows.map((r) => r.r.orderId))] });
  // Rows are built in parallel: sequential per-row queries made a page of returns take seconds.
  const built = await Promise.all(
    ids.map(async (id): Promise<AdminReturnRowDTO | null> => {
      const row = rows.find((r) => r.r.id === id);
      const summary = summaries.find((s) => s.id === id);
      if (!row || !summary) return null;
      const [refundable, refunds] = await Promise.all([refundableForReturn(db, row.r), orderRefunds(row.r.orderId)]);
      return {
        ...summary,
        orderId: row.r.orderId,
        customerName: row.name,
        customerPhone: row.phone,
        adminNote: row.r.adminNote,
        refundablePaise: refundable,
        refunds: refunds.filter((f) => f.returnNumber === row.r.returnNumber),
        paymentMethod: row.paymentMethod,
        allowedTransitions: RETURN_STATUSES.filter((to) => evaluateReturnTransition(row.r, to, "ADMIN").ok),
      };
    }),
  );
  return built.filter((r) => r !== null);
}

export const adminReturnRoutes = new Hono<AppEnv>()
  .get("/", requirePermission("returns.view"), async (c) => {
    const q = readQuery(c, adminReturnQuerySchema);
    const conds: SQL[] = [];
    if (q.status) conds.push(eq(returns.status, q.status));
    if (q.type) conds.push(eq(returns.type, q.type));
    const where = conds.length ? and(...conds) : undefined;
    const [rows, [{ total } = { total: 0 }]] = await Promise.all([
      db
        .select({ id: returns.id })
        .from(returns)
        .where(where)
        .orderBy(desc(returns.createdAt))
        .limit(q.pageSize)
        .offset((q.page - 1) * q.pageSize),
      db
        .select({ total: sql<number>`count(*)::int` })
        .from(returns)
        .where(where),
    ]);
    return c.json({
      items: await adminReturnRows(rows.map((r) => r.id)),
      page: q.page,
      pageSize: q.pageSize,
      total: Number(total),
      totalPages: Math.max(1, Math.ceil(Number(total) / q.pageSize)),
    });
  })
  .get("/:id", requirePermission("returns.view"), async (c) => {
    const [row] = await adminReturnRows([c.req.param("id")]);
    if (!row) throw notFound("Return");
    return c.json(row);
  })
  .post("/:id/transition", requirePermission("returns.manage"), async (c) => {
    const input = await readJson(c, returnTransitionSchema);
    await adminTransitionReturn(adminOf(c), c.req.param("id"), input);
    return c.json((await adminReturnRows([c.req.param("id")]))[0]);
  })
  .post("/:id/refund", requirePermission("refunds.approve"), async (c) => {
    const input = await readJson(c, refundApproveSchema);
    await approveReturnRefund(adminOf(c), c.req.param("id"), input);
    return c.json((await adminReturnRows([c.req.param("id")]))[0]);
  });
