/**
 * Конвертує Frame 138/142 (RU/PL) у WebP для /giveaway-media.
 *
 *   node scripts/import-giveaway-winner-banners.mjs
 *   node scripts/import-giveaway-winner-banners.mjs --ru ../Frame\ 138.png --pl ../Frame\ 142.png
 */
import sharp from "sharp";
import { existsSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const outDir = join(here, "../assets/giveaway");

function readArg(name, fallback) {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && process.argv[idx + 1]) {
    return resolve(process.cwd(), process.argv[idx + 1]);
  }
  return fallback;
}

const ruSrc = readArg("--ru", join(repoRoot, "Frame 138.png"));
const plSrc = readArg("--pl", join(repoRoot, "Frame 142.png"));

async function convert(input, outputName) {
  if (!existsSync(input)) {
    console.warn("skip (missing):", input);
    return;
  }
  const output = join(outDir, outputName);
  await sharp(input)
    .resize(918, 520, { fit: "cover" })
    .webp({ quality: 82 })
    .toFile(output);
  console.log("wrote", output);
}

await convert(ruSrc, "giveaway-winner-ru.webp");
await convert(plSrc, "giveaway-winner-pl.webp");
