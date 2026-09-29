import { mkdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join, normalize, resolve } from "node:path";
import { eq } from "drizzle-orm";
import { env, isProduction } from "../../config/env";
import { db } from "../../db/client";
import { storedFiles } from "../../db/schema";

/**
 * Media storage abstraction.
 *
 * Product images are stored in the database as (provider, storageKey). The UI
 * never constructs URLs — `resolveImageUrl` does, so assets can migrate from
 * the legacy WooCommerce server to Supabase Storage / S3 / Cloudinary by
 * re-keying rows, with zero UI changes.
 */
/** static: a file shipped with the storefront (frontend/public), e.g. the WebP catalog photos. */
export type ImageProviderKey = "external" | "static" | "local" | "database" | "supabase";

export interface StorageProvider {
  readonly name: Exclude<ImageProviderKey, "external" | "static">;
  upload(key: string, bytes: Uint8Array, contentType: string): Promise<{ key: string }>;
  delete(key: string): Promise<void>;
}

/**
 * Relative to the working directory (the backend package when run through npm
 * or the container), not to this file: the production bundle lives in dist/,
 * where a source-relative path would point outside the project.
 */
export const LOCAL_UPLOAD_DIR = resolve(process.env.UPLOAD_DIR || "uploads");
/** Public path the API serves database-stored files from (proxied through the storefront's /api). */
export const DATABASE_FILE_ROUTE = "/api/files";
/** Public path the backend serves local uploads from (proxied through the storefront's /api). */
export const LOCAL_UPLOAD_ROUTE = "/api/uploads";

class LocalDiskStorage implements StorageProvider {
  readonly name = "local" as const;

  private path(key: string) {
    const safe = normalize(key).replace(/^(\.\.[/\\])+/, "");
    return join(LOCAL_UPLOAD_DIR, safe);
  }

  async upload(key: string, bytes: Uint8Array) {
    const file = this.path(key);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, bytes);
    return { key };
  }

  async delete(key: string) {
    await unlink(this.path(key)).catch(() => undefined);
  }
}

/** Files kept in Postgres (stored_files). Durable wherever the database is, no extra service. */
class DatabaseStorage implements StorageProvider {
  readonly name = "database" as const;

  async upload(key: string, bytes: Uint8Array, contentType: string) {
    await db
      .insert(storedFiles)
      .values({ key, contentType, data: bytes })
      .onConflictDoUpdate({ target: storedFiles.key, set: { contentType, data: bytes } });
    return { key };
  }

  async delete(key: string) {
    await db.delete(storedFiles).where(eq(storedFiles.key, key));
  }
}

/** Supabase Storage via its REST API using the server-only service-role key. */
class SupabaseStorage implements StorageProvider {
  readonly name = "supabase" as const;

  private endpoint(key: string) {
    return `${env.SUPABASE_URL}/storage/v1/object/${env.SUPABASE_STORAGE_BUCKET}/${key}`;
  }

  private headers(extra: Record<string, string> = {}) {
    return { Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, ...extra };
  }

  async upload(key: string, bytes: Uint8Array, contentType: string) {
    const res = await fetch(this.endpoint(key), {
      method: "POST",
      headers: this.headers({ "Content-Type": contentType, "x-upsert": "true" }),
      body: bytes,
    });
    if (!res.ok) throw new Error(`Supabase upload failed (${res.status})`);
    return { key };
  }

  async delete(key: string) {
    await fetch(this.endpoint(key), { method: "DELETE", headers: this.headers() });
  }
}

export function createStorageProvider(): StorageProvider {
  if (env.STORAGE_PROVIDER === "supabase") {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("STORAGE_PROVIDER=supabase requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
    }
    return new SupabaseStorage();
  }
  // A production host's disk is not durable (Render wipes it on every deploy), so
  // "local" there means the database. ponytail: move to Supabase Storage/S3 once media grows past a few hundred MB.
  if (env.STORAGE_PROVIDER === "database" || isProduction) return new DatabaseStorage();
  return new LocalDiskStorage();
}

/** Resolves a stored image reference into a URL the browser can load. */
export function resolveImageUrl(provider: string, storageKey: string): string {
  switch (provider as ImageProviderKey) {
    case "external":
      return storageKey;
    case "static":
      return `/${storageKey}`;
    case "database":
      return `${DATABASE_FILE_ROUTE}/${storageKey}`;
    case "supabase":
      return `${env.SUPABASE_URL}/storage/v1/object/public/${env.SUPABASE_STORAGE_BUCKET}/${storageKey}`;
    case "local":
    default:
      return `${LOCAL_UPLOAD_ROUTE}/${storageKey}`;
  }
}
