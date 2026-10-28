import referralBannerRu from "../assets/referralBanner.webp";
import referralBannerPl from "../assets/referralBannerPl.webp";
import assortmentRestockBanner from "../assets/assortmentRestockBanner.webp";
import deliveryBanner from "../assets/deliveryBanner.webp";
import { getCurrentLanguage } from "./i18n";

/**
 * Карусель головної (банер розіграшу — окремий слайд у test-режимі).
 */
export function getHomeBanners(language = getCurrentLanguage()) {
  const isPl = language === "pl";
  return [
    isPl ? referralBannerPl : referralBannerRu,
    assortmentRestockBanner,
    deliveryBanner,
  ];
}

export function isReferralBanner(src) {
  return src === referralBannerRu || src === referralBannerPl;
}
