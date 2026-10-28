/** Mini app opened from test bot at WEBAPP_URL/test — same UI, extra giveaway banner. */
export function detectAppBasename() {
  if (typeof window === "undefined") return "";

  const raw = window.location.pathname || "/";
  const path = raw.replace(/\/+$/, "") || "/";

  if (path === "/test" || path.startsWith("/test/")) {
    return "/test";
  }

  return "";
}

export function isTestAppMode() {
  return detectAppBasename() === "/test";
}

/** Prefix internal routes when running under /test. */
export function appPath(path = "/") {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (!isTestAppMode()) return normalized;
  if (normalized === "/") return "/test";
  return `/test${normalized}`;
}
