/**
 * Telegram Android WebView is sensitive to blur + background-position animations
 * and mask compositing when CSS variables change (flavor accent).
 */

export function isAndroidPlatform() {
  if (typeof window === "undefined") return false;

  const tgPlatform = String(window.Telegram?.WebApp?.platform || "")
    .trim()
    .toLowerCase();

  if (tgPlatform.includes("android")) return true;

  return /android/i.test(String(navigator.userAgent || ""));
}

export function applyPlatformPerfClasses() {
  if (typeof document === "undefined") return { android: false };

  const android = isAndroidPlatform();
  document.documentElement.classList.toggle("platform-android", android);
  document.documentElement.classList.toggle("platform-ios", !android && /iphone|ipad|ipod/i.test(navigator.userAgent || ""));
  return { android };
}

export function subscribePlatformPerf() {
  if (typeof window === "undefined") return () => {};

  const notify = () => applyPlatformPerfClasses();
  notify();

  window.Telegram?.WebApp?.onEvent?.("viewportChanged", notify);

  return () => {
    window.Telegram?.WebApp?.offEvent?.("viewportChanged", notify);
  };
}
