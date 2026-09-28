/**
 * Downloads every catalog image in the snapshot once, converts it to WebP and
 * stores it with the storefront (frontend/public/catalog/<slug>/<n>.webp), so
 * the shop no longer depends on the old WooCommerce media server.
 *
 *   npm run catalog:images -w backend            # convert what's missing
 *   npm run catalog:images -w backend -- --force # redo everything
 *
 * The snapshot keeps each original URL (provenance) and gains `localPath`,
 * `width` and `height`; seeding then stores the images as `static` files.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { toWebp } from "../../src/lib/images";

const SNAPSHOT = fileURLToPath(new URL("../../seed/data/catalog.snapshot.json", import.meta.url));
const PUBLIC_DIR = fileURLToPath(new URL("../../../frontend/public", import.meta.url));
const force = process.argv.includes("--force");

type Image = { url: string; alt: string | null; width: number | null; height: number | null; localPath?: string };
type Snapshot = { products: { slug: string; images: Image[] }[] } & Record<string, unknown>;

async function main() {
  const snapshot = JSON.parse(await readFile(SNAPSHOT, "utf8")) as Snapshot;
  let converted = 0;
  let skipped = 0;
  let failed = 0;
  let bytes = 0;

  for (const product of snapshot.products) {
    for (const [i, image] of product.images.entries()) {
      const localPath = `catalog/${product.slug}/${i + 1}.webp`;
      const file = join(PUBLIC_DIR, localPath);
      if (!force && image.localPath === localPath && existsSync(file)) {
        skipped++;
        continue;
      }
      try {
        const res = await fetch(image.url, { signal: AbortSignal.timeout(30_000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const webp = await toWebp(new Uint8Array(await res.arrayBuffer()));
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, webp.data);
        Object.assign(image, { localPath, width: webp.width, height: webp.height });
        converted++;
        bytes += webp.data.length;
      } catch (error) {
        failed++;
        console.warn(`  ✗ ${product.slug} #${i + 1}: ${(error as Error).message} (${image.url})`);
      }
    }
    process.stdout.write(".");
  }

  await writeFile(SNAPSHOT, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`\n✓ ${converted} converted (${(bytes / 1024 / 1024).toFixed(1)} MB), ${skipped} already done, ${failed} failed`);
  if (failed) process.exit(1);
}

await main();
