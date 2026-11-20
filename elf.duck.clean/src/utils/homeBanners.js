import referralBannerRu from "../assets/referralBanner.webp";
import referralBannerPl from "../assets/referralBannerPl.webp";
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
 * 1+1=3 Merry Mi → рефералка.
 * Баннер «новинки Merry Mi» прибрано — уже неактуальний.
 */
export function getHomeBanners(language = getCurrentLanguage()) {
  const isPl = language === "pl";
  const banners = [];
  if (isMerryOnePlusOneBannerActive()) {
    banners.push(isPl ? merryOnePlusOneBannerPl : merryOnePlusOneBannerRu);
  }
  banners.push(isPl ? referralBannerPl : referralBannerRu);
  return banners;
}

/** Усі варіанти картинок каруселі (для Cache API / preload). */
export function getAllHomeBannerAssetUrls() {
  return [
    merryOnePlusOneBannerRu,
    merryOnePlusOneBannerPl,
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

export function isMerryMiNewBanner(_src) {
  return false;
}

/** productKey Merry Mi (Blade + Liquid) — для кліку по банеру 1+1=3. */
export const MERRY_MI_NEW_PRODUCT_KEYS = ["merry-mi-blade-30k", "merry-mi"];

/** Пошуковий запит, щоб у каталозі лишились лише Merry Mi. */
export const MERRY_MI_NEW_CATALOG_SEARCH = "merry mi";
