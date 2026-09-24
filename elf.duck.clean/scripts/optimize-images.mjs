import sharp from "sharp";
import { readdir, stat, unlink } from "fs/promises";
import { join, extname, basename } from "path";

const ASSETS_DIR = new URL("../src/assets", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const QUALITY = 82;

async function convertPngToWebp() {
  const files = await readdir(ASSETS_DIR);
  const pngFiles = files.filter((f) => extname(f).toLowerCase() === ".png");

  let totalSavedBytes = 0;

  for (const file of pngFiles) {
    const inputPath = join(ASSETS_DIR, file);
    const outputPath = join(ASSETS_DIR, basename(file, ".png") + ".webp");

    const originalSize = (await stat(inputPath)).size;

    await sharp(inputPath).webp({ quality: QUALITY }).toFile(outputPath);

    const newSize = (await stat(outputPath)).size;
    const saved = originalSize - newSize;
    totalSavedBytes += saved;

    const pct = ((saved / originalSize) * 100).toFixed(1);
    console.log(
      `${file} → ${basename(outputPath)}  ${(originalSize / 1024).toFixed(0)}KB → ${(newSize / 1024).toFixed(0)}KB  (-${pct}%)`
    );

    // Remove original PNG
    await unlink(inputPath);
  }

  console.log(
    `\nDone! Converted ${pngFiles.length} files, saved ${(totalSavedBytes / 1024 / 1024).toFixed(1)} MB total`
  );
}

convertPngToWebp().catch(console.error);
