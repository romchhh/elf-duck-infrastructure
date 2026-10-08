/**
 * Static audit: expensive CSS patterns vs androidPerf overrides.
 * Run: node scripts/audit-mobile-perf.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const stylesDir = path.join(__dir, "../src/styles");
const androidPerfPath = path.join(stylesDir, "androidPerf.css");

const HOT_PATTERNS = [
  { id: "glowShimmer", re: /animation:\s*glowShimmer/g },
  { id: "checkoutGlowShimmer", re: /animation:\s*checkoutGlowShimmer/g },
  { id: "blurFilter", re: /filter:\s*blur\(/g },
  { id: "backdropBlur", re: /backdrop-filter:\s*blur/g },
  { id: "mixBlendScreen", re: /mix-blend-mode:\s*screen/g },
];

const ROOT_GLOW_SELECTORS = [
  ".App::after",
  ".CartApp::after",
  ".ManagersApp::after",
  ".ReferralApp::after",
  ".checkoutSheet::after",
  ".checkoutSheet::before",
];

function readDirCssFiles(dir) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".css") && f !== "androidPerf.css" && f !== "iosPerf.css")
    .map((f) => ({ name: f, text: fs.readFileSync(path.join(dir, f), "utf8") }));
}

const files = readDirCssFiles(stylesDir);
const androidPerf = fs.readFileSync(androidPerfPath, "utf8");

const hits = [];
for (const file of files) {
  for (const pat of HOT_PATTERNS) {
    const count = (file.text.match(pat.re) || []).length;
    if (count > 0) hits.push({ file: file.name, pattern: pat.id, count });
  }
}

const missingRoots = ROOT_GLOW_SELECTORS.filter(
  (sel) => !androidPerf.includes(sel.replace(/::/g, "::"))
);

let failed = false;

console.log("=== Mobile perf CSS audit ===\n");
console.log("Hot patterns in styles (expect androidPerf overrides for animated glows):\n");
for (const h of hits) {
  console.log(`  ${h.file}: ${h.pattern} ×${h.count}`);
}

console.log("\nAndroid override coverage for key selectors:");
for (const sel of ROOT_GLOW_SELECTORS) {
  const ok = androidPerf.includes(sel);
  console.log(`  ${ok ? "✓" : "✗"} ${sel}`);
  if (!ok) failed = true;
}

if (failed) {
  console.error("\nFAIL: extend src/styles/androidPerf.css");
  process.exit(1);
}

console.log("\nOK: androidPerf covers checkout/root glow layers.");
console.log("Manual: Telegram Android + iOS — main glow, flavor picker, orders payment sheet, side menu.");
