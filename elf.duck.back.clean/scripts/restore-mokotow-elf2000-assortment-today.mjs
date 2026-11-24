/**
 * After a mistaken +1 reverse on АССОРТИМЕНТ for stale pickup completions,
 * re-apply −1 for units physically handed out today (ОТЧЁТ / stats stay on Sep day).
 *
 *   node scripts/restore-mokotow-elf2000-assortment-today.mjs
 *   node scripts/restore-mokotow-elf2000-assortment-today.mjs --dry-run
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });
dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env") });

import mongoose from "mongoose";
import Order from "../models/Order.js";
import PickupPoint from "../models/PickupPoint.js";
import { getAssortmentSheetModelName } from "../lib/server/helpers/chunk09.js";
import { resolveOrderPointKey } from "../lib/googleSheets/orderSync.js";
import { resolveSpreadsheetIdForPointKey } from "../lib/googleSheets/config.js";
import { applyAssortmentDelta } from "../lib/googleSheets/assortmentGrid.js";
import { getWarsawDayKey } from "../lib/server/helpers/orderStatsDay.js";

const ORDER_NOS = ["ED-H2ZQYZ", "ED-EKAC6U"];
const dryRun = process.argv.includes("--dry-run");

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const dayKey = getWarsawDayKey(new Date());

  for (const orderNo of ORDER_NOS) {
    const order = await Order.findOne({ orderNo });
    if (!order) {
      console.error("missing", orderNo);
      continue;
    }

    const pointKey = await resolveOrderPointKey(order);
    const spreadsheetId = resolveSpreadsheetIdForPointKey(pointKey);
    let pointLabel = pointKey;
    if (order.pickupPointId) {
      const point = await PickupPoint.findById(order.pickupPointId).lean();
      pointLabel = String(point?.title || pointKey);
    }

    console.log("\n", orderNo, "→", pointLabel, dayKey);

    for (const row of order.items || []) {
      const modelName = getAssortmentSheetModelName(row);
      for (const flavor of row.flavors || []) {
        const qty = Math.max(0, Number(flavor.qty || 0));
        if (!qty) continue;

        const flavorLabel =
          flavor.name ||
          flavor.flavorLabel ||
          flavor.title ||
          flavor.flavorKey ||
          "";

        const r = await applyAssortmentDelta({
          spreadsheetId,
          pointLabel,
          dayKey,
          modelName,
          productKey: row.productKey,
          flavorLabel,
          deltaQty: -qty,
          dryRun,
          orderNo: order.orderNo,
          orderId: String(order._id),
        });

        console.log(
          "  −",
          qty,
          flavorLabel,
          dryRun ? "(dry-run)" : JSON.stringify(r)
        );
      }
    }
  }

  await mongoose.disconnect();
  console.log("\n", dryRun ? "Dry run." : "Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});