import referralBannerRu from "../assets/referralBanner.webp";
import referralBannerPl from "../assets/referralBannerPl.webp";
import assortmentRestockBannerRu from "../assets/assortmentRestockBanner.webp";
import assortmentRestockBannerPl from "../assets/assortmentRestockBannerPl.webp";
import deliveryBannerRu from "../assets/deliveryBanner.webp";
import deliveryBannerPl from "../assets/deliveryBannerPl.webp";
import { getCurrentLanguage } from "./i18n";

/** Банери головної каруселі: той самий порядок для PL і RU. */
export function getHomeBanners(language = getCurrentLanguage()) {
  const isPl = language === "pl";
  return [
    isPl ? referralBannerPl : referralBannerRu,
    isPl ? assortmentRestockBannerPl : assortmentRestockBannerRu,
    isPl ? deliveryBannerPl : deliveryBannerRu,
  ];
}

export function isReferralBanner(src) {
  return src === referralBannerRu || src === referralBannerPl;
}
