/**
 * Undo day-stats / Sheets pollution from completing months-old assembled
 * pickup orders after a late «Я на месте» click.
 *
 * Usage:
 *   node scripts/fix-stale-arrival-complete-stats.mjs
 *   node scripts/fix-stale-arrival-complete-stats.mjs --dry-run
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });
dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env") });

import mongoose from "mongoose";
import Order from "../models/Order.js";
import { reverseOrderReportOnGoogleSheets } from "../lib/googleSheets/reportOrderSync.js";
import { getOrderStatsDayKey } from "../lib/server/helpers/orderStatsDay.js";

const ORDER_NOS = ["ED-H2ZQYZ", "ED-EKAC6U"];
const dryRun = process.argv.includes("--dry-run");

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI missing");

  await mongoose.connect(uri);
  const orders = await Order.find({ orderNo: { $in: ORDER_NOS } });

  if (!orders.length) {
    console.error("No orders found");
    process.exit(1);
  }

  for (const order of orders) {
    const stockAt = order.stockCommittedAt
      ? new Date(order.stockCommittedAt)
      : null;
    const beforeDay = getOrderStatsDayKey(order);

    console.log("\n—", order.orderNo);
    console.log("  status", order.status);
    console.log("  statsDay before", beforeDay);
    console.log("  completedAt", order.completedAt?.toISOString?.());
    console.log("  stockCommittedAt", stockAt?.toISOString?.());
    console.log("  paidAt", order.payment?.paidAt?.toISOString?.());
    console.log(
      "  sheet appliedAt",
      order.googleSheetSync?.appliedAt?.toISOString?.() || null,
      "reportAppliedAt",
      order.googleSheetSync?.reportAppliedAt?.toISOString?.() || null
    );

    if (!stockAt) {
      console.error("  SKIP: no stockCommittedAt");
      continue;
    }

    if (!dryRun) {
      const reportRev = await reverseOrderReportOnGoogleSheets(order, {
        force: true,
      });
      console.log("  report reverse", reportRev?.ok, reportRev?.reason || reportRev?.dayKey);
      console.log(
        "  assortment: skip reverse (stock already committed earlier; only ОТЧЁТ pollutes stats)"
      );

      const fresh = await Order.findById(order._id);
      fresh.completedAt = stockAt;
      if (fresh.payment) {
        fresh.payment.paidAt = stockAt;
        // keep checkedAt as historical manager confirm if missing
        if (!fresh.payment.checkedAt) fresh.payment.checkedAt = stockAt;
      }
      fresh.arrivedNotifiedAt = null;
      fresh.managerArrivalMessageIds = [];
      if (fresh.googleSheetSync) {
        fresh.googleSheetSync.appliedAt = null;
        fresh.googleSheetSync.reversedAt = null;
        fresh.googleSheetSync.reportAppliedAt = null;
        fresh.googleSheetSync.reportReversedAt = null;
        fresh.googleSheetSync.assortmentAppliedSteps = [];
        fresh.googleSheetSync.lastError = "";
        fresh.googleSheetSync.reportLastError = "";
      }
      fresh.managerEditedAt = new Date();
      await fresh.save();

      console.log("  statsDay after", getOrderStatsDayKey(fresh));
      console.log("  completedAt after", fresh.completedAt?.toISOString?.());
    } else {
      console.log("  dry-run: would reverse sheets + set completedAt/paidAt →", stockAt.toISOString());
    }
  }

  await mongoose.disconnect();
  console.log(dryRun ? "\nDry run done." : "\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
