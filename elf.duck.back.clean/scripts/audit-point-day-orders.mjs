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
const onlyFail = args.includes("--only-fail");

function summarizeAssortSyncError(gs = {}) {
  const raw = String(gs.lastError || "").trim();
  if (!raw) return "";

  try {
    const parsed = JSON.parse(raw);
    const hit = (parsed.results || []).find(
      (r) => r.assortmentResult && r.assortmentResult.ok === false
    );
    if (hit?.assortmentResult?.reason) {
      return String(hit.assortmentResult.reason);
    }
  } catch {
    // not JSON — fall through
  }

  const reasonMatch = raw.match(
    /MODEL_BLOCK_NOT_FOUND|FLAVOR_ROW_NOT_FOUND|NO_SPREADSHEET_FOR_POINT|SYNC_IN_PROGRESS/
  );
  if (reasonMatch) return reasonMatch[0];

  return raw.slice(0, 80);
}

if (!pointKey || !/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
  console.error(
    "Usage: node scripts/audit-point-day-orders.mjs --point mokot-w --day YYYY-MM-DD [--only-fail]"
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
  { ...STATS_ORDER_LIST_PROJECTION, googleSheetSync: 1, stockCommittedAt: 1 }
).lean();

const dayOrders = orders
  .filter((o) => orderBelongsToStatsDay(o, dayKey))
  .sort(
    (a, b) =>
      new Date(a.completedAt || a.stockCommittedAt || 0) -
      new Date(b.completedAt || b.stockCommittedAt || 0)
  );

let sumDisc = 0;
let sumSale = 0;
let sumRef = 0;
let sumCb = 0;
let sumKasa = 0;
let syncOk = 0;
let syncFail = 0;

console.log({ point: point.key, title: point.title, dayKey, orders: dayOrders.length });
console.log("—");

for (const o of dayOrders) {
  const gs = o.googleSheetSync || {};
  const assortOk = Boolean(gs.appliedAt);
  if (onlyFail && assortOk) continue;

  const disc = getOrderSheetsDiscountTotalZl(o);
  const sale = getOrderSalePromoDiscountTotalZl(o);
  const ref = Number(o.payment?.referralFirstOrderDiscountTotalZl || 0);
  const cb = Number(o.payment?.cashbackAppliedZl || 0);
  const kasa = getOrderKasaPlnZl(o);
  sumDisc += disc;
  sumSale += sale;
  sumRef += ref;
  sumCb += cb;
  sumKasa += kasa;

  if (assortOk) syncOk += 1;
  else syncFail += 1;

  const stockOk = Boolean(o.stockCommittedAt);
  const assortErr = !assortOk ? summarizeAssortSyncError(gs) : "";

  console.log(
    `#${o.orderNo}`,
    `kasa=${kasa.toFixed(2)}`,
    `скидки=${disc.toFixed(2)} (SALE ${sale.toFixed(2)} ref ${ref.toFixed(2)} cb ${cb.toFixed(2)})`,
    `mongoStock=${stockOk ? "OK" : "MISS"}`,
    `assort=${assortOk ? "OK" : "FAIL"}`,
    assortErr ? `syncReason=${assortErr}` : "",
    `statsDay=${getOrderStatsDayKey(o)}`
  );
}

console.log("—");
console.log({
  kasaTotal: sumKasa.toFixed(2),
  discountsTotal: sumDisc.toFixed(2),
  breakdown: {
    SALE: sumSale.toFixed(2),
    referral: sumRef.toFixed(2),
    cashback: sumCb.toFixed(2),
  },
  assortmentSyncOk: syncOk,
  assortmentSyncFail: syncFail,
});
console.log(
  "\nСклад (АССОРТИМЕНТ): після кожного «виконано» (retry-google-sheets-assortment.mjs якщо FAIL)."
);
console.log(
  "Продажі (tier 1|2|3-4|5, ПРОДАНО формули): ввечері або resync-google-sheets-day.mjs + reconcile-day-stats.mjs."
);

await mongoose.disconnect();
