/**
 * Перевірка, що в репозиторії є очікувані зміни для VPS (не замінює git pull на сервері).
 *
 * node scripts/verify-stats-deploy.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const checks = [
  {
    file: "lib/server/helpers/orderStatsDay.js",
    includes: ["deliveredAt", "shippedAt"],
    label: "orderStatsDay anchors",
  },
  {
    file: "models/Order.js",
    includes: ["deliveredAt"],
    label: "Order.deliveredAt",
  },
  {
    file: "lib/googleSheets/dailyReportGrid.js",
    includes: ["listDayBlockModelRowIndexes"],
    label: "dailyReportGrid tier rows",
  },
  {
    file: "lib/server/helpers/chunk10.js",
    includes: ["wola-inpost"],
    label: "wola-inpost evening sync",
  },
  {
    file: "lib/googleSheets/orderSync.js",
    includes: ["orderQualifiesForAssortmentGoogleSync", "shipped"],
    label: "InPost shipped assortment qualify",
  },
  {
    file: "lib/server/helpers/chunk03.js",
    includes: ["ensureGoogleSheetAssortmentForFulfilledOrder"],
    label: "completeInpostShipment assortment hook",
  },
  {
    file: "scripts/resync-stats-days.mjs",
    includes: ["orderStatsDay"],
    label: "resync-stats-days script",
  },
];

let failed = 0;

for (const c of checks) {
  const full = path.join(backendRoot, c.file);
  if (!fs.existsSync(full)) {
    console.error(`[FAIL] ${c.label}: missing ${c.file}`);
    failed++;
    continue;
  }
  const text = fs.readFileSync(full, "utf8");
  const missing = c.includes.filter((s) => !text.includes(s));
  if (missing.length) {
    console.error(`[FAIL] ${c.label}: ${c.file} missing ${missing.join(", ")}`);
    failed++;
  } else {
    console.log(`[OK] ${c.label}`);
  }
}

if (failed) {
  console.error(`\n${failed} check(s) failed — deploy these changes to VPS before resync.`);
  process.exit(1);
}

console.log("\nSource checks OK. On VPS: git pull && docker compose build api && docker compose up -d api");
console.log("Then: node scripts/resync-stats-days.mjs --day YYYY-MM-DD");
console.log("      node scripts/run-assortment-verification.mjs");
