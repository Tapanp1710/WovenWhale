/**
 * Read-only database health check. Safe against any environment (it never
 * writes): run it after `db:migrate` locally, on Supabase development, staging
 * and production. Exits non-zero when something is wrong.
 *
 *   npm run db:verify
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sqlClient as sql } from "../src/db/client";

const journal = JSON.parse(readFileSync(fileURLToPath(new URL("../drizzle/meta/_journal.json", import.meta.url)), "utf8")) as {
  entries: { tag: string }[];
};
const problems: string[] = [];
const ok = (msg: string) => console.log(`  ✓ ${msg}`);
const one = async <T>(rows: Promise<readonly T[]>) => (await rows)[0]!;

const { version } = await one(sql<{ version: string }[]>`select current_setting('server_version') as version`);
ok(`PostgreSQL ${version}`);

const { applied } = await one(sql<{ applied: number }[]>`select count(*)::int as applied from drizzle.__drizzle_migrations`.catch(() => [{ applied: 0 }]));
if (applied === journal.entries.length) ok(`all ${applied} migrations applied`);
else problems.push(`${applied} of ${journal.entries.length} migrations applied — run npm run db:migrate`);

const noRls = await sql<{ tablename: string }[]>`
  select tablename from pg_tables where schemaname = 'public' and not rowsecurity order by tablename`;
if (noRls.length === 0) ok("row level security enabled on every public table");
else problems.push(`RLS disabled on: ${noRls.map((t) => t.tablename).join(", ")}`);

const { supabase } = await one(sql<{ supabase: boolean }[]>`select exists (select 1 from pg_roles where rolname = 'anon') as supabase`);
if (supabase) {
  const grants = await sql<{ grantee: string; table_name: string; privilege_type: string }[]>`
    select grantee, table_name, privilege_type from information_schema.role_table_grants
    where table_schema = 'public' and grantee in ('anon', 'authenticated')`;
  if (grants.length === 0) ok("anon/authenticated have no table privileges (Supabase Data API exposes nothing)");
  else problems.push(`Supabase API roles have grants: ${grants.slice(0, 10).map((g) => `${g.grantee}:${g.privilege_type}:${g.table_name}`).join(", ")}`);
  const policies = await sql<{ n: number }[]>`select count(*)::int as n from pg_policies where schemaname = 'public'`;
  if (policies[0]!.n === 0) ok("no RLS policies (deny-by-default)");
  else problems.push(`${policies[0]!.n} RLS policies exist in public — review them; the API is the only intended data path`);
} else {
  ok("not a Supabase database (no anon role) — grant checks skipped");
}

const { roles } = await one(sql<{ roles: number }[]>`select count(*)::int as roles from roles`);
if (roles > 0) ok(`${roles} admin roles present`);
else problems.push("no admin roles — run npm run db:bootstrap -w backend (production) or npm run db:seed (development)");

await sql.end();
if (problems.length) {
  console.error(`\n✗ ${problems.length} problem(s):\n${problems.map((p) => `  • ${p}`).join("\n")}`);
  process.exit(1);
}
console.log("\n✓ Database verified");
