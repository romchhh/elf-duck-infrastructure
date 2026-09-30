/** Telegram clients that run the mini app in a wide window (not phone). */
const TELEGRAM_DESKTOP_PLATFORMS = new Set([
  "tdesktop",
  "macos",
  "web",
  "weba",
  "unigram",
  "unknown",
]);

/**
 * Desktop shell: wide browser or Telegram Desktop / Web with enough width.
 * Phone Telegram stays on the classic mobile layout.
 */
export function shouldUseDesktopLayout() {
  if (typeof window === "undefined") return false;

  const width = window.innerWidth;
  if (width >= 1024) return true;

  const platform = String(
    window.Telegram?.WebApp?.platform || ""
  )
    .trim()
    .toLowerCase();

  if (TELEGRAM_DESKTOP_PLATFORMS.has(platform) && width >= 768) {
    return true;
  }

  return false;
}

export function applyDesktopLayoutClass() {
  const on = shouldUseDesktopLayout();
  document.documentElement.classList.toggle("layout-desktop", on);
  document.documentElement.classList.toggle("layout-mobile", !on);
  return on;
}

export function subscribeDesktopLayout(onChange) {
  if (typeof window === "undefined") return () => {};

  const notify = () => {
    const next = applyDesktopLayoutClass();
    onChange?.(next);
  };

  notify();

  const mq = window.matchMedia("(min-width: 768px)");
  const onMq = () => notify();
  mq.addEventListener?.("change", onMq);

  window.addEventListener("resize", onMq, { passive: true });

  return () => {
    mq.removeEventListener?.("change", onMq);
    window.removeEventListener("resize", onMq);
  };
}
