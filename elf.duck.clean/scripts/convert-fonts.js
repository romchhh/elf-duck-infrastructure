import { readdir, readFile, writeFile, unlink, stat } from "fs/promises";
import { join, extname, basename } from "path";
import wawoff2 from "wawoff2";

const FONTS_DIR = new URL("../public/fonts", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");

async function convertFonts() {
  const files = await readdir(FONTS_DIR);
  const ttfFiles = files.filter((f) => extname(f).toLowerCase() === ".ttf");

  let totalSaved = 0;

  for (const file of ttfFiles) {
    const inputPath = join(FONTS_DIR, file);
    const outputPath = join(FONTS_DIR, basename(file, ".ttf") + ".woff2");

    const ttfData = await readFile(inputPath);
    const woff2Data = await wawoff2.compress(ttfData);

    await writeFile(outputPath, woff2Data);

    const saved = ttfData.length - woff2Data.length;
    totalSaved += saved;
    const pct = ((saved / ttfData.length) * 100).toFixed(1);
    console.log(
      `${file} → ${basename(outputPath)}  ${(ttfData.length / 1024).toFixed(0)}KB → ${(woff2Data.length / 1024).toFixed(0)}KB  (-${pct}%)`
    );

    await unlink(inputPath);
  }

  console.log(`\nDone! Saved ${(totalSaved / 1024).toFixed(0)} KB total`);
}

convertFonts().catch(console.error);
