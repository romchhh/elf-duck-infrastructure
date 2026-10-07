/**
 * Підготовка Mongo під нові правила статистики:
 * - кур'єр: deliveredAt ← completedAt (якщо ще немає)
 *
 * node scripts/backfill-stats-anchors.mjs --dry-run
 * node scripts/backfill-stats-anchors.mjs
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

const dryRun = process.argv.includes("--dry-run");

await mongoose.connect(process.env.MONGODB_URI);

const candidates = await Order.find({
  deliveryType: "delivery",
  deliveryMethod: "courier",
  status: { $in: ["completed", "done"] },
  deliveredAt: null,
  completedAt: { $ne: null },
}).select("_id orderNo completedAt deliveredAt");

console.log({
  dryRun,
  courierNeedDeliveredAt: candidates.length,
});

if (!dryRun && candidates.length) {
  const bulk = candidates.map((o) => ({
    updateOne: {
      filter: { _id: o._id },
      update: { $set: { deliveredAt: o.completedAt } },
    },
  }));
  const res = await Order.bulkWrite(bulk);
  console.log("bulkWrite:", res.modifiedCount);
}

await mongoose.disconnect();
