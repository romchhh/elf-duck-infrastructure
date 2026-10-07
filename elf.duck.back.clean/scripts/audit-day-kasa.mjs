/**
 * Звірка «Касса» за день: totalZl vs getOrderKasaPlnZl, викиди (UAH як PLN тощо).
 *
 * docker compose exec api node scripts/audit-day-kasa.mjs --point delivery --day 2026-10-07
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
  buildStatsOrdersMongoFilter,
  orderBelongsToStatsDay,
  STATS_ORDER_LIST_PROJECTION,
} from "../lib/server/helpers/orderStatsDay.js";
import {
  getOrderItemsSubtotalZl,
  getOrderKasaPlnZl,
  getOrderPointMatch,
  getOrderSheetsDiscountTotalZl,
} from "../lib/server/helpers/chunk08.js";
import { getOrderDisplayedPaymentMethod } from "../lib/server/helpers/chunk10.js";
import {
  loadStatsDayOrders,
  resolveStatsScriptPointMeta,
} from "../lib/googleSheets/statsScriptPoints.js";

const args = process.argv.slice(2);
function arg(name) {
  const i = args.indexOf(name);
  return i >= 0 ? String(args[i + 1] || "").trim() : "";
}

const pointKey = arg("--point");
const dayKey = arg("--day");

if (!pointKey || !/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
  console.error(
    "Usage: node scripts/audit-day-kasa.mjs --point delivery --day YYYY-MM-DD"
  );
  process.exit(1);
}

const anchor = new Date(`${dayKey}T12:00:00.000Z`);
const ordersSince = new Date(anchor.getTime() - 10 * 24 * 60 * 60 * 1000);

await mongoose.connect(process.env.MONGODB_URI);

const point = await resolveStatsScriptPointMeta(PickupPoint, pointKey);
if (!point) {
  console.error("Point not found:", pointKey);
  process.exit(1);
}

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

let sumTotal = 0;
let sumKasa = 0;
let sumItems = 0;
let sumDisc = 0;
let deliveryFees = 0;
const byMethod = new Map();
const outliers = [];

for (const o of dayOrders || []) {
  const total = Number(o.totalZl || 0);
  const kasa = getOrderKasaPlnZl(o);
  const items = getOrderItemsSubtotalZl(o);
  sumTotal += total;
  sumKasa += kasa;
  sumItems += items;
  sumDisc += getOrderSheetsDiscountTotalZl(o);

  const method = String(getOrderDisplayedPaymentMethod(o) || "unknown");
  byMethod.set(method, Number((byMethod.get(method) || 0) + kasa));

  if (o.deliveryType === "delivery" && o.deliveryMethod === "courier") {
    deliveryFees += Number(o.deliveryFeeZl || 0);
  }

  const ratio = total > 0 ? kasa / total : 0;
  if (
    ratio > 1.02 ||
    (total > 0 && kasa > total + 0.05) ||
    (total > 0 && Math.abs(kasa - total) > 0.05 && kasa !== items)
  ) {
    outliers.push({
      orderNo: o.orderNo,
      totalZl: total,
      itemsSubtotalZl: items,
      kasaPln: kasa,
      ratio: ratio.toFixed(2),
      method: o.payment?.method,
      currency: o.payment?.managerDisplayCurrency,
      displayAmount: o.payment?.managerDisplayAmount,
      rate: o.payment?.managerDisplayRate,
      remaining: o.payment?.cashbackRemainingToPayZl,
      cashbackApplied: o.payment?.cashbackAppliedZl,
    });
  }
}

const soldUnits = (dayOrders || []).reduce((sum, o) => {
  for (const row of o.items || []) {
    for (const f of row.flavors || []) {
      sum += Math.max(0, Number(f?.qty || f?.quantity || 0));
    }
  }
  return sum;
}, 0);

console.log({
  point: point.key,
  dayKey,
  orders: dayOrders?.length || 0,
  soldUnits,
  plnPerUnitFromKasa: soldUnits > 0 ? (sumKasa / soldUnits).toFixed(2) : null,
  sumTotalZl: sumTotal.toFixed(2),
  sumItemsSubtotalZl: sumItems.toFixed(2),
  sumKasaPln: sumKasa.toFixed(2),
  sumKasaNetMinusCourierFees: (sumKasa - deliveryFees).toFixed(2),
  courierDeliveryFees: deliveryFees.toFixed(2),
  sumDiscountsSheets: sumDisc.toFixed(2),
  kasaByPaymentMethod: Object.fromEntries(
    [...byMethod.entries()].sort((a, b) => b[1] - a[1])
  ),
  outliers: outliers.length,
});

outliers
  .sort((a, b) => b.kasaPln - a.kasaPln)
  .slice(0, 15)
  .forEach((row) => console.log("OUTLIER", row));

await mongoose.disconnect();
