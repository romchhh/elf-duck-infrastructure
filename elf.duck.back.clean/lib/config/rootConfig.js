import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const backendRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);
const monorepoRoot = path.resolve(backendRoot, "..");

function readJsonConfig(fileName, fallback = {}) {
  const candidates = [
    path.join(backendRoot, "config", fileName),
    path.join(monorepoRoot, "config", fileName),
  ];
  const filePath = candidates.find((p) => fs.existsSync(p)) || candidates[0];
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return { ...fallback, ...parsed };
  } catch {
    return { ...fallback };
  }
}

let googleSheetsCache;
let telegramShopMediaCache;

export function getGoogleSheetsConfig() {
  if (!googleSheetsCache) {
    googleSheetsCache = readJsonConfig("googleSheets.json", {
      enabled: true,
      serviceAccountJsonPath: "telebots-e-commerce-bc2114cbc876.json",
      spreadsheetOverrides: {},
    });
  }
  return googleSheetsCache;
}

export function getTelegramShopMediaConfig() {
  if (!telegramShopMediaCache) {
    telegramShopMediaCache = readJsonConfig("telegramShopMedia.json", {
      startBannerUrl: "",
      orderPhotoDefault: "",
      clientOrderPhotoDefault: "",
      orderPhoto: {},
      clientOrderPhoto: {},
    });
  }
  return telegramShopMediaCache;
}

/** Шляхи через крапку: orderPhoto.praga, clientOrderPhoto.courier, orderPhotoDefault */
export function resolveTelegramMediaUrl(...paths) {
  const cfg = getTelegramShopMediaConfig();

  for (const dotted of paths) {
    const parts = String(dotted || "").split(".").filter(Boolean);
    let node = cfg;
    for (const part of parts) {
      node = node?.[part];
    }
    const url = String(node ?? "").trim();
    if (url) return url;
  }

  return "";
}

export function getStartBannerUrl() {
  return String(getTelegramShopMediaConfig().startBannerUrl || "").trim();
}
