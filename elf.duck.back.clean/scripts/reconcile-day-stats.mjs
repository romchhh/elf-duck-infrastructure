/**
 * Звірка Mongo (completed за день виконання) vs денний блок Google Sheet (read-only).
 *
 * node scripts/reconcile-day-stats.mjs --point r-dmie-cie --day 2026-10-05
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(backendRoot, ".env") });

import mongoose from "mongoose";
import Order from "../models/Order.js";
import PickupPoint from "../models/PickupPoint.js";
import { readSheetValues } from "../lib/googleSheets/client.js";
import { resolveSpreadsheetIdForPointKey } from "../lib/googleSheets/config.js";
import { buildProductAggregates } from "../lib/googleSheets/dailyStatsSync.js";
import {
  findDayBlock,
  findKassaRowInDayBlock,
  findReportModelRowInDayBlock,
  reportTabTitleForDayKey,
  warsawDayKeyToReportHeader,
} from "../lib/googleSheets/dailyReportGrid.js";
import { toReportModelLabel } from "../lib/googleSheets/normalize.js";
import {
  buildStatsOrdersMongoFilter,
  orderBelongsToStatsDay,
  STATS_ORDER_LIST_PROJECTION,
} from "../lib/server/helpers/orderStatsDay.js";
import {
  getOrderKasaPlnZl,
  getOrderPointMatch,
  getOrderSheetsDiscountTotalZl,
} from "../lib/server/helpers/chunk08.js";
import {
  loadStatsDayOrders,
  resolveStatsScriptPointMeta,
} from "../lib/googleSheets/statsScriptPoints.js";
import {
  getStatsSheetProductQty,
  getStatsSheetTierQty,
} from "../lib/server/helpers/chunk09.js";

const args = process.argv.slice(2);
function arg(name, fallback = "") {
  const i = args.indexOf(name);
  return i >= 0 ? String(args[i + 1] || "").trim() : fallback;
}

const pointKey = arg("--point");
const dayKey = arg("--day");

if (!pointKey || !/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
  console.error(
    "Usage: node scripts/reconcile-day-stats.mjs --point <key> --day YYYY-MM-DD"
  );
  process.exit(1);
}

function parseNum(cell) {
  const raw = String(cell ?? "")
    .replace(/\s/g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

const spreadsheetId = resolveSpreadsheetIdForPointKey(pointKey);
if (!spreadsheetId) {
  console.error("No spreadsheet for point:", pointKey);
  process.exit(1);
}

const anchor = new Date(`${dayKey}T12:00:00.000Z`);
const ordersSince = new Date(anchor.getTime() - 10 * 24 * 60 * 60 * 1000);

await mongoose.connect(process.env.MONGODB_URI);

const point = await resolveStatsScriptPointMeta(PickupPoint, pointKey);

if (!point) {
  console.error("Pickup point not found:", pointKey);
  process.exit(1);
}

let dayOrders;
try {
  dayOrders = await loadStatsDayOrders({
    Order,
    PickupPoint,
    pointKey,
    dayKey,
    ordersSince,
    projection: STATS_ORDER_LIST_PROJECTION,
    buildStatsOrdersMongoFilter,
    orderBelongsToStatsDay,
    getOrderPointMatch,
  });
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}

if (dayOrders === null) {
  console.error("Pickup point not found:", pointKey);
  process.exit(1);
}

const mongoKasa = Number(
  dayOrders.reduce((s, o) => s + getOrderKasaPlnZl(o), 0).toFixed(2)
);
const mongoDiscounts = Number(
  dayOrders.reduce((s, o) => s + getOrderSheetsDiscountTotalZl(o), 0).toFixed(2)
);

const tierTotals = { tier1: 0, tier2: 0, tier34: 0, tier5: 0 };
for (const order of dayOrders) {
  for (const row of order.items || []) {
    const qty = (row.flavors || []).reduce(
      (sum, f) => sum + Math.max(0, Number(f?.qty || 0)),
      0
    );
    if (!qty) continue;
    const soldQty = getStatsSheetProductQty(row);
    const n = Math.max(0, Number(getStatsSheetTierQty(order, row) || 0));
    let tierKey = "tier1";
    if (n >= 5) tierKey = "tier5";
    else if (n >= 3) tierKey = "tier34";
    else if (n >= 2) tierKey = "tier2";
    tierTotals[tierKey] += soldQty;
  }
}

const products = buildProductAggregates(dayOrders);
const tabTitle = reportTabTitleForDayKey(dayKey);
const dayHeader = warsawDayKeyToReportHeader(dayKey);
const rows = await readSheetValues(spreadsheetId, `'${tabTitle}'!A1:ZZ500`);
const block = findDayBlock(rows, dayHeader);

if (!block) {
  console.error("Day block not found in sheet:", dayHeader, tabTitle);
  process.exit(1);
}

const kassaRow = findKassaRowInDayBlock(rows, block);
const base = block.blockStart;
const sheetTiers = {
  tier1: parseNum(rows[kassaRow]?.[base + 4]),
  tier2: parseNum(rows[kassaRow]?.[base + 5]),
  tier34: parseNum(rows[kassaRow]?.[base + 6]),
  tier5: parseNum(rows[kassaRow]?.[base + 7]),
};
const sheetDiscounts = parseNum(rows[kassaRow]?.[base + 8]);

const modelDiffs = [];
for (const product of products) {
  const label = toReportModelLabel(product.model);
  const modelRow = findReportModelRowInDayBlock(rows, block, label);
  if (modelRow < 0) {
    modelDiffs.push({ label, issue: "MODEL_ROW_NOT_FOUND" });
    continue;
  }

  const sheet = {
    tier1: parseNum(rows[modelRow]?.[base + 4]),
    tier2: parseNum(rows[modelRow]?.[base + 5]),
    tier34: parseNum(rows[modelRow]?.[base + 6]),
    tier5: parseNum(rows[modelRow]?.[base + 7]),
  };
  const mongo = {
    tier1: product.tier1,
    tier2: product.tier2,
    tier34: product.tier34,
    tier5: product.tier5,
  };

  if (JSON.stringify(sheet) !== JSON.stringify(mongo)) {
    modelDiffs.push({ label, sheet, mongo });
  }
}

console.log("=== reconcile-day-stats ===");
console.log({
  pointKey: point.key,
  dayKey,
  orders: dayOrders.length,
  spreadsheetId,
  tabTitle,
});

console.log("\nKassa row tiers (units):");
console.log("  mongo", tierTotals);
console.log("  sheet", sheetTiers);
console.log(
  "  match",
  JSON.stringify(tierTotals) === JSON.stringify(sheetTiers) ? "OK" : "MISMATCH"
);

console.log("\nDiscounts (СКИДКИ cell):");
console.log("  mongo", mongoDiscounts);
console.log("  sheet", sheetDiscounts);
console.log(
  "  match",
  Math.abs(mongoDiscounts - sheetDiscounts) < 0.01 ? "OK" : "MISMATCH"
);

console.log("\nKasa PLN (mongo sum; sheet zł is formula — compare manually):", mongoKasa);

if (modelDiffs.length) {
  console.log("\nModel tier mismatches:", modelDiffs);
} else {
  console.log("\nAll matched model tier columns: OK");
}

await mongoose.disconnect();
