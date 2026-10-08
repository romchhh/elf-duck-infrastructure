/**
 * Догнати АССОРТИМЕНТ для completed без googleSheetSync.appliedAt.
 *
 * docker compose exec api node scripts/retry-google-sheets-assortment.mjs --point mokot-w --day 2026-10-06
 * docker compose exec api node scripts/retry-google-sheets-assortment.mjs --point mokot-w --day 2026-10-06 --dry-run
 *
 * Після деплою на VPS (приклад):
 *   cd ~/elf-duck-infrastructure && git pull && docker compose build api && docker compose up -d api
 *   docker compose exec api node scripts/audit-point-day-orders.mjs --point mokot-w --day YYYY-MM-DD
 *   docker compose exec api node scripts/retry-google-sheets-assortment.mjs --point mokot-w --day YYYY-MM-DD
 * Якщо retry лишається FAIL — відкрийте лист SYNC_ERRORS у spreadsheet точки (MODEL_BLOCK_NOT_FOUND / FLAVOR_ROW_NOT_FOUND).
 * Усі точки за день: scripts/resync-google-sheets-day-all-points.mjs (асортимент через retry у складі скрипта).
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(backendRoot, ".env") });

import mongoose from "mongoose";
import Order from "../models/Order.js";
import PickupPoint from "../models/PickupPoint.js";
import { applyOrderToGoogleSheets } from "../lib/googleSheets/orderSync.js";
import {
  buildStatsOrdersMongoFilter,
  orderBelongsToStatsDay,
  STATS_ORDER_LIST_PROJECTION,
} from "../lib/server/helpers/orderStatsDay.js";
import { getOrderPointMatch } from "../lib/server/helpers/chunk08.js";

const args = process.argv.slice(2);
function arg(name) {
  const i = args.indexOf(name);
  return i >= 0 ? String(args[i + 1] || "").trim() : "";
}

const pointKey = arg("--point");
const dayKey = arg("--day");
const dryRun = args.includes("--dry-run");

if (!pointKey || !/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
  console.error(
    "Usage: node scripts/retry-google-sheets-assortment.mjs --point <key> --day YYYY-MM-DD [--dry-run]"
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

const dayOrders = orders.filter((o) => orderBelongsToStatsDay(o, dayKey));

/** Без appliedAt — у т.ч. частковий sync (assortmentAppliedSteps + lastError). */
const pending = dayOrders.filter((o) => !o.googleSheetSync?.appliedAt);

console.log({
  point: point.key,
  dayKey,
  completed: dayOrders.length,
  assortmentPending: pending.length,
  dryRun,
});

let ok = 0;
let fail = 0;

for (const o of pending) {
  if (dryRun) {
    console.log(`[dry-run] would sync #${o.orderNo}`, {
      stockCommittedAt: o.stockCommittedAt || null,
    });
    continue;
  }

  if (o.googleSheetSync?.syncInProgress) {
    await Order.updateOne(
      { _id: o._id },
      { $set: { "googleSheetSync.syncInProgress": false } }
    );
  }

  const result = await applyOrderToGoogleSheets(o, { dryRun: false });
  if (result.ok) {
    ok += 1;
    console.log(`OK #${o.orderNo}`);
  } else {
    fail += 1;
    console.log(`FAIL #${o.orderNo}`, result.reason || result);
  }
}

if (!dryRun) {
  console.log({ synced: ok, failed: fail });
  console.log(
    "\nПродажі (tier 1|2|3-4|5 + формули ПРОДАНО): resync-google-sheets-day.mjs після деплою."
  );
}

await mongoose.disconnect();
