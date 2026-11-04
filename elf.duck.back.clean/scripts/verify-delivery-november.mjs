/**
 * Порівняння Mongo (курʼєр delivery) vs лист ОТЧЕТ 01.11.2026 у таблиці DOSTAWA.
 *
 *   node scripts/verify-delivery-november.mjs
 *   node scripts/verify-delivery-november.mjs --through 2026-11-04
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import Order from "../models/Order.js";
import PickupPoint from "../models/PickupPoint.js";
import { escapeSheetTitle, readSheetValues } from "../lib/googleSheets/client.js";
import { SPREADSHEET_ID_BY_POINT_KEY } from "../lib/googleSheets/config.js";
import {
  findDayBlock,
  findKassaRowInDayBlock,
  listDayBlockModelRowIndexes,
  reportTabTitleForDayKey,
  warsawDayKeyToReportHeader,
} from "../lib/googleSheets/dailyReportGrid.js";
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

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(backendRoot, ".env") });
dotenv.config({ path: path.join(backendRoot, "../.env") });

const POINT = "delivery";
const spreadsheetId = SPREADSHEET_ID_BY_POINT_KEY[POINT];
const tabTitle = reportTabTitleForDayKey("2026-11-01");

function parseNum(cell) {
  const raw = String(cell ?? "")
    .replace(/\s/g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? String(process.argv[i + 1] || "").trim() : fallback;
}

const through = arg("--through", "2026-11-03");
const days = [];
for (let d = 1; d <= 31; d += 1) {
  const dayKey = `2026-11-${String(d).padStart(2, "0")}`;
  if (dayKey > through) break;
  days.push(dayKey);
}

function sumSheetDayBlock(rows, dayHeader) {
  const block = findDayBlock(rows, dayHeader);
  if (!block) {
    return { ok: false, reason: "DAY_BLOCK_NOT_FOUND", dayHeader };
  }

  const { blockStart } = block;
  const tiers = { tier1: 0, tier2: 0, tier34: 0, tier5: 0 };
  const modelRows = listDayBlockModelRowIndexes(rows, block);

  for (const r of modelRows) {
    tiers.tier1 += parseNum(rows[r]?.[blockStart + 4]);
    tiers.tier2 += parseNum(rows[r]?.[blockStart + 5]);
    tiers.tier34 += parseNum(rows[r]?.[blockStart + 6]);
    tiers.tier5 += parseNum(rows[r]?.[blockStart + 7]);
  }

  const kassaRow = findKassaRowInDayBlock(rows, block);
  const discounts =
    kassaRow >= 0 ? parseNum(rows[kassaRow]?.[blockStart + 8]) : 0;

  return {
    ok: true,
    blockStart: blockStart + 1,
    tiers,
    soldUnits:
      tiers.tier1 + tiers.tier2 + tiers.tier34 + tiers.tier5,
    discounts,
    modelRows: modelRows.length,
  };
}

function mongoDayTotals(orders) {
  const products = buildProductAggregates(orders);
  const tiers = { tier1: 0, tier2: 0, tier34: 0, tier5: 0 };
  for (const row of products) {
    tiers.tier1 += Number(row.tier1 || 0);
    tiers.tier2 += Number(row.tier2 || 0);
    tiers.tier34 += Number(row.tier34 || 0);
    tiers.tier5 += Number(row.tier5 || 0);
  }
  const discounts = Number(
    orders
      .reduce((sum, order) => sum + getOrderSheetsDiscountTotalZl(order), 0)
      .toFixed(2)
  );
  return {
    orders: orders.length,
    products: products.length,
    tiers,
    soldUnits:
      tiers.tier1 + tiers.tier2 + tiers.tier34 + tiers.tier5,
    discounts,
    productSample: products.slice(0, 8).map((p) => ({
      model: p.model,
      sold: p.sold,
      tier1: p.tier1,
      tier2: p.tier2,
      tier34: p.tier34,
      tier5: p.tier5,
    })),
  };
}

function diffTiers(mongo, sheet) {
  const keys = ["tier1", "tier2", "tier34", "tier5"];
  const delta = {};
  let match = true;
  for (const k of keys) {
    delta[k] = Number(mongo.tiers[k] || 0) - Number(sheet.tiers[k] || 0);
    if (delta[k] !== 0) match = false;
  }
  const discDelta =
    Number(mongo.discounts || 0) - Number(sheet.discounts || 0);
  if (Math.abs(discDelta) > 0.009) match = false;
  return { match, delta, discDelta };
}

await mongoose.connect(process.env.MONGODB_URI);
const point = await resolveStatsScriptPointMeta(PickupPoint, POINT);
if (!point) {
  console.error("Point not found:", POINT);
  process.exit(1);
}

const rows = await readSheetValues(
  spreadsheetId,
  `${escapeSheetTitle(tabTitle)}!A1:ZZ120`
);

console.log({
  spreadsheet: spreadsheetId,
  tabTitle,
  sheetRows: rows?.length || 0,
  point: point.title,
  daysChecked: days,
});

const summary = [];

for (const dayKey of days) {
  const dayHeader = warsawDayKeyToReportHeader(dayKey);
  const anchor = new Date(`${dayKey}T12:00:00.000Z`);
  const ordersSince = new Date(anchor.getTime() - 10 * 24 * 60 * 60 * 1000);

  const dayOrders = await loadStatsDayOrders({
    Order,
    PickupPoint,
    pointKey: POINT,
    dayKey,
    ordersSince,
    projection: STATS_ORDER_LIST_PROJECTION,
    buildStatsOrdersMongoFilter,
    orderBelongsToStatsDay,
    getOrderPointMatch,
  });

  const mongo = mongoDayTotals(dayOrders || []);
  const sheet = sumSheetDayBlock(rows, dayHeader);
  const { match, delta, discDelta } = sheet.ok
    ? diffTiers(mongo, sheet)
    : { match: false, delta: {}, discDelta: 0 };

  const row = {
    dayKey,
    dayHeader,
    mongoOrders: mongo.orders,
    sheetBlock: sheet.ok ? `col ${sheet.blockStart}` : sheet.reason,
    mongoSold: mongo.soldUnits,
    sheetSold: sheet.ok ? sheet.soldUnits : null,
    mongoDiscounts: mongo.discounts,
    sheetDiscounts: sheet.ok ? sheet.discounts : null,
    match,
    tierDelta: delta,
    discDelta,
  };
  summary.push(row);
  console.log("\n---", dayKey, "---");
  console.log(JSON.stringify(row, null, 2));
  if (!match && mongo.orders > 0) {
    console.log("mongo products sample:", mongo.productSample);
  }
}

const mismatches = summary.filter((r) => !r.match);
console.log("\n======== SUMMARY ========");
console.log(
  mismatches.length
    ? `Розбіжності: ${mismatches.length} з ${summary.length} днів`
    : `OK: ${summary.length} днів збігаються (tiers + СКИДКИ)`
);
if (mismatches.length) {
  for (const m of mismatches) {
    console.log(
      `- ${m.dayKey}: orders=${m.mongoOrders} mongoSold=${m.mongoSold} sheetSold=${m.sheetSold} discΔ=${m.discDelta}`,
      m.tierDelta
    );
  }
}

await mongoose.disconnect();
