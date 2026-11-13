import referralBannerRu from "../assets/referralBanner.webp";
import referralBannerPl from "../assets/referralBannerPl.webp";
import merryMiNewBannerRu from "../assets/merryMiNewBannerRu.webp";
import merryMiNewBannerPl from "../assets/merryMiNewBannerPl.webp";
import { getCurrentLanguage } from "./i18n";

/**
 * Карусель головної після слайду розіграшу:
 * новинки Merry Mi → рефералка.
 * assortmentRestock / delivery — тимчасово приховані.
 */
export function getHomeBanners(language = getCurrentLanguage()) {
  const isPl = language === "pl";
  return [
    isPl ? merryMiNewBannerPl : merryMiNewBannerRu,
    isPl ? referralBannerPl : referralBannerRu,
  ];
}

/** Усі варіанти картинок каруселі (для Cache API / preload). */
export function getAllHomeBannerAssetUrls() {
  return [
    merryMiNewBannerRu,
    merryMiNewBannerPl,
    referralBannerRu,
    referralBannerPl,
  ];
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
