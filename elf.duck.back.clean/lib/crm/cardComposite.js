import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { getCatalogUploadDir, saveCatalogMediaBuffer } from "./catalogMediaStorage.js";

const PRODUCT_SIZE = { width: 440, height: 580 };
const CATEGORY_SIZE = { width: 440, height: 400 };
/** Hero на сторінці товару (checkout sheet) */
const ORDER_SIZE = { width: 900, height: 480 };
const BG_OPACITY = 0.5;
const PLACEHOLDER = { r: 55, g: 55, b: 55, alpha: 1 };

function isCompactCategory(categoryKey) {
  const key = String(categoryKey || "").trim().toLowerCase();
  return key === "disposables" || key === "disposable" || key === "liquids" || key === "liquid";
}

function isCartridgeCategory(categoryKey) {
  const key = String(categoryKey || "").trim().toLowerCase();
  return key === "cartridges" || key === "cartridge";
}

/** Віддзеркалює CSS позиціонування качки на картці. */
export function resolveDuckLayout(classCardDuck, { kind = "product", categoryKey = "" } = {}) {
  const cls = String(classCardDuck || "cardImageLeft").trim().toLowerCase();
  const right = cls.includes("right");
  let heightRatio = 0.9;

  if (cls.includes("productcardimage")) heightRatio = 0.6;
  else if (cls.includes("left2") || cls.includes("right2")) heightRatio = 0.7;
  else if (cls.includes("right")) heightRatio = 0.7;
  else heightRatio = 0.9;

  let scale = 1;
  if (kind === "product" && isCartridgeCategory(categoryKey)) {
    heightRatio = 0.52;
    scale = 0.84;
  } else if (kind === "product" && isCompactCategory(categoryKey)) {
    scale = 0.88;
  }

  return { right, heightRatio: heightRatio * scale };
}

