/**
 * DEVELOPMENT ONLY — drops every table so migrations + seed can rebuild the
 * database from scratch. Refuses to run against anything but localhost.
 */
import postgres from "postgres";

const url = process.env.DATABASE_URL ?? "";
if (process.env.NODE_ENV === "production" || !/@(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)) {
  console.error("✗ db:reset only runs against a local development database.");
  process.exit(1);
}

const sql = postgres(url, { onnotice: () => {} });
await sql`drop schema if exists public cascade`;
await sql`drop schema if exists drizzle cascade`;
await sql`create schema public`;
await sql.end();
console.log("✓ Local database reset");
