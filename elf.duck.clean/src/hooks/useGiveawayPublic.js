import { useEffect, useMemo, useState } from "react";
import { GIVEAWAY_TEST_PREVIEWS } from "../components/GiveawayBannerSlide.jsx";
import { isTestAppMode } from "../utils/appMode.js";
import {
  fetchGiveawayCurrent,
  getGiveawayCache,
  resolveGiveawayBannerVisible,
  subscribeGiveaway,
} from "../utils/giveawayPublicState.js";

/**
 * Спільний стан розіграшу для каруселі + слайда (один GET /giveaway/current).
 */
export function useGiveawayPublic() {
  const testMode = isTestAppMode();
  const [state, setState] = useState(() => getGiveawayCache());
  const [resolved, setResolved] = useState(() =>
    testMode ? true : Boolean(getGiveawayCache())
  );

  useEffect(() => {
    if (testMode) return undefined;

    return subscribeGiveaway((data) => {
      setState(data);
      setResolved(true);
    });
  }, [testMode]);

  useEffect(() => {
    if (testMode) return undefined;

    fetchGiveawayCurrent().finally(() => {
      setResolved(true);
    });

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        fetchGiveawayCurrent({ force: true });
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [testMode]);

  const bannerVisible = testMode || resolveGiveawayBannerVisible(state);

  const carouselSlides = useMemo(() => {
    if (testMode) {
      return GIVEAWAY_TEST_PREVIEWS.map((preview) => ({ key: preview, preview }));
    }
    if (!resolved) {
      return [{ key: "live-pending", preview: "" }];
    }
    if (!bannerVisible) {
      return [];
    }
    return [{ key: "live", preview: "" }];
  }, [testMode, resolved, bannerVisible]);

  return {
    state,
    resolved,
    bannerVisible,
    carouselSlides,
    testMode,
  };
}

/** @deprecated use useGiveawayPublic().carouselSlides */
export function useGiveawayBannerCarousel() {
  const { carouselSlides } = useGiveawayPublic();
  return { slides: carouselSlides };
}
