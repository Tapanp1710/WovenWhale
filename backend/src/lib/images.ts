import sharp from "sharp";

/**
 * Every stored image is WebP. Converts any supported input (JPEG, PNG, WebP,
 * AVIF), honours EXIF rotation, strips metadata and never upscales.
 */
export async function toWebp(input: Uint8Array, maxWidth = 1400, quality = 80) {
  const { data, info } = await sharp(input)
    .rotate()
    .resize({ width: maxWidth, withoutEnlargement: true })
    .webp({ quality, effort: 5 })
    .toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), width: info.width, height: info.height };
}

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** Detects the real image type from magic bytes — the declared Content-Type is not trusted. */
export function sniffImage(bytes: Uint8Array): { ext: string; mime: string } | null {
  const b = bytes;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { ext: "png", mime: "image/png" };
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return { ext: "webp", mime: "image/webp" };
  if (ascii(4, 8) === "ftyp" && ["avif", "avis"].includes(ascii(8, 12))) return { ext: "avif", mime: "image/avif" };
  return null;
}
