/**
 * DEMO ONLY — wipes every row in a DEMO_MODE database and seeds it again.
 * The schema and migration history are kept. Requires DEMO_MODE=true and the
 * database host typed back as confirmation:
 *
 *   npm run demo:reset -w backend -- --confirm=<database host>
 */
import postgres from "postgres";

const url = process.env.DATABASE_URL ?? "";
const host = URL.canParse(url) ? new URL(url).hostname : "";
const confirm = process.argv.find((a) => a.startsWith("--confirm="))?.slice("--confirm=".length);

if (process.env.DEMO_MODE !== "true") {
  console.error("✗ demo:reset only runs with DEMO_MODE=true. For local development use npm run db:reset.");
  process.exit(1);
}
if (!host || confirm !== host) {
  console.error(`✗ This deletes ALL data in ${host || "(no DATABASE_URL)"}. Re-run with --confirm=${host || "<host>"}`);
  process.exit(1);
}

const sql = postgres(url, { onnotice: () => {}, prepare: false });
const tables = await sql<{ tablename: string }[]>`select tablename from pg_tables where schemaname = 'public'`;
if (tables.length) await sql.unsafe(`truncate ${tables.map((t) => `public."${t.tablename}"`).join(", ")} restart identity cascade`);
await sql.end();
console.log(`✓ Emptied ${tables.length} tables on ${host}; seeding demo data…`);
await import("./index");
