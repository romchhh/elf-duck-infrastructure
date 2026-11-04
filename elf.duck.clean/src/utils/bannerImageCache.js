import giveawayBanner from "../assets/giveawayBanner.webp";
import {
  getHomeBanners,
  getAllHomeBannerAssetUrls,
} from "./homeBanners.js";
import { preloadImage, preloadImages } from "./preloadImage.js";

const CACHE_NAME = "elfduck-home-banners-v2";

/** @type {Map<string, string>} src → blob: URL */
const blobUrlBySrc = new Map();

/** @type {Promise<void> | null} */
let warmPromise = null;

export function getBannerDisplaySrc(src) {
  const key = String(src || "").trim();
  if (!key) return "";
  return blobUrlBySrc.get(key) || key;
}

export function getAllBannerAssetUrls() {
  return [
    ...getAllHomeBannerAssetUrls(),
    giveawayBanner,
  ].filter(Boolean);
}

async function putInCache(cache, src, response) {
  try {
    await cache.put(src, response);
  } catch {
    // opaque / quota — ignore
  }
}

async function resolveBannerBlob(src) {
  const key = String(src || "").trim();
  if (!key) return null;
  if (blobUrlBySrc.has(key)) return blobUrlBySrc.get(key);

  try {
    if (typeof caches !== "undefined") {
      const cache = await caches.open(CACHE_NAME);
      let response = await cache.match(key);
      if (!response) {
        response = await fetch(key, { cache: "force-cache", credentials: "same-origin" });
        if (response?.ok) {
          await putInCache(cache, key, response.clone());
        }
      }
      if (response?.ok) {
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        blobUrlBySrc.set(key, objectUrl);
        return objectUrl;
      }
    }

    const response = await fetch(key, { cache: "force-cache", credentials: "same-origin" });
    if (response?.ok) {
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      blobUrlBySrc.set(key, objectUrl);
      return objectUrl;
    }
  } catch {
    preloadImage(key);
  }

  return null;
}

/**
 * Прогрів Cache API + blob URL, щоб наступні рендери брали з кешу,
 * а не чекали мережу при показі каруселі.
 */
export function warmBannerImageCache(urls = getAllBannerAssetUrls()) {
  const list = [
    ...new Set(
      (Array.isArray(urls) ? urls : [])
        .map((src) => String(src || "").trim())
        .filter(Boolean)
    ),
  ];

  if (!list.length) return Promise.resolve();

  preloadImages(list);

  if (warmPromise) return warmPromise;

  warmPromise = (async () => {
    await Promise.all(list.map((src) => resolveBannerBlob(src)));
  })().catch(() => {
    warmPromise = null;
  });

  return warmPromise;
}

/** Синхронний список для рендеру з урахуванням уже готового blob-кешу. */
export function mapBannersToCachedSrcs(banners) {
  return (Array.isArray(banners) ? banners : []).map(
    (src) => getBannerDisplaySrc(src) || src
  );
}

export function getCachedHomeBanners(language) {
  return mapBannersToCachedSrcs(getHomeBanners(language));
}

export function getCachedGiveawayBannerSrc() {
  return getBannerDisplaySrc(giveawayBanner) || giveawayBanner;
}
