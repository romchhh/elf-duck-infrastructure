/**
 * Перезапис tiers + СКИДКИ за день (як вечірній sync), без зміни БЫЛО/СТАЛО/ПРОДАНО/КАССА zł.
 * Не інкрементує місячний ІТОГО (skipMonthRollup) — лише денний блок.
 *
 * Після деплою (прод Mongo):
 *   node scripts/resync-google-sheets-day.mjs --point r-dmie-cie --day 2026-10-05 --dry-run
 *   node scripts/resync-google-sheets-day.mjs --point r-dmie-cie --day 2026-10-05
 *
 * Чеклист: tier-колонки моделей + штуки в рядку КАССА + СКИДКИ; асортимент не чіпається.
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(backendRoot, ".env") });

import mongoose from "mongoose";
import Order from "../models/Order.js";
import PickupPoint from "../models/PickupPoint.js";
import {
  buildProductAggregates,
  sendDailyPointStatsToGoogleSheetsApi,
} from "../lib/googleSheets/dailyStatsSync.js";
import { toReportModelLabel } from "../lib/googleSheets/normalize.js";
import {
  buildStatsOrdersMongoFilter,
  orderBelongsToStatsDay,
  STATS_ORDER_LIST_PROJECTION,
} from "../lib/server/helpers/orderStatsDay.js";
import { getOrderPointMatch } from "../lib/server/helpers/chunk08.js";
import {
  loadStatsDayOrders,
  resolveStatsScriptPointMeta,
} from "../lib/googleSheets/statsScriptPoints.js";

const args = process.argv.slice(2);
function arg(name, fallback = "") {
  const i = args.indexOf(name);
  return i >= 0 ? String(args[i + 1] || "").trim() : fallback;
}

const pointKey = arg("--point");
const dayKey = arg("--day");
const dryRun = args.includes("--dry-run");

if (!pointKey || !/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
  console.error(
    "Usage: node scripts/resync-google-sheets-day.mjs --point <key> --day YYYY-MM-DD [--dry-run]"
  );
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

console.log({
  pointKey: point.key,
  title: point.title,
  dayKey,
  completedOrders: dayOrders.length,
  dryRun,
  statsDayRule:
    "pickup: completedAt | courier: deliveredAt | inpost: shippedAt",
});

const products = buildProductAggregates(dayOrders);
const highlight = ["ELF MOON 40K", "ELF BC45K", "ETHEREUM"];
for (const row of products) {
  const label = toReportModelLabel(row.model);
  if (highlight.some((h) => label.includes(h) || row.model.includes(h))) {
    console.log(label, {
      sold: row.sold,
      tier1: row.tier1,
      tier2: row.tier2,
      tier34: row.tier34,
      tier5: row.tier5,
    });
  }
}

const result = await sendDailyPointStatsToGoogleSheetsApi(
  point,
  dayOrders,
  dayKey,
  { dryRun, skipMonthRollup: true }
);

console.log("sync result:", result);
await mongoose.disconnect();
