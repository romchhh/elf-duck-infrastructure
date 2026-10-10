/**
 * Чому «СТАТИСТИКА ДНЯ» для delivery / delivery-2 може бути порожньою.
 *
 * Правила (orderStatsDay.js):
 *   кур'єр (delivery): у звіті лише з deliveredAt («🚚 Заказ доставлен» після completed)
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

if (!pointKey || !/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
  console.error(
    "Usage: node scripts/audit-delivery-stats-day.mjs --point delivery|delivery-2 --day YYYY-MM-DD"
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
  if (o.deliveredAt) return null;
  if (["completed", "done"].includes(st)) {
    return "COMPLETED_BUT_NO_DELIVERED_AT (натисніть «🚚 Заказ доставлен» у боті)";
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
console.log({
  db: mongoose.connection.name,
  point: point.key,
  dayKey,
  channel: kind,
  wideRecentOrders: wide.length,
  mongoStatsWindow: inMongoWindow.length,
  inStatsDay: inStatsDay.length,
});

console.log("\n— У звіті за день —");
for (const o of inStatsDay) {
  console.log(
    `#${o.orderNo}`,
    `status=${o.status}`,
    kind === "courier"
      ? `deliveredAt=${o.deliveredAt?.toISOString?.() || "—"}`
      : `shippedAt=${o.shippedAt?.toISOString?.() || "—"}`,
    `statsDay=${getOrderStatsDayKey(o)}`
  );
}

const gaps = wide.filter((o) => !orderBelongsToStatsDay(o, dayKey));
const sameDayWrongAnchor = gaps.filter(
  (o) => shouldCountOrderInDailyStats(o) && getOrderStatsDayKey(o) !== dayKey
);
const notCounted = gaps.filter((o) => !shouldCountOrderInDailyStats(o));

console.log("\n— Не в звіті за цей день (але кур'єр/InPost недавно) —");
for (const o of notCounted.slice(0, 40)) {
  const reason =
    kind === "courier" ? courierGapReason(o) : inpostGapReason(o);
  console.log(
    `#${o.orderNo}`,
    `status=${o.status}`,
    `completedAt=${o.completedAt?.toISOString?.().slice(0, 10) || "—"}`,
    `deliveredAt=${o.deliveredAt?.toISOString?.().slice(0, 10) || "—"}`,
    `shippedAt=${o.shippedAt?.toISOString?.().slice(0, 10) || "—"}`,
    reason ? `→ ${reason}` : `→ other_day statsDay=${getOrderStatsDayKey(o)}`
  );
}
if (notCounted.length > 40) {
  console.log(`… ще ${notCounted.length - 40}`);
}

if (sameDayWrongAnchor.length) {
  console.log("\n— Рахуються в статистиці, але інший день (Warsaw) —");
  for (const o of sameDayWrongAnchor) {
    console.log(`#${o.orderNo} statsDay=${getOrderStatsDayKey(o)}`);
  }
}

console.log(
  "\nВиправлення кур'єра без deliveredAt: scripts/backfill-stats-anchors.mjs або fix-courier-delivered-day.mjs"
);
console.log(
  "Тест звіту адміну: node scripts/send-daily-stats-telegram.mjs --point",
  pointKey,
  "--day",
  dayKey,
  "--test --force"
);

await mongoose.disconnect();
