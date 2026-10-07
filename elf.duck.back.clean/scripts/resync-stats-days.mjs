/**
 * Перерахунок tiers + СКИДКИ в Google Sheets і (опційно) Telegram за діапазон днів.
 * Правила дня: orderStatsDay.js (кур'єр deliveredAt, InPost shippedAt, pickup completedAt).
 *
 * docker compose exec api node scripts/backfill-stats-anchors.mjs
 * docker compose exec api node scripts/resync-stats-days.mjs --from 2026-10-01 --to 2026-10-07
 * docker compose exec api node scripts/resync-stats-days.mjs --from 2026-10-07 --to 2026-10-07 --telegram --force-telegram
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
import PickupPoint from "../models/PickupPoint.js";
import {
  buildProductAggregates,
  sendDailyPointStatsToGoogleSheetsApi,
} from "../lib/googleSheets/dailyStatsSync.js";
import {
  DAILY_STATS_RESYNC_POINT_KEYS,
  loadStatsDayOrders,
  resolveStatsScriptPointMeta,
} from "../lib/googleSheets/statsScriptPoints.js";
import {
  buildStatsOrdersMongoFilter,
  getWarsawDayKey,
  orderBelongsToStatsDay,
  STATS_ORDER_LIST_PROJECTION,
} from "../lib/server/helpers/orderStatsDay.js";
import { getOrderPointMatch } from "../lib/server/helpers/chunk08.js";
import { releaseDailyStatsDispatch } from "../lib/server/dailyStatsDedupe.js";

const args = process.argv.slice(2);
function arg(name) {
  const i = args.indexOf(name);
  return i >= 0 ? String(args[i + 1] || "").trim() : "";
}

const fromKey = arg("--from");
const toKey = arg("--to") || fromKey;
const dryRun = args.includes("--dry-run");
const sendTelegram = args.includes("--telegram");
const forceTelegram = args.includes("--force-telegram");
const pointArg = arg("--point");

if (!/^\d{4}-\d{2}-\d{2}$/.test(fromKey) || !/^\d{4}-\d{2}-\d{2}$/.test(toKey)) {
  console.error(
    "Usage: node scripts/resync-stats-days.mjs --from YYYY-MM-DD --to YYYY-MM-DD [--point delivery] [--dry-run] [--telegram] [--force-telegram]"
  );
  process.exit(1);
}

function listDayKeys(from, to) {
  const out = [];
  const start = new Date(`${from}T12:00:00.000Z`);
  const end = new Date(`${to}T12:00:00.000Z`);
  for (let t = start.getTime(); t <= end.getTime(); t += 24 * 60 * 60 * 1000) {
    out.push(getWarsawDayKey(new Date(t)));
  }
  return out;
}

const pointKeys = pointArg
  ? [pointArg]
  : [...DAILY_STATS_RESYNC_POINT_KEYS];

await mongoose.connect(process.env.MONGODB_URI);

let sendDailyPointStats = null;
if (sendTelegram) {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!token) {
    console.error("TELEGRAM_BOT_TOKEN required for --telegram");
    process.exit(1);
  }
  const { Telegraf } = await import("telegraf");
  const { setUserBots } = await import("../lib/server/botRegistry.js");
  setUserBots([new Telegraf(token)]);
  sendDailyPointStats = (
    await import("../lib/server/helpers/chunk10.js")
  ).sendDailyPointStats;
}

const dayKeys = listDayKeys(fromKey, toKey);
console.log({ fromKey, toKey, dayKeys, pointKeys, dryRun, sendTelegram });

for (const pointKey of pointKeys) {
  const point = await resolveStatsScriptPointMeta(PickupPoint, pointKey);
  if (!point) {
    console.warn("skip unknown point:", pointKey);
    continue;
  }

  for (const dayKey of dayKeys) {
    const anchor = new Date(`${dayKey}T12:00:00.000Z`);
    const ordersSince = new Date(anchor.getTime() - 45 * 24 * 60 * 60 * 1000);

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

    console.log("\n---", pointKey, dayKey, "---", {
      orders: dayOrders?.length || 0,
      products: buildProductAggregates(dayOrders || []).length,
    });

    const sheetResult = await sendDailyPointStatsToGoogleSheetsApi(
      point,
      dayOrders || [],
      dayKey,
      { dryRun, skipMonthRollup: true }
    );
    console.log("sheets:", sheetResult?.ok, sheetResult?.reason || "");

    if (sendTelegram && !point.virtual && point._id) {
      const mongoPoint = await PickupPoint.findById(point._id).lean();
      const dedupeKey = `${String(point._id)}:${dayKey}`;
      if (forceTelegram) {
        await releaseDailyStatsDispatch(dedupeKey);
      }
      const sent = await sendDailyPointStats(
        mongoPoint || point,
        dayOrders || [],
        dayKey
      );
      console.log("telegram:", sent);
    }
  }
}

await mongoose.disconnect();
