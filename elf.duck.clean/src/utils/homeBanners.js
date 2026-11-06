import referralBannerRu from "../assets/referralBanner.webp";
import referralBannerPl from "../assets/referralBannerPl.webp";
import { getCurrentLanguage } from "./i18n";

/**
 * Карусель головної: рефералка (+ розіграш окремим слайдом).
 * assortmentRestock / delivery — тимчасово приховані.
 */
export function getHomeBanners(language = getCurrentLanguage()) {
  const isPl = language === "pl";
  return [isPl ? referralBannerPl : referralBannerRu];
}

/** Усі варіанти картинок каруселі (для Cache API / preload). */
export function getAllHomeBannerAssetUrls() {
  return [referralBannerRu, referralBannerPl];
}

export function isReferralBanner(src) {
  return src === referralBannerRu || src === referralBannerPl;
}
