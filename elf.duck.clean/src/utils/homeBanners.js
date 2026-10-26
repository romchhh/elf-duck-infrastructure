import referralBannerRu from "../assets/referralBanner.webp";
import referralBannerPl from "../assets/referralBannerPl.webp";
import assortmentRestockBanner from "../assets/assortmentRestockBanner.webp";
import deliveryBanner from "../assets/deliveryBanner.webp";
import { getCurrentLanguage } from "./i18n";

/**
 * Карусель головної, як раніше:
 * 1. Реферальна програма
 * 2. Поповнення асортименту
 * 3. Доставка від 200 zł
 * Польські файли розіграшу / HELLODUCK сюди не входять.
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
