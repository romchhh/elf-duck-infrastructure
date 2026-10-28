/**
 * Оптимізація важких банерів: PNG→WebP, даунскейл oversized WebP.
 *
 *   node scripts/optimize-banners.mjs
 */
import sharp from "sharp";
import { stat, unlink } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), "../src/assets");
const TARGET_W = 918;
const TARGET_H = 520;
const QUALITY = 80;

async function pngToWebp(name) {
  const input = join(ASSETS, `${name}.png`);
  const output = join(ASSETS, `${name}.webp`);
  const before = (await stat(input)).size;
  await sharp(input)
    .resize(TARGET_W, TARGET_H, { fit: "cover", withoutEnlargement: true })
    .webp({ quality: QUALITY })
    .toFile(output);
  const after = (await stat(output)).size;
  await unlink(input);
  console.log(
    `${name}.png → .webp  ${(before / 1024).toFixed(0)}KB → ${(after / 1024).toFixed(0)}KB`
  );
}

async function downscaleWebp(name) {
  const path = join(ASSETS, `${name}.webp`);
  const before = (await stat(path)).size;
  const meta = await sharp(path).metadata();
  if ((meta.width || 0) <= TARGET_W + 2) {
    console.log(`${name}.webp already ≤${TARGET_W}px, skip`);
    return;
  }
  const tmp = join(ASSETS, `${name}.tmp.webp`);
  await sharp(path)
    .resize(TARGET_W, TARGET_H, { fit: "cover" })
    .webp({ quality: QUALITY })
    .toFile(tmp);
  const { rename } = await import("fs/promises");
  await rename(tmp, path);
  const after = (await stat(path)).size;
  console.log(
    `${name}.webp resized ${meta.width}×${meta.height} → ${TARGET_W}×${TARGET_H}  ${(before / 1024).toFixed(0)}KB → ${(after / 1024).toFixed(0)}KB`
  );
}

await pngToWebp("giveawayBannerPl");
await pngToWebp("giveawayBannerUk");
await downscaleWebp("deliveryBanner");
console.log("Done.");
