/**
 * Аудит completed-замовлень за день: Sheets sync + розбивка знижок.
 *
 * docker compose exec api node scripts/audit-point-day-orders.mjs --point mokot-w --day 2026-10-06
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
  getOrderKasaPlnZl,
  getOrderSheetsDiscountTotalZl,
  getOrderSalePromoDiscountTotalZl,
  getOrderPointMatch,
} from "../lib/server/helpers/chunk08.js";
import {
  buildStatsOrdersMongoFilter,
  getOrderStatsDayKey,
  orderBelongsToStatsDay,
  STATS_ORDER_LIST_PROJECTION,
} from "../lib/server/helpers/orderStatsDay.js";

const args = process.argv.slice(2);
function arg(name) {
  const i = args.indexOf(name);
  return i >= 0 ? String(args[i + 1] || "").trim() : "";
}

const pointKey = arg("--point");
const dayKey = arg("--day");

if (!pointKey || !/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
  console.error(
    "Usage: node scripts/audit-point-day-orders.mjs --point mokot-w --day YYYY-MM-DD"
  );
  process.exit(1);
}

const anchor = new Date(`${dayKey}T12:00:00.000Z`);
const ordersSince = new Date(anchor.getTime() - 10 * 24 * 60 * 60 * 1000);

await mongoose.connect(process.env.MONGODB_URI);

const point = await PickupPoint.findOne({
  key: new RegExp(`^${pointKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"),
}).lean();

if (!point) {
  console.error("Point not found:", pointKey);
  process.exit(1);
}

const orders = await Order.find(
  buildStatsOrdersMongoFilter(getOrderPointMatch(point), ordersSince),
  { ...STATS_ORDER_LIST_PROJECTION, googleSheetSync: 1 }
).lean();

const dayOrders = orders
  .filter((o) => orderBelongsToStatsDay(o, dayKey))
  .sort(
    (a, b) =>
      new Date(a.completedAt || a.stockCommittedAt || 0) -
      new Date(b.completedAt || b.stockCommittedAt || 0)
  );

let sumDisc = 0;
let sumKasa = 0;
let syncOk = 0;
let syncFail = 0;

console.log({ point: point.key, title: point.title, dayKey, orders: dayOrders.length });
console.log("—");

for (const o of dayOrders) {
  const disc = getOrderSheetsDiscountTotalZl(o);
  const sale = getOrderSalePromoDiscountTotalZl(o);
  const ref = Number(o.payment?.referralFirstOrderDiscountTotalZl || 0);
  const cb = Number(o.payment?.cashbackAppliedZl || 0);
  const kasa = getOrderKasaPlnZl(o);
  sumDisc += disc;
  sumKasa += kasa;

  const gs = o.googleSheetSync || {};
  const assortOk = Boolean(gs.appliedAt && !gs.lastError);
  if (assortOk) syncOk += 1;
  else syncFail += 1;

  console.log(
    `#${o.orderNo}`,
    `kasa=${kasa.toFixed(2)}`,
    `скидки=${disc.toFixed(2)} (SALE ${sale.toFixed(2)} ref ${ref.toFixed(2)} cb ${cb.toFixed(2)}, без смарт-сходинки)`,
    `assort=${gs.appliedAt ? "OK" : "FAIL"}`,
    gs.lastError ? `err=${String(gs.lastError).slice(0, 80)}` : "",
    `statsDay=${getOrderStatsDayKey(o)}`
  );
}

console.log("—");
console.log({
  kasaTotal: sumKasa.toFixed(2),
  discountsTotal: sumDisc.toFixed(2),
  assortmentSyncOk: syncOk,
  assortmentSyncFail: syncFail,
});
console.log(
  "\nОТЧЁТ (tiers/СКИДКИ) оновлюється ввечері або через resync-google-sheets-day.mjs, не після кожного заказа."
);

await mongoose.disconnect();
