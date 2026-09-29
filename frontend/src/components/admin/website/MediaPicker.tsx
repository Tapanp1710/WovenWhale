"use client";

import type { MediaAssetDTO, Paginated } from "@wovenwhale/backend/contracts";
import { ImagePlus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toaster";
import { api, upload } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import styles from "./MediaPicker.module.css";

export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/avif";
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** Choose an image from the media library, or upload a new one and use it straight away. */
export function MediaPicker({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (image: { url: string; alt: string }) => void;
}) {
  const toast = useToast();
  const [items, setItems] = useState<MediaAssetDTO[] | null>(null);
  const [q, setQ] = useState("");
  const [uploading, setUploading] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(
    async (query: string) => {
      try {
        const res = await api<Paginated<MediaAssetDTO>>(`/admin/media?pageSize=60${query ? `&q=${encodeURIComponent(query)}` : ""}`);
        setItems(res.items);
      } catch (error) {
        toast.error(errorMessage(error));
      }
    },
    [toast],
  );

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => load(q), q ? 250 : 0);
    return () => clearTimeout(t);
  }, [open, q, load]);

  async function send(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) return toast.error("Images must be 8 MB or smaller.");
    setUploading(true);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("alt", file.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " "));
      const asset = await upload<MediaAssetDTO>("/admin/media", form);
      toast.success("Image uploaded");
      choose(asset);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  }

  function choose(asset: MediaAssetDTO) {
    onSelect({ url: asset.url, alt: asset.alt });
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Choose an image" description="From the media library, or upload a new one." width="760px">
      <div className={styles.tools}>
        <TextField
          label="Search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Alt text or file name"
        />
        <input
          ref={input}
          type="file"
          accept={IMAGE_ACCEPT}
          className={styles.file}
          onChange={(e) => send(e.target.files?.[0])}
          aria-label="Upload an image"
          data-testid="media-picker-upload"
        />
        <Button icon={<ImagePlus size={16} aria-hidden="true" />} loading={uploading} onClick={() => input.current?.click()}>
          Upload new image
        </Button>
      </div>
      {items === null ? (
        <p className={styles.note}>Loading images…</p>
      ) : items.length === 0 ? (
        <p className={styles.note}>{q ? "No images match." : "No images yet. Upload one to use it on the website."}</p>
      ) : (
        <ul className={styles.grid}>
          {items.map((m) => (
            <li key={m.id}>
              <button type="button" className={styles.item} onClick={() => choose(m)} aria-label={`Use ${m.alt || m.originalName || "image"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.url} alt="" loading="lazy" />
                <span className={styles.caption}>{m.alt || m.originalName || "Untitled"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
