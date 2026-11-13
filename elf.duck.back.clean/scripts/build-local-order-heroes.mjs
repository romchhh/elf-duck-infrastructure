/**
 * Збирає wide order-hero (фон + card PNG) у public/products/*-order.png
 * як у XROS/OXVA — одне фото для сторінки товару.
 *
 *   cd elf.duck.back.clean
 *   node scripts/build-local-order-heroes.mjs
 */
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const OUT_DIR = path.join(ROOT, "elf.duck.clean/public/products");
const CRM_DIR = path.join(ROOT, "elfduck.crm/public/products");

const ORDER_W = 918;
const ORDER_H = 520;
const BG_OPACITY = 0.55;

const JOBS = [
  {
    key: "merry-mi",
    card: "merry-mi-card.png",
    bg: "https://blush-impressive-moth-462.mypinata.cloud/ipfs/bafybeiavqxbdav3hk2rqcokp7iobnb462rjcyaxfg3ejrg5zindszv6ws4",
    right: true,
    duckHeightRatio: 0.92,
  },
  {
    key: "merry-mi-blade-30k",
    card: "merry-mi-blade-30k-card.png",
    bg: "https://blush-impressive-moth-462.mypinata.cloud/ipfs/bafkreihjucgk2vsq5x5u3y3joot5fp42nbgql32mjkivjkmryhtdxrerka",
    right: true,
    duckHeightRatio: 0.92,
  },
  {
    key: "puffy-special",
    card: "puffy-special-card.png",
    bg: "https://blush-impressive-moth-462.mypinata.cloud/ipfs/bafybeiavqxbdav3hk2rqcokp7iobnb462rjcyaxfg3ejrg5zindszv6ws4",
    right: true,
    duckHeightRatio: 0.92,
  },
];

async function fetchBuf(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`FETCH_${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function makeCoverBg(buffer) {
  const base = sharp({
    create: {
      width: ORDER_W,
      height: ORDER_H,
      channels: 4,
      background: { r: 40, g: 40, b: 40, alpha: 1 },
    },
  });
  if (!buffer) return base.png().toBuffer();

  const cover = await sharp(buffer)
    .resize(ORDER_W, ORDER_H, { fit: "cover", position: "centre" })
    .ensureAlpha()
    .png()
    .toBuffer();

  return base
    .composite([{ input: cover, blend: "over", opacity: BG_OPACITY }])
    .png()
    .toBuffer();
}

async function placeDuck(duckPath, right, heightRatio) {
  const duckBuf = await fs.readFile(duckPath);
  const targetH = Math.max(1, Math.round(ORDER_H * heightRatio));
  const resized = await sharp(duckBuf)
    .resize({ height: targetH, fit: "inside", withoutEnlargement: false })
    .ensureAlpha()
    .toBuffer();
  const meta = await sharp(resized).metadata();
  const w = meta.width || 1;
  const h = meta.height || targetH;
  const left = right ? Math.max(0, ORDER_W - w - 12) : 12;
  const top = Math.max(0, ORDER_H - h);
  return { input: resized, left, top };
}

async function buildOne(job) {
  const cardPath = path.join(OUT_DIR, job.card);
  const outName = `${job.key}-order.png`;
  const outPath = path.join(OUT_DIR, outName);

  console.log("build", outName);
  const bgBuf = await fetchBuf(job.bg);
  let canvas = await makeCoverBg(bgBuf);
  const duck = await placeDuck(cardPath, job.right, job.duckHeightRatio);
  canvas = await sharp(canvas).composite([duck]).png().toBuffer();

  await fs.writeFile(outPath, canvas);
  await fs.chmod(outPath, 0o644).catch(() => {});

  try {
    await fs.mkdir(CRM_DIR, { recursive: true });
    await fs.copyFile(outPath, path.join(CRM_DIR, outName));
  } catch (e) {
    console.warn("crm copy skip", e?.message || e);
  }

  const meta = await sharp(outPath).metadata();
  console.log("  →", meta.width, "x", meta.height, `${canvas.length}b`);
}

async function main() {
  for (const job of JOBS) {
    await buildOne(job);
  }
  console.log("Done. Bump PRODUCT_CARD_ASSET_VERSION and rebuild shop.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
