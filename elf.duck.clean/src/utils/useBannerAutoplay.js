import { useEffect, useRef } from "react";

function getBannerStep(container) {
  const firstSlide = container?.querySelector?.(".bannerSlide");
  if (!firstSlide?.offsetWidth) return 0;
  const styles = window.getComputedStyle(container);
  const gap = parseFloat(styles.columnGap || styles.gap || "0") || 0;
  return firstSlide.offsetWidth + gap;
}

export function scrollBannerToIndex(container, index, behavior = "smooth") {
  if (!container) return;
  const step = getBannerStep(container);
  if (!step) return;
  const max = Math.max(0, container.querySelectorAll(".bannerSlide").length - 1);
  const safeIndex = Math.max(0, Math.min(max, Number(index) || 0));
  container.scrollTo({ left: safeIndex * step, behavior });
}

/**
 * Auto-advance horizontal banner carousel every `intervalMs`.
 * Resets the timer on user touch/drag. Syncs via scroll handler → activeIndex.
 */
export function useBannerAutoplay(
  bannerScrollRef,
  slideCount,
  activeIndex,
  { intervalMs = 5000, enabled = true } = {}
) {
  const activeRef = useRef(activeIndex);
  activeRef.current = activeIndex;

  useEffect(() => {
    if (!enabled || slideCount <= 1) return;

    let timer = null;

    const goNext = () => {
      const container = bannerScrollRef.current;
      if (!container) return;
      const next = (activeRef.current + 1) % slideCount;
      scrollBannerToIndex(container, next, "smooth");
    };

    const start = () => {
      clearInterval(timer);
      timer = setInterval(goNext, intervalMs);
    };

    start();

    const el = bannerScrollRef.current;
    const onInteract = () => start();

    el?.addEventListener("touchstart", onInteract, { passive: true });
    el?.addEventListener("mousedown", onInteract);

    return () => {
      clearInterval(timer);
      el?.removeEventListener("touchstart", onInteract);
      el?.removeEventListener("mousedown", onInteract);
    };
  }, [bannerScrollRef, slideCount, intervalMs, enabled]);
}
