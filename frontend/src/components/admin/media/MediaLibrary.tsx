"use client";

import type { MediaAssetDTO } from "@wovenwhale/backend/contracts";
import { ImagePlus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { api, upload } from "@/lib/api/client";
import { useAction } from "../AdminContext";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Panel } from "../ui/Panel";
import { IMAGE_ACCEPT, MAX_IMAGE_BYTES } from "../website/MediaPicker";
import styles from "./MediaLibrary.module.css";

const kb = (bytes: number) => (bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`);

/** Browse, search, upload, describe and remove website images. */
export function MediaLibrary({ items, q }: { items: MediaAssetDTO[]; q: string }) {
  const router = useRouter();
  const { run, pending } = useAction();
  const [removing, setRemoving] = useState<MediaAssetDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function send(files: FileList | null) {
    setError(null);
    const list = [...(files ?? [])];
    const tooBig = list.find((f) => f.size > MAX_IMAGE_BYTES);
    if (tooBig) return setError(`${tooBig.name} is larger than 8 MB.`);
    for (const file of list) {
      const form = new FormData();
      form.set("file", file);
      form.set("alt", file.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " "));
      await run(() => upload("/admin/media", form), list.length === 1 ? "Image uploaded" : `${file.name} uploaded`);
    }
    if (input.current) input.current.value = "";
  }

  return (
    <Panel flush>
      <div className={styles.tools}>
        <form
          className={styles.search}
          onSubmit={(e) => {
            e.preventDefault();
            const value = new FormData(e.currentTarget).get("q")?.toString().trim();
            router.push(value ? `/admin/media?q=${encodeURIComponent(value)}` : "/admin/media");
          }}
        >
          <TextField label="Search" name="q" defaultValue={q} placeholder="Alt text or file name" />
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>
        <input
          ref={input}
          type="file"
          accept={IMAGE_ACCEPT}
          multiple
          className={styles.file}
          onChange={(e) => send(e.target.files)}
          aria-label="Upload images"
          data-testid="media-upload"
        />
        <Button icon={<ImagePlus size={16} aria-hidden="true" />} loading={pending} onClick={() => input.current?.click()}>
          Upload images
        </Button>
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <p className={styles.help}>JPEG, PNG, WebP or AVIF up to 8 MB. Every image is stored as WebP.</p>
      {items.length === 0 ? (
        <p className={styles.empty}>{q ? "No images match your search." : "No images yet. Upload photos to use them on the website."}</p>
      ) : (
        <ul className={styles.grid}>
          {items.map((m) => (
            <li key={m.id} className={styles.card}>
              <a href={m.url} target="_blank" rel="noopener" className={styles.frame} aria-label={`Open ${m.alt || "image"} full size`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.url} alt="" loading="lazy" />
              </a>
              <TextField
                label="Alt text"
                defaultValue={m.alt}
                onBlur={(e) => e.target.value.trim() !== m.alt && run(() => api(`/admin/media/${m.id}`, { method: "PATCH", body: { alt: e.target.value } }), "Alt text saved")}
              />
              <p className={styles.meta}>
                {m.width && m.height ? `${m.width} × ${m.height} · ` : ""}
                {kb(m.bytes)}
                {m.inUse && <span className={styles.inUse}>In use</span>}
              </p>
              <Button
                size="sm"
                variant="ghost"
                className={styles.remove}
                icon={<Trash2 size={15} aria-hidden="true" />}
                disabled={m.inUse}
                title={m.inUse ? "Used on the website or in a saved version" : undefined}
                onClick={() => setRemoving(m)}
              >
                Delete
              </Button>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Delete this image?"
        description="It isn't used anywhere on the website, so nothing changes for customers. This can't be undone."
        confirmLabel="Delete image"
        cancelLabel="Cancel"
        onConfirm={() =>
          run(async () => {
            await api(`/admin/media/${removing!.id}`, { method: "DELETE" });
            return true;
          }, "Image deleted")
        }
      />
    </Panel>
  );
}
