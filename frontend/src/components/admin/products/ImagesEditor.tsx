"use client";

import type { AdminProductDetailDTO } from "@wovenwhale/backend/contracts";
import { ArrowDown, ArrowUp, ImagePlus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { api, upload } from "@/lib/api/client";
import { useAction, useCan } from "../AdminContext";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Panel } from "../ui/Panel";
import styles from "./ImagesEditor.module.css";

type Image = AdminProductDetailDTO["images"][number];
const ACCEPT = "image/jpeg,image/png,image/webp,image/avif";
const MAX_BYTES = 8 * 1024 * 1024;

/** Upload with preview, reorder (first image is the cover), alt text and delete. */
export function ImagesEditor({ product }: { product: AdminProductDetailDTO }) {
  const canManage = useCan("products.manage");
  const { run, pending } = useAction();
  const images = [...product.images].sort((a, b) => a.sortOrder - b.sortOrder);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [alt, setAlt] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Image | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function choose(f: File | undefined) {
    setFileError(null);
    if (!f) return;
    if (f.size > MAX_BYTES) return setFileError("Images must be 8 MB or smaller.");
    setFile(f);
    setAlt(product.name);
  }

  async function send() {
    if (!file) return;
    const form = new FormData();
    form.set("file", file);
    if (alt.trim()) form.set("alt", alt.trim());
    const ok = await run(() => upload(`/admin/catalog/products/${product.id}/images`, form), "Photo uploaded");
    if (ok) {
      setFile(null);
      if (input.current) input.current.value = "";
    }
  }

  function move(index: number, by: -1 | 1) {
    const ids = images.map((i) => i.id);
    const [id] = ids.splice(index, 1);
    ids.splice(index + by, 0, id!);
    return run(
      () => api(`/admin/catalog/products/${product.id}/images/order`, { method: "PUT", body: { imageIds: ids } }),
      "Photo order saved",
    );
  }

  function saveAlt(image: Image, value: string) {
    if (value.trim() === image.alt) return;
    return run(() => api(`/admin/catalog/images/${image.id}`, { method: "PATCH", body: { alt: value } }), "Alt text saved");
  }

  return (
    <Panel title="Photos" description="The first photo is the cover in listings. Describe each photo for screen readers.">
      {images.length > 0 ? (
        <ol className={styles.grid}>
          {images.map((img, i) => (
            <li key={img.id} className={styles.item}>
              <div className={styles.frame}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt={img.alt} loading="lazy" />
                {i === 0 && <span className={styles.cover}>Cover</span>}
              </div>
              {canManage ? (
                <>
                  <TextField
                    label={`Alt text, photo ${i + 1}`}
                    defaultValue={img.alt}
                    onBlur={(e) => saveAlt(img, e.target.value)}
                    className={styles.alt}
                  />
                  <div className={styles.tools}>
                    <button
                      type="button"
                      className={styles.tool}
                      onClick={() => move(i, -1)}
                      disabled={i === 0 || pending}
                      aria-label={`Move photo ${i + 1} earlier`}
                    >
                      <ArrowUp size={15} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={styles.tool}
                      onClick={() => move(i, 1)}
                      disabled={i === images.length - 1 || pending}
                      aria-label={`Move photo ${i + 1} later`}
                    >
                      <ArrowDown size={15} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={`${styles.tool} ${styles.remove}`}
                      onClick={() => setRemoving(img)}
                      aria-label={`Delete photo ${i + 1}`}
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  </div>
                </>
              ) : (
                <p className={styles.caption}>{img.alt}</p>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <p className={styles.caption}>No photos yet.</p>
      )}

      {canManage && (
        <div className={styles.upload}>
          <label className={styles.drop}>
            <ImagePlus size={20} aria-hidden="true" />
            <span>{file ? file.name : "Choose a photo (JPEG, PNG, WebP or AVIF, up to 8 MB)"}</span>
            <input ref={input} type="file" accept={ACCEPT} className="visually-hidden" onChange={(e) => choose(e.target.files?.[0])} />
          </label>
          {fileError && (
            <p role="alert" className={styles.error}>
              {fileError}
            </p>
          )}
          {file && preview && (
            <div className={styles.pending}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="Preview of the chosen photo" className={styles.preview} />
              <div className={styles.pendingForm}>
                <TextField label="Alt text" value={alt} onChange={(e) => setAlt(e.target.value)} />
                <div className={styles.tools}>
                  <Button size="sm" onClick={send} loading={pending}>
                    Upload photo
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setFile(null)}>
                    Discard
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Delete this photo?"
        description="It's removed from the product and storage. This can't be undone."
        confirmLabel="Delete photo"
        onConfirm={() => run(() => api(`/admin/catalog/images/${removing!.id}`, { method: "DELETE" }), "Photo deleted")}
      />
    </Panel>
  );
}
