/**
 * Точково вирівнює за день колонки Merry Mi / ELFLIQ / FOR PODS і «Скидки»
 * з замовлень Mongo. Один прогін листа, без поклітинних read.
 *
 * node scripts/fix-report-day-promo-rows.mjs --day 2026-11-20
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(backendRoot, "..");
dotenv.config({ path: path.join(repoRoot, ".env") });
dotenv.config({ path: path.join(backendRoot, ".env") });

import mongoose from "mongoose";
import Order from "../models/Order.js";
import PickupPoint from "../models/PickupPoint.js";
import { buildProductAggregates } from "../lib/googleSheets/dailyStatsSync.js";
import { getOrderSheetsDiscountTotalZl } from "../lib/server/helpers/chunk08.js";
import {
  buildStatsOrdersMongoFilter,
  orderBelongsToStatsDay,
  STATS_ORDER_LIST_PROJECTION,
} from "../lib/server/helpers/orderStatsDay.js";
import { getOrderPointMatch } from "../lib/server/helpers/chunk08.js";
import {
  loadStatsDayOrders,
  resolveStatsScriptPointMeta,
} from "../lib/googleSheets/statsScriptPoints.js";
import {
  isOrderReportSyncDisabledForPointKey,
  resolveSpreadsheetIdForPointKey,
} from "../lib/googleSheets/config.js";
import {
  DAY_BRAK_COL_OFFSET,
  findDayBlock,
  findKassaRowInDayBlock,
  listDayBlockModelRowIndexes,
  loadMonthlyReport,
  reportTabTitleForDayKey,
  warsawDayKeyToReportHeader,
} from "../lib/googleSheets/dailyReportGrid.js";
import { toReportModelLabel } from "../lib/googleSheets/normalize.js";
import {
  batchClearValues,
  batchUpdateValues,
  escapeSheetTitle,
  readSheetFormulas,
} from "../lib/googleSheets/client.js";
import {
  dayKassaSnapshotKey,
  dayModelTierSnapshotKey,
  setBotSheetSnapshotTotal,
} from "../lib/googleSheets/dayReportBotSnapshot.js";

const TARGET_RE = /MERRY|ELFLIQ|FOR PODS/i;
const TIER_FIELDS = [
  ["tier1", 4],
  ["tier2", 5],
  ["tier34", 6],
  ["tier5", 7],
];

const args = process.argv.slice(2);
function arg(name, fallback = "") {
  const i = args.indexOf(name);
  return i >= 0 ? String(args[i + 1] || "").trim() : fallback;
}

const dayKey = arg("--day", "2026-11-20");
const only = arg("--point");
const points = only
  ? [only]
  : ["praga", "r-dmie-cie", "mokot-w", "delivery"];

function colToA1(colIndex) {
  let n = colIndex + 1;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

if (!process.env.MONGODB_URI) {
  console.error("MONGODB_URI missing");
  process.exit(1);
}

const anchor = new Date(`${dayKey}T12:00:00.000Z`);
const ordersSince = new Date(anchor.getTime() - 10 * 24 * 60 * 60 * 1000);

await mongoose.connect(process.env.MONGODB_URI);

for (const pointKey of points) {
  if (isOrderReportSyncDisabledForPointKey(pointKey)) {
    console.log(JSON.stringify({ pointKey, skipped: "REPORT_SYNC_DISABLED" }));
    continue;
  }

  const point = await resolveStatsScriptPointMeta(PickupPoint, pointKey);
  const spreadsheetId = resolveSpreadsheetIdForPointKey(pointKey);
  const tabTitle = reportTabTitleForDayKey(dayKey);
  const dayOrders = await loadStatsDayOrders({
    Order,
    PickupPoint,
    pointKey,
    dayKey,
    ordersSince,
    projection: STATS_ORDER_LIST_PROJECTION,
    buildStatsOrdersMongoFilter,
    orderBelongsToStatsDay,
    getOrderPointMatch,
  });
  const products = buildProductAggregates(dayOrders || []);
  const byLabel = new Map(
    products.map((row) => [toReportModelLabel(row.model), row])
  );
  const discounts = Number(
    (dayOrders || [])
      .reduce((sum, order) => sum + getOrderSheetsDiscountTotalZl(order), 0)
      .toFixed(2)
  );

  const rows = await loadMonthlyReport(spreadsheetId, tabTitle);
  const dayHeader = warsawDayKeyToReportHeader(dayKey);
  const block = findDayBlock(rows, dayHeader);
  if (!block) {
    console.log(JSON.stringify({ pointKey, error: "DAY_BLOCK_NOT_FOUND", dayHeader }));
    continue;
  }

  const formulaRows = await readSheetFormulas(
    spreadsheetId,
    `${escapeSheetTitle(tabTitle)}!A1:ZZ650`
  );

  const writes = [];
  const clears = [];
  const planned = [];

  const queue = (rowIndex, col, value, label, field) => {
    const entered = formulaRows?.[rowIndex]?.[col];
    if (String(entered ?? "").trim().startsWith("=")) {
      planned.push({ label, field, skipped: "FORMULA" });
      return;
    }
    const range = `${escapeSheetTitle(tabTitle)}!${colToA1(col)}${rowIndex + 1}`;
    const next = Number(value || 0);
    planned.push({ label, field, value: next, cell: range });
    if (!next) {
      if (String(entered ?? "").trim() !== "") clears.push(range);
      return;
    }
    writes.push({ range, values: [[next]] });
  };

  for (const modelRow of listDayBlockModelRowIndexes(rows, block)) {
    const cellLabel = toReportModelLabel(String(rows[modelRow]?.[block.blockStart] || "").trim());
    if (!TARGET_RE.test(cellLabel)) continue;
    const product = byLabel.get(cellLabel);
    for (const [field, colOff] of TIER_FIELDS) {
      queue(
        modelRow,
        block.blockStart + colOff,
        product?.[field] || 0,
        cellLabel,
        field
      );
    }
    queue(
      modelRow,
      block.blockStart + DAY_BRAK_COL_OFFSET,
      product?.brak || 0,
      cellLabel,
      "brak"
    );
  }

  const kassaRow = findKassaRowInDayBlock(rows, block);
  if (kassaRow >= 0) {
    queue(kassaRow, block.blockStart + 8, discounts, "КАССА", "discounts");
  }

  if (writes.length) {
    await batchUpdateValues(spreadsheetId, writes);
  }
  if (clears.length) {
    await batchClearValues(spreadsheetId, clears);
  }

  for (const modelRow of listDayBlockModelRowIndexes(rows, block)) {
    const cellLabel = toReportModelLabel(String(rows[modelRow]?.[block.blockStart] || "").trim());
    if (!TARGET_RE.test(cellLabel)) continue;
    const product = byLabel.get(cellLabel);
    for (const [field] of TIER_FIELDS) {
      await setBotSheetSnapshotTotal({
        spreadsheetId,
        dayKey,
        snapshotKey: dayModelTierSnapshotKey(cellLabel, field),
        totalQty: Math.max(0, Number(product?.[field] || 0)),
      });
    }
    await setBotSheetSnapshotTotal({
      spreadsheetId,
      dayKey,
      snapshotKey: dayModelTierSnapshotKey(cellLabel, "brak"),
      totalQty: Math.max(0, Number(product?.brak || 0)),
    });
  }
  if (kassaRow >= 0) {
    await setBotSheetSnapshotTotal({
      spreadsheetId,
      dayKey,
      snapshotKey: dayKassaSnapshotKey("discounts"),
      totalQty: discounts,
    });
  }

  console.log(
    JSON.stringify({
      pointKey,
      title: point?.title || pointKey,
      orders: (dayOrders || []).length,
      discounts,
      writes: writes.length,
      clears: clears.length,
      planned,
    })
  );
}

await mongoose.disconnect();
