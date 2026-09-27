import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../config/env";
import * as schema from "./schema";

/**
 * Single shared connection pool. For Supabase use the pooled (Supavisor)
 * connection string; `prepare: false` keeps transaction-mode pooling safe.
 */
export const sqlClient = postgres(env.DATABASE_URL, {
  max: env.DATABASE_POOL_MAX,
  prepare: false,
  onnotice: () => {},
});

export const db = drizzle(sqlClient, { schema, casing: "snake_case" });

export type Database = typeof db;
/** A transaction handle — domain services accept this so callers control the boundary. */
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
/** Either the root db or an open transaction. */
export type DbOrTx = Database | Tx;
