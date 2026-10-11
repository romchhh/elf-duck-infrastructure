/**
 * Чому «СТАТИСТИКА ДНЯ» для delivery / delivery-2 може бути порожньою.
 *
 * Правила (orderStatsDay.js):
 *   кур'єр (delivery): completed/done (день = completedAt; у ТГ це «Доставлен»)
 *   InPost (delivery-2): status shipped + shippedAt («📦 отправлен» / трек)
 *
 * docker compose exec api node scripts/audit-delivery-stats-day.mjs --point delivery --day 2026-10-09
 * docker compose exec api node scripts/audit-delivery-stats-day.mjs --point delivery-2 --day 2026-10-09
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import Order from "../models/Order.js";
import PickupPoint from "../models/PickupPoint.js";
import { getOrderPointMatch } from "../lib/server/helpers/chunk08.js";
import {
  buildStatsOrdersMongoFilter,
  getOrderStatsDayKey,
  getOrderStatsFulfillmentKind,
  orderBelongsToStatsDay,
  shouldCountOrderInDailyStats,
  STATS_ORDER_LIST_PROJECTION,
} from "../lib/server/helpers/orderStatsDay.js";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(backendRoot, ".env") });
if (!process.env.MONGODB_URI) {
  dotenv.config({ path: path.join(backendRoot, "..", ".env") });
}

const args = process.argv.slice(2);
function arg(name) {
  const i = args.indexOf(name);
  return i >= 0 ? String(args[i + 1] || "").trim() : "";
}

const pointKey = arg("--point");
const dayKey = arg("--day");
const verbose = args.includes("--verbose");

if (!pointKey || !/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
  console.error(
    "Usage: node scripts/audit-delivery-stats-day.mjs --point delivery|delivery-2 --day YYYY-MM-DD [--verbose]"
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

const match = getOrderPointMatch(point);
const wide = await Order.find(
  {
    deliveryType: "delivery",
    deliveryMethod: match.deliveryMethod,
    status: { $nin: ["canceled", "annulled"] },
    createdAt: { $gte: ordersSince },
  },
  STATS_ORDER_LIST_PROJECTION
).lean();

const inMongoWindow = await Order.find(
  buildStatsOrdersMongoFilter(match, ordersSince),
  STATS_ORDER_LIST_PROJECTION
).lean();

const inStatsDay = inMongoWindow.filter((o) => orderBelongsToStatsDay(o, dayKey));

function courierGapReason(o) {
  const st = String(o.status || "").toLowerCase();
  if (["completed", "done"].includes(st) && (o.completedAt || o.stockCommittedAt)) {
    return null;
  }
  return `STATUS_${st || "?"}`;
}

function inpostGapReason(o) {
  const st = String(o.status || "").toLowerCase();
  if (st === "shipped" && o.shippedAt) return null;
  if (st === "shipped" && !o.shippedAt) return "SHIPPED_NO_SHIPPED_AT";
  if (["completed", "done"].includes(st)) {
    return "COMPLETED_NOT_SHIPPED (InPost: потрібен статус shipped + трек)";
  }
  return `STATUS_${st || "?"}`;
}

const kind = match.deliveryMethod === "inpost" ? "inpost" : "courier";

const gaps = wide.filter((o) => !orderBelongsToStatsDay(o, dayKey));
const otherCompletedDays = gaps.filter((o) => shouldCountOrderInDailyStats(o));
const notCounted = gaps.filter((o) => !shouldCountOrderInDailyStats(o));

const byOtherDay = new Map();
for (const o of otherCompletedDays) {
  const k = getOrderStatsDayKey(o) || "?";
  byOtherDay.set(k, (byOtherDay.get(k) || 0) + 1);
}

console.log({
  db: mongoose.connection.name,
  point: point.key,
  dayKey,
  channel: kind,
  telegramAndSheetsForThisDayOnly: inStatsDay.length,
  note:
    "У групу/Telegram і Google за цей день потрапляють ЛИШЕ замовлення з блоку нижче (statsDay = dayKey).",
  mongoLookback10d: inMongoWindow.length,
  recentCourierInpostAllStatuses: wide.length,
  otherCompletedGoesToOtherDays: otherCompletedDays.length,
  notCompletedYet: notCounted.length,
});

console.log("\n— У звіті за", dayKey, `(тільки ці ${inStatsDay.length}) —`);
for (const o of inStatsDay) {
  console.log(
    `#${o.orderNo}`,
    `status=${o.status}`,
    `completedAt=${o.completedAt?.toISOString?.().slice(0, 16) || "—"}`,
    kind === "courier"
      ? `deliveredAt=${o.deliveredAt?.toISOString?.().slice(0, 16) || "—"}`
      : `shippedAt=${o.shippedAt?.toISOString?.().slice(0, 16) || "—"}`,
    `statsDay=${getOrderStatsDayKey(o)}`
  );
}

if (otherCompletedDays.length) {
  console.log(
    "\n— Інші виконані за ~10 дн. (НЕ в цьому звіті; кожен у свій день completedAt/shippedAt, Warsaw) —"
  );
  const sorted = [...byOtherDay.entries()].sort((a, b) => b[1] - a[1]);
  for (const [d, n] of sorted) {
    console.log(`  ${d}: ${n} замовлень`);
  }
  if (verbose) {
    for (const o of otherCompletedDays) {
      console.log(
        `  #${o.orderNo} → ${getOrderStatsDayKey(o)} completedAt=${o.completedAt?.toISOString?.().slice(0, 10) || "—"}`
      );
    }
  } else {
    console.log("  (деталі: додай --verbose)");
  }
}

if (notCounted.length) {
  console.log("\n— Ще не виконані (у звіт не потрапляють) —");
  for (const o of notCounted.slice(0, 15)) {
    const reason =
      kind === "courier" ? courierGapReason(o) : inpostGapReason(o);
    console.log(`#${o.orderNo} status=${o.status} → ${reason || "?"}`);
  }
  if (notCounted.length > 15) {
    console.log(`… ще ${notCounted.length - 15}`);
  }
}

console.log(
  "\nТест звіту: node scripts/send-daily-stats-telegram.mjs --point",
  pointKey,
  "--day",
  dayKey,
  "--test --force"
);

await mongoose.disconnect();
