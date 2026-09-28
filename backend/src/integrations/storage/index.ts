import { mkdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join, normalize, resolve } from "node:path";
import { env } from "../../config/env";

/**
 * Media storage abstraction.
 *
 * Product images are stored in the database as (provider, storageKey). The UI
 * never constructs URLs — `resolveImageUrl` does, so assets can migrate from
 * the legacy WooCommerce server to Supabase Storage / S3 / Cloudinary by
 * re-keying rows, with zero UI changes.
 */
export type ImageProviderKey = "external" | "local" | "supabase";

export interface StorageProvider {
  readonly name: Exclude<ImageProviderKey, "external">;
  upload(key: string, bytes: Uint8Array, contentType: string): Promise<{ key: string }>;
  delete(key: string): Promise<void>;
}

/**
 * Relative to the working directory (the backend package when run through npm
 * or the container), not to this file: the production bundle lives in dist/,
 * where a source-relative path would point outside the project.
 */
export const LOCAL_UPLOAD_DIR = resolve(process.env.UPLOAD_DIR || "uploads");
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
  return new LocalDiskStorage();
}

/** Resolves a stored image reference into a URL the browser can load. */
export function resolveImageUrl(provider: string, storageKey: string): string {
  switch (provider as ImageProviderKey) {
    case "external":
      return storageKey;
    case "supabase":
      return `${env.SUPABASE_URL}/storage/v1/object/public/${env.SUPABASE_STORAGE_BUCKET}/${storageKey}`;
    case "local":
    default:
      return `${LOCAL_UPLOAD_ROUTE}/${storageKey}`;
  }
}
