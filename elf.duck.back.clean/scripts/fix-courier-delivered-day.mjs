/**
 * Проставити deliveredAt кур'єрським замовленням за день (для статистики).
 *
 * node scripts/fix-courier-delivered-day.mjs --day 2026-10-07 --order ED-KXGWUA,ED-Z9ET4H
 * node scripts/fix-courier-delivered-day.mjs --day 2026-10-07 --auto-created-today
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
import {
  buildStatsOrdersMongoFilter,
  getWarsawDayKey,
  orderBelongsToStatsDay,
} from "../lib/server/helpers/orderStatsDay.js";
import { getOrderPointMatch } from "../lib/server/helpers/chunk08.js";

const args = process.argv.slice(2);
function arg(name) {
  const i = args.indexOf(name);
  return i >= 0 ? String(args[i + 1] || "").trim() : "";
}

const dayKey = arg("--day");
const orderList = arg("--order");
const autoCreated = args.includes("--auto-created-today");
const dryRun = args.includes("--dry-run");

if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
  console.error(
    "Usage: --day YYYY-MM-DD --order ED-1,ED-2 | --auto-created-today"
  );
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI);

let targets = [];

if (autoCreated) {
  const all = await Order.find({
    deliveryType: "delivery",
    deliveryMethod: "courier",
    status: { $in: ["completed", "done"] },
  }).select("orderNo createdAt completedAt deliveredAt status");

  targets = all.filter(
    (o) => getWarsawDayKey(o.createdAt) === dayKey && o.completedAt
  );
} else if (orderList) {
  const nos = orderList.split(",").map((s) => s.trim()).filter(Boolean);
  targets = await Order.find({
    orderNo: { $in: nos },
    deliveryType: "delivery",
    deliveryMethod: "courier",
  }).select("orderNo createdAt completedAt deliveredAt status");
} else {
  console.error("Specify --order or --auto-created-today");
  process.exit(1);
}

console.log({
  dayKey,
  dryRun,
  count: targets.length,
  orders: targets.map((o) => ({
    orderNo: o.orderNo,
    status: o.status,
    completedAt: o.completedAt,
  })),
});

if (!dryRun) {
  for (const o of targets) {
    if (!o.completedAt) continue;
    await Order.updateOne(
      { _id: o._id },
      { $set: { deliveredAt: o.completedAt } }
    );
  }
}

const verify = await Order.find(
  buildStatsOrdersMongoFilter(getOrderPointMatch({ key: "delivery" }), new Date(`${dayKey}T12:00:00.000Z`))
).lean();
const inDay = verify.filter((o) => orderBelongsToStatsDay(o, dayKey));
console.log(
  "stats after:",
  inDay.length,
  inDay.map((o) => o.orderNo)
);

await mongoose.disconnect();
