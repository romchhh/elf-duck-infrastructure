/**
 * Frame 140 (PL) / Frame 141 (RU) → shop WebP для підказки «краще готівка» при BLIK.
 *
 *   node scripts/import-payment-blik-prefer-cash-banners.mjs
 *   node scripts/import-payment-blik-prefer-cash-banners.mjs --pl ../Frame\ 140.png --ru ../Frame\ 141.png
 */
import sharp from "sharp";
import { existsSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const outDir = join(here, "../../elf.duck.clean/src/assets");

function readArg(name, fallback) {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && process.argv[idx + 1]) {
    return resolve(process.cwd(), process.argv[idx + 1]);
  }
  return fallback;
}

const plSrc = readArg("--pl", join(repoRoot, "Frame 140.png"));
const ruSrc = readArg("--ru", join(repoRoot, "Frame 141.png"));

async function convert(input, outputName) {
  if (!existsSync(input)) {
    console.warn("skip (missing):", input);
    return;
  }
  const output = join(outDir, outputName);
  await sharp(input).webp({ quality: 85 }).toFile(output);
  console.log("wrote", output);
}

await convert(plSrc, "paymentBlikPreferCash-pl.webp");
await convert(ruSrc, "paymentBlikPreferCash-ru.webp");