async function loadImageBuffer(urlOrPath) {
  const raw = String(urlOrPath || "").trim();
  if (!raw) return null;

  if (/^https?:\/\//i.test(raw)) {
    const res = await fetch(raw, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`FETCH_${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  const fileName = raw.split("/catalog-media/").pop()?.split("?")[0];
  if (fileName && !fileName.includes("..")) {
    const local = path.join(getCatalogUploadDir(), fileName);
    try {
      return await fs.readFile(local);
    } catch {
      /* fall through */
    }
  }

  if (raw.startsWith("/") || /^[A-Za-z]:\\/.test(raw)) {
    try {
      return await fs.readFile(raw);
    } catch {
      return null;
    }
  }

  return null;
}

async function makeCoverBg(buffer, width, height) {
  const base = sharp({
    create: { width, height, channels: 4, background: PLACEHOLDER },
  });
  if (!buffer) {
    return base.png().toBuffer();
  }

  const cover = await sharp(buffer)
    .resize(width, height, { fit: "cover", position: "centre" })
    .ensureAlpha()
    .png()
    .toBuffer();

  // 50% opacity over placeholder — як .cardImageFull { opacity: 50% }
  return base
    .composite([{ input: cover, blend: "over", opacity: BG_OPACITY }])
    .png()
    .toBuffer();
}

async function placeDuck(duckBuffer, canvasW, canvasH, layout) {
  if (!duckBuffer) return null;
  const targetH = Math.max(1, Math.round(canvasH * layout.heightRatio));
  const resized = await sharp(duckBuffer)
    .resize({ height: targetH, fit: "inside", withoutEnlargement: false })
    .ensureAlpha()
    .toBuffer();
  const meta = await sharp(resized).metadata();
  const w = meta.width || 1;
  const h = meta.height || targetH;
  const left = layout.right ? Math.max(0, canvasW - w) : 0;
  const top = Math.max(0, canvasH - h);
  return { input: resized, left, top };
}

/**
 * Зливає фон + PNG у один WebP для картки каталогу.
 * @returns {{ url: string, bytes: number } | null}
 */
export async function bakeCardComposite({
  cardBgUrl,
  cardDuckUrl,
  classCardDuck,
  kind = "product",
  categoryKey = "",
  showOverlay = false,
  size: sizeOverride = null,
  duckHeightBoost = 0,
} = {}) {
  if (!cardBgUrl && !cardDuckUrl) return null;

  const size =
    sizeOverride ||
    (kind === "category"
      ? CATEGORY_SIZE
      : kind === "order"
        ? ORDER_SIZE
        : PRODUCT_SIZE);
  const layoutKind = kind === "order" ? "product" : kind;
  const layout = resolveDuckLayout(classCardDuck, {
    kind: layoutKind,
    categoryKey,
  });
  if (duckHeightBoost > 0) {
    layout.heightRatio = Math.min(0.98, layout.heightRatio + duckHeightBoost);
  }

  const [bgBuf, duckBuf] = await Promise.all([
    cardBgUrl ? loadImageBuffer(cardBgUrl).catch(() => null) : null,
    cardDuckUrl ? loadImageBuffer(cardDuckUrl).catch(() => null) : null,
  ]);

  if (!bgBuf && !duckBuf) return null;

  let base = await makeCoverBg(bgBuf, size.width, size.height);

  const layers = [];
  const duckLayer = await placeDuck(duckBuf, size.width, size.height, layout);
  if (duckLayer) layers.push(duckLayer);

  if (showOverlay) {
    layers.push({
      input: await sharp({
        create: {
          width: size.width,
          height: size.height,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0.35 },
        },
      })
        .png()
        .toBuffer(),
      blend: "over",
    });
  }

  if (layers.length) {
    base = await sharp(base).composite(layers).png().toBuffer();
  }

  const webp = await sharp(base).webp({ quality: 82 }).toBuffer();
  const saved = await saveCatalogMediaBuffer({
    buffer: webp,
    contentType: "image/webp",
  });

  return { url: saved.url, bytes: webp.length };
}

async function persistImageFields(doc, fields) {
  Object.assign(doc, fields);
  if (typeof doc.save === "function") {
    await doc.save();
    return;
  }
  if (doc._id && doc.constructor?.modelName) {
    await doc.constructor.updateOne({ _id: doc._id }, { $set: fields });
  }
}

/** Оновлює cardImageUrl (+ orderImageUrl для товарів); не кидає назовні. */
export async function refreshCardImageUrl(doc, { kind = "product" } = {}) {
  if (!doc) return doc;
  try {
    const categoryKey = kind === "product" ? doc.categoryKey : doc.key;
    const baked = await bakeCardComposite({
      cardBgUrl: doc.cardBgUrl,
      cardDuckUrl: doc.cardDuckUrl,
      classCardDuck: doc.classCardDuck,
      kind,
      categoryKey,
      showOverlay: kind === "category" ? !!doc.showOverlay : false,
    });

    const fields = {};
    if (baked?.url) {
      fields.cardImageUrl = baked.url;
    } else if (doc.cardImageUrl) {
      fields.cardImageUrl = "";
    }

    // orderImageUrl більше не генеруємо: hero на сторінці товару лишається
    // окремим orderImgUrl з авторськими пропорціями.

    if (Object.keys(fields).length) {
      await persistImageFields(doc, fields);
    }
  } catch (error) {
    console.warn("refreshCardImageUrl failed:", error?.message || error);
  }
  return doc;
}

export async function optimizeUploadBuffer(buffer, contentType) {
  const type = String(contentType || "").toLowerCase();
  if (!type.startsWith("image/")) {
    return { buffer, contentType };
  }
  try {
    const webp = await sharp(buffer)
      .rotate()
      .resize({
        width: 1200,
        height: 1200,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer();
    return { buffer: webp, contentType: "image/webp" };
  } catch {
    return { buffer, contentType };
  }
}
