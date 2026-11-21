/**
 * Друкує агрегати ОТЧЁТ за день (без запису в таблицю).
 * node scripts/preview-report-day.mjs --day 2026-11-20
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(backendRoot, "..");
dotenv.config({ path: path.join(repoRoot, ".env") });
dotenv.config({ path: path.join(backendRoot, ".env") });

import mongoose from "mongoose";
import Order from "../models/Order.js";
import PickupPoint from "../models/PickupPoint.js";
import { buildProductAggregates } from "../lib/googleSheets/dailyStatsSync.js";
import { getOrderSheetsDiscountTotalZl } from "../lib/server/helpers/chunk08.js";
import {
  buildStatsOrdersMongoFilter,
  orderBelongsToStatsDay,
  STATS_ORDER_LIST_PROJECTION,
} from "../lib/server/helpers/orderStatsDay.js";
import { getOrderPointMatch } from "../lib/server/helpers/chunk08.js";
import {
  DAILY_STATS_RESYNC_POINT_KEYS,
  loadStatsDayOrders,
} from "../lib/googleSheets/statsScriptPoints.js";

const args = process.argv.slice(2);
function arg(name, fallback = "") {
  const i = args.indexOf(name);
  return i >= 0 ? String(args[i + 1] || "").trim() : fallback;
}

const dayKey = arg("--day", "2026-11-20");
const only = arg("--point");
const points = only ? [only] : DAILY_STATS_RESYNC_POINT_KEYS;

if (!process.env.MONGODB_URI) {
  console.error("MONGODB_URI missing");
  process.exit(1);
}

const anchor = new Date(`${dayKey}T12:00:00.000Z`);
const ordersSince = new Date(anchor.getTime() - 10 * 24 * 60 * 60 * 1000);

await mongoose.connect(process.env.MONGODB_URI);

for (const pointKey of points) {
  const dayOrders = await loadStatsDayOrders({
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

  const products = buildProductAggregates(dayOrders || []);
  const interesting = products.filter((row) =>
    /MERRY|ELFLIQ|FOR PODS|FORPODS/i.test(String(row.model || ""))
  );
  const discounts = Number(
    (dayOrders || [])
      .reduce((sum, order) => sum + getOrderSheetsDiscountTotalZl(order), 0)
      .toFixed(2)
  );

  console.log(
    JSON.stringify({
      pointKey,
      orders: (dayOrders || []).length,
      discounts,
      interesting,
    })
  );
}

await mongoose.disconnect();
