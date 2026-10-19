import "server-only";
import sharp from "sharp";

const MAX_SIZE = 2400;
const BUDGET = 450 * 1024;
const START_QUALITY = 82;
const MIN_QUALITY = 64; // below this, artefacts start to show on photos
const STEP = 4;

/**
 * Any image -> optimized WebP: fixes EXIF orientation and strips metadata (GPS, camera), never
 * upscales, and steps quality down until the file fits the budget.
 */
export async function optimizeImage(input: Buffer) {
  const resized = await sharp(input, { failOn: "none", animated: false, limitInputPixels: 60_000_000 })
    .rotate()
    .resize({ width: MAX_SIZE, height: MAX_SIZE, fit: "inside", withoutEnlargement: true })
    .toBuffer();

  const encode = (quality: number) =>
    sharp(resized).webp({ quality, alphaQuality: 90, effort: 5, smartSubsample: true }).toBuffer({ resolveWithObject: true });

  let quality = START_QUALITY;
  let out = await encode(quality);
  while (out.data.length > BUDGET && quality - STEP >= MIN_QUALITY) {
    quality -= STEP;
    out = await encode(quality);
  }
  return { data: out.data, width: out.info.width, height: out.info.height, quality };
}
