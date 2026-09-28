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
