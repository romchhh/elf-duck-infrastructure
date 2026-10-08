/**
 * Unit checks for platform detection (no DOM).
 * Run: node scripts/test-platform-perf.mjs
 */
import assert from "assert";

function isAndroidPlatformFrom(platform, userAgent) {
  const tgPlatform = String(platform || "").trim().toLowerCase();
  if (tgPlatform.includes("android")) return true;
  return /android/i.test(String(userAgent || ""));
}

const cases = [
  { p: "android", ua: "", want: true },
  { p: "android_x", ua: "", want: true },
  { p: "ios", ua: "iPhone", want: false },
  { p: "", ua: "Mozilla/5.0 (Linux; Android 14)", want: true },
  { p: "tdesktop", ua: "", want: false },
];

for (const c of cases) {
  const got = isAndroidPlatformFrom(c.p, c.ua);
  assert.strictEqual(got, c.want, JSON.stringify(c));
}

console.log("OK: platform detection cases passed.");
