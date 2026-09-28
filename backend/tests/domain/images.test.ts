import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { toWebp } from "../../src/lib/images";

const make = (width: number, height: number, format: "png" | "jpeg") =>
  sharp({ create: { width, height, channels: 3, background: { r: 22, g: 50, b: 79 } } })
    [format]()
    .toBuffer();

const isWebp = (b: Uint8Array) => Buffer.from(b.slice(0, 4)).toString() === "RIFF" && Buffer.from(b.slice(8, 12)).toString() === "WEBP";

describe("image conversion", () => {
  it("turns PNG and JPEG into WebP", async () => {
    for (const format of ["png", "jpeg"] as const) {
      const out = await toWebp(new Uint8Array(await make(300, 200, format)));
      expect(isWebp(out.data)).toBe(true);
      expect(out).toMatchObject({ width: 300, height: 200 });
    }
  });

  it("shrinks large images to the maximum width and never enlarges small ones", async () => {
    expect(await toWebp(new Uint8Array(await make(3000, 2000, "jpeg")))).toMatchObject({ width: 1400, height: 933 });
    expect(await toWebp(new Uint8Array(await make(120, 80, "png")))).toMatchObject({ width: 120, height: 80 });
  });

  it("rejects bytes that aren't an image", async () => {
    await expect(toWebp(new TextEncoder().encode("GIF89a-not-really"))).rejects.toThrow();
  });
});
