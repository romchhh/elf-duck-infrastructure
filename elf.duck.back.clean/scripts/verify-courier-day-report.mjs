/**
 * Звірка Telegram «СТАТИСТИКА ДНЯ» (кур'єр) з Mongo.
 *
 * node scripts/verify-courier-day-report.mjs --day 2026-10-07
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(backendRoot, "..");
dotenv.config({ path: path.join(backendRoot, ".env") });
if (!process.env.MONGODB_URI) {
  dotenv.config({ path: path.join(repoRoot, ".env") });
}

import mongoose from "mongoose";
import Order from "../models/Order.js";
import PickupPoint from "../models/PickupPoint.js";
import {
  buildStatsOrdersMongoFilter,
  getOrderStatsDayKey,
  orderBelongsToStatsDay,
  STATS_ORDER_LIST_PROJECTION,
} from "../lib/server/helpers/orderStatsDay.js";
import {
  getOrderKasaPlnZl,
  getOrderPointMatch,
  getOrderSheetsDiscountTotalZl,
} from "../lib/server/helpers/chunk08.js";
import { buildDailyStatsMessage } from "../lib/server/helpers/chunk10.js";
import * as __chunk09 from "../lib/server/helpers/chunk09.js";

const args = process.argv.slice(2);
const dayKey =
  args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) ||
  String(args[args.indexOf("--day") + 1] || "").trim();

if (!dayKey) {
  console.error("Usage: node scripts/verify-courier-day-report.mjs --day YYYY-MM-DD");
  process.exit(1);
}

const anchor = new Date(`${dayKey}T12:00:00.000Z`);
const ordersSince = new Date(anchor.getTime() - 10 * 24 * 60 * 60 * 1000);

await mongoose.connect(process.env.MONGODB_URI);

const point = await PickupPoint.findOne({
  key: /^delivery/i,
}).lean();

if (!point) {
  console.error("Pickup point delivery not found");
  process.exit(1);
}

const match = getOrderPointMatch(point);
const all = await Order.find(
  buildStatsOrdersMongoFilter(match, ordersSince),
  {
    ...STATS_ORDER_LIST_PROJECTION,
    orderNo: 1,
    pickupPointKey: 1,
    completedAt: 1,
    stockCommittedAt: 1,
  }
).lean();

const dayOrders = all.filter((o) => orderBelongsToStatsDay(o, dayKey));

let soldUnits = 0;
let kasa = 0;
let disc = 0;
const clients = new Set();
const productQty = new Map();

for (const o of dayOrders) {
  clients.add(String(o.userTelegramId || "").trim());
  kasa += getOrderKasaPlnZl(o);
  disc += getOrderSheetsDiscountTotalZl(o);

  for (const row of o.items || []) {
    const statsKey =
      __chunk09.getStatsSheetReportModelKey(row) ||
      String(row.productKey || "").trim();
    let rowQty = 0;
    for (const f of row.flavors || []) {
      rowQty += Math.max(0, Number(f?.qty || f?.quantity || 0));
    }
    soldUnits += rowQty;
    if (statsKey && rowQty > 0) {
      productQty.set(statsKey, (productQty.get(statsKey) || 0) + rowQty);
    }
  }
}

const byStatsDayKey = new Map();
for (const o of all) {
  const k = getOrderStatsDayKey(o);
  byStatsDayKey.set(k, (byStatsDayKey.get(k) || 0) + 1);
}

const wrongDay = dayOrders.filter((o) => getOrderStatsDayKey(o) !== dayKey);

console.log("=== Mongo vs report (Курьер / delivery) ===");
console.log({
  pointKey: point.key,
  pointTitle: point.title,
  filter: match,
  dayKey,
  ordersInDay: dayOrders.length,
  uniqueClients: clients.size,
  soldUnits,
  kasaPln: Number(kasa.toFixed(2)),
  discounts: Number(disc.toFixed(2)),
});

console.log("\nTop products (stats key):");
console.log(
  [...productQty.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([k, q]) => ({ k, q }))
);

console.log("\nCourier completed orders by stats day (last 5 days):");
console.log(
  [...byStatsDayKey.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-8)
);

if (wrongDay.length) {
  console.log("\nWARN: orders with mismatched day key:", wrongDay.length);
}

const preview = buildDailyStatsMessage(point, dayOrders, dayKey);
const finBlock = preview.split("🏦 ФИНАНСЫ")[1]?.split("🦆")[0] || "";
console.log("\n--- buildDailyStatsMessage FINANCES preview ---");
console.log(finBlock.trim());

const latestCourier = await Order.findOne({
  deliveryType: "delivery",
  deliveryMethod: "courier",
  status: { $in: ["completed", "done"] },
})
  .sort({ completedAt: -1 })
  .select("orderNo completedAt totalZl")
  .lean();

console.log("\nLatest completed courier order in this Mongo:", latestCourier || "(none)");

console.log("\nSample orders (first 8):");
for (const o of dayOrders.slice(0, 8)) {
  console.log({
    orderNo: o.orderNo,
    statsDay: getOrderStatsDayKey(o),
    completedAt: o.completedAt,
    totalZl: o.totalZl,
    kasa: getOrderKasaPlnZl(o),
    method: o.payment?.method,
  });
}

await mongoose.disconnect();
