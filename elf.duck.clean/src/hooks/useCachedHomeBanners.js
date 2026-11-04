import { useEffect, useMemo, useState } from "react";
import { getHomeBanners } from "../utils/homeBanners.js";
import { getCurrentLanguage } from "../utils/i18n.js";
import {
  mapBannersToCachedSrcs,
  warmBannerImageCache,
} from "../utils/bannerImageCache.js";

/**
 * Банери каруселі з Cache API / blob-кешу (миттєвий показ після першого прогріву).
 * `sources` — оригінальні Vite URL (для isReferralBanner), `banners` — src для <img>.
 */
export function useCachedHomeBanners(language = getCurrentLanguage()) {
  const sources = useMemo(() => getHomeBanners(language), [language]);
  const [banners, setBanners] = useState(() =>
    mapBannersToCachedSrcs(sources)
  );

  useEffect(() => {
    setBanners(mapBannersToCachedSrcs(sources));
    let cancelled = false;
    warmBannerImageCache().then(() => {
      if (!cancelled) setBanners(mapBannersToCachedSrcs(sources));
    });
    return () => {
      cancelled = true;
    };
  }, [language, sources]);

  return { banners, sources };
}
