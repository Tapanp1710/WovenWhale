/**
 * Catalog import CLI.
 *
 *   npm run catalog:import                                  # live Store API → snapshot file
 *   npm run catalog:import -- --file=dump.json              # Store API JSON dump → snapshot file
 *   npm run catalog:import -- --csv=wc-product-export.csv   # official WooCommerce CSV export
 *   add --apply to upsert into the database, --overwrite to replace admin edits
 *
 * The snapshot (seed/data/catalog.snapshot.json) is what `npm run db:seed` loads.
 */
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { sqlClient } from "../src/db/client";
import { applySnapshot } from "./catalog/apply";
import { fetchStoreApi, readStoreApiDump, readWooCsv } from "./catalog/sources";

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k!, v ?? "true"];
  }),
);

const SNAPSHOT = fileURLToPath(new URL("../seed/data/catalog.snapshot.json", import.meta.url));

const snapshot = args.has("csv")
  ? await readWooCsv(args.get("csv")!)
  : args.has("file")
    ? await readStoreApiDump(args.get("file")!)
    : await fetchStoreApi(args.get("url") ?? "https://wovenwhale.com");

console.log(`✓ Read ${snapshot.products.length} products from ${snapshot.source}`);

if (!args.has("no-snapshot")) {
  await writeFile(SNAPSHOT, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`✓ Snapshot written to seed/data/catalog.snapshot.json`);
}

if (args.has("apply")) {
  const report = await applySnapshot(snapshot, { overwrite: args.has("overwrite") });
  console.log("✓ Applied to database", report);
}
await sqlClient.end();
