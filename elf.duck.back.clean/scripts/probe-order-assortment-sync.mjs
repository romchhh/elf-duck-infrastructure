/**
 * Діагностика асортимент-sync для одного замовлення (dry-run, без запису в sheet).
 *
 * docker compose exec api node scripts/probe-order-assortment-sync.mjs --order ED-T3MXHK
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(backendRoot, ".env") });

import mongoose from "mongoose";
import Order from "../models/Order.js";
import {
  applyAssortmentDelta,
  buildAssortmentFlavorSearchLabels,
} from "../lib/googleSheets/assortmentGrid.js";
import { isGoogleSheetsEnabled, resolveSpreadsheetIdForPointKey } from "../lib/googleSheets/config.js";
import { resolveOrderPointKey } from "../lib/googleSheets/orderSync.js";
import { getOrderStatsDayKey } from "../lib/server/helpers/orderStatsDay.js";
import { getAssortmentSheetModelName } from "../lib/server/helpers/chunk09.js";

const args = process.argv.slice(2);
function arg(name) {
  const i = args.indexOf(name);
  return i >= 0 ? String(args[i + 1] || "").trim() : "";
}

const orderNo = arg("--order").replace(/^#/, "");

if (!orderNo) {
  console.error("Usage: node scripts/probe-order-assortment-sync.mjs --order ED-T3MXHK");
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI);

const order = await Order.findOne({
  orderNo: new RegExp(`^${orderNo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
}).lean();

if (!order) {
  console.error("Order not found:", orderNo);
  process.exit(1);
}

const pointKey = await resolveOrderPointKey(order);
const spreadsheetId = resolveSpreadsheetIdForPointKey(pointKey);
const dayKey = getOrderStatsDayKey(order);

console.log({
  orderNo: order.orderNo,
  status: order.status,
  pointKey,
  spreadsheetId,
  dayKey,
  sheetsEnabled: isGoogleSheetsEnabled(),
  googleSheetSync: order.googleSheetSync || {},
});

for (const row of order.items || []) {
  const modelName = getAssortmentSheetModelName(row);
  console.log("\n— item —", {
    productKey: row.productKey,
    title: row.productTitle1 || row.title,
    modelName,
  });

  for (const flavor of row.flavors || []) {
    const qty = Number(flavor?.qty || 0);
    if (!qty) continue;

    const labels = buildAssortmentFlavorSearchLabels(flavor, row.productKey);
    console.log("flavor:", {
      flavorKey: flavor.flavorKey,
      flavorLabel: flavor.flavorLabel,
      label: flavor.label,
      qty,
      searchLabels: labels,
    });

    const result = await applyAssortmentDelta({
      spreadsheetId,
      pointLabel: pointKey,
      dayKey,
      modelName,
      productKey: row.productKey,
      flavorLabel: labels[0] || "",
      flavorLabelCandidates: labels.slice(1),
      deltaQty: -qty,
      dryRun: true,
    });

    console.log("dry-run assortment:", result);
  }
}

await mongoose.disconnect();
