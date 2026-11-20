import referralBannerRu from "../assets/referralBanner.webp";
import referralBannerPl from "../assets/referralBannerPl.webp";
import merryMiNewBannerRu from "../assets/merryMiNewBannerRu.webp";
import merryMiNewBannerPl from "../assets/merryMiNewBannerPl.webp";
import merryOnePlusOneBannerRu from "../assets/merryOnePlusOneBannerRu.png";
import merryOnePlusOneBannerPl from "../assets/merryOnePlusOneBannerPl.png";
import { getCurrentLanguage } from "./i18n";

function warsawDayKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function isMerryOnePlusOneBannerActive(date = new Date()) {
  return warsawDayKey(date) >= "2026-11-20";
}

/**
 * Карусель головної після слайду розіграшу:
 * новинки Merry Mi → рефералка.
 * assortmentRestock / delivery — тимчасово приховані.
 */
export function getHomeBanners(language = getCurrentLanguage()) {
  const isPl = language === "pl";
  const banners = [];
  if (isMerryOnePlusOneBannerActive()) {
    banners.push(isPl ? merryOnePlusOneBannerPl : merryOnePlusOneBannerRu);
  }
  banners.push(
    isPl ? merryMiNewBannerPl : merryMiNewBannerRu,
    isPl ? referralBannerPl : referralBannerRu
  );
  return banners;
}

/** Усі варіанти картинок каруселі (для Cache API / preload). */
export function getAllHomeBannerAssetUrls() {
  return [
    merryOnePlusOneBannerRu,
    merryOnePlusOneBannerPl,
    merryMiNewBannerRu,
    merryMiNewBannerPl,
    referralBannerRu,
    referralBannerPl,
  ];
}

export function isMerryOnePlusOneBanner(src) {
  return src === merryOnePlusOneBannerRu || src === merryOnePlusOneBannerPl;
}

export function isReferralBanner(src) {
  return src === referralBannerRu || src === referralBannerPl;
}

export function isMerryMiNewBanner(src) {
  return src === merryMiNewBannerRu || src === merryMiNewBannerPl;
}

/** productKey новинок з банера Merry Mi (Blade + Liquid). */
export const MERRY_MI_NEW_PRODUCT_KEYS = ["merry-mi-blade-30k", "merry-mi"];

/** Пошуковий запит, щоб у каталозі лишились лише ці новинки. */
export const MERRY_MI_NEW_CATALOG_SEARCH = "merry mi";
