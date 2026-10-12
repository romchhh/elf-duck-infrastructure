/**
 * Розбивка товарів у «СТАТИСТИКА ДНЯ» vs замовлення по orderNo.
 *
 * docker compose exec api node scripts/audit-stats-items-day.mjs --point mokot-w --day 2026-10-10
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import Order from "../models/Order.js";
import PickupPoint from "../models/PickupPoint.js";
import { getOrderPointMatch, getOrderKasaPlnZl } from "../lib/server/helpers/chunk08.js";
import {
  buildStatsOrdersMongoFilter,
  getOrderStatsDayKey,
  getWarsawDayKey,
  orderBelongsToStatsDay,
  STATS_ORDER_LIST_PROJECTION,
} from "../lib/server/helpers/orderStatsDay.js";
import { getStatsSheetReportModelKey } from "../lib/server/helpers/chunk09.js";
import { formatOrderFlavorCharacteristicLabel } from "../lib/orderFlavorLabel.js";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(backendRoot, ".env") });
if (!process.env.MONGODB_URI) dotenv.config({ path: path.join(backendRoot, "..", ".env") });

const args = process.argv.slice(2);
function arg(name) {
  const i = args.indexOf(name);
  return i >= 0 ? String(args[i + 1] || "").trim() : "";
}

const pointKey = arg("--point");
const dayKey = arg("--day");

if (!pointKey || !/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
  console.error(
    "Usage: node scripts/audit-stats-items-day.mjs --point mokot-w --day YYYY-MM-DD"
  );
  process.exit(1);
}

const anchor = new Date(`${dayKey}T12:00:00.000Z`);
const ordersSince = new Date(anchor.getTime() - 10 * 24 * 60 * 60 * 1000);

const dbi = args.indexOf("--db");
await mongoose.connect(
  process.env.MONGODB_URI,
  dbi >= 0 && args[dbi + 1] ? { dbName: String(args[dbi + 1]).trim() } : undefined
);

const point = await PickupPoint.findOne({
  key: new RegExp(`^${pointKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"),
}).lean();

if (!point) {
  console.error("Point not found:", pointKey);
  process.exit(1);
}

const orders = await Order.find(
  buildStatsOrdersMongoFilter(getOrderPointMatch(point), ordersSince),
  STATS_ORDER_LIST_PROJECTION
).lean();

const dayOrders = orders
  .filter((o) => orderBelongsToStatsDay(o, dayKey))
  .sort(
    (a, b) =>
      new Date(a.completedAt || 0) - new Date(b.completedAt || 0)
  );

const agg = new Map();
let totalQty = 0;
let totalKasa = 0;

console.log({
  db: mongoose.connection.name,
  point: point.key,
  dayKey,
  orders: dayOrders.length,
  warsawToday: getWarsawDayKey(),
});

for (const o of dayOrders) {
  const kasa = getOrderKasaPlnZl(o);
  totalKasa += kasa;
  const createdDay = getWarsawDayKey(o.createdAt);
  const completedDay = o.completedAt ? getWarsawDayKey(o.completedAt) : "—";

  console.log("\n---", `#${o.orderNo}`, `kasa=${kasa.toFixed(2)}`, `created=${createdDay}`, `completed=${completedDay}`);

  if (createdDay !== dayKey && completedDay === dayKey) {
    console.log("  ⚠️ Замовлення створене іншого дня, у звіт потрапило через completedAt");
  }

  for (const row of o.items || []) {
    const model = getStatsSheetReportModelKey(row) || row.productKey;
    const flavors = row.flavors || [];
    for (const f of flavors) {
      const qty = Math.max(0, Number(f.qty || f.quantity || 0));
      if (!qty) continue;
      totalQty += qty;
      const flavor = formatOrderFlavorCharacteristicLabel(row, f);
      const line = `${model} | ${flavor}`;
      agg.set(line, (agg.get(line) || 0) + qty);
      console.log(`  ${qty}× ${model} — ${flavor}`);
    }
  }
}

console.log("\n=== АГРЕГАТ (як у Telegram) ===");
const byModel = new Map();
for (const [line, qty] of [...agg.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
  const model = line.split(" | ")[0];
  byModel.set(model, (byModel.get(model) || 0) + qty);
  console.log(`${qty}× ${line}`);
}

console.log("\n=== ПО МОДЕЛЯХ ===");
for (const [m, q] of [...byModel.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`${m}: ${q}`);
}

console.log({ totalQty, totalKasa: totalKasa.toFixed(2) });

await mongoose.disconnect();
