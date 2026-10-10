/**
 * Відправити «СТАТИСТИКА ДНЯ» в Telegram-групу точки (не Google Sheets).
 *
 * Кур'єр:  --point delivery   (status completed — як у ТГ «Доставлен»)
 * InPost:   --point delivery-2 (status shipped + shippedAt)
 *
 * 1) Тест одному адміну (ADMIN_TEST_TELEGRAM_ID у .env або --to):
 *    docker compose exec api node scripts/send-daily-stats-telegram.mjs --point delivery --day 2026-10-09 --test --force
 *
 * 2) У групу точки (statsChatId у CRM):
 *    docker compose exec api node scripts/send-daily-stats-telegram.mjs --point delivery --day 2026-10-09 --force
 *
 * Діагностика порожнього звіту:
 *    docker compose exec api node scripts/audit-delivery-stats-day.mjs --point delivery --day 2026-10-09
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { Telegraf } from "telegraf";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(backendRoot, ".env") });

import mongoose from "mongoose";
import Order from "../models/Order.js";
import PickupPoint from "../models/PickupPoint.js";
import { setUserBots } from "../lib/server/botRegistry.js";
import { releaseDailyStatsDispatch } from "../lib/server/dailyStatsDedupe.js";
import {
  getOrderPointMatch,
  getPointStatsChatId,
} from "../lib/server/helpers/chunk08.js";
import {
  buildStatsOrdersMongoFilter,
  getOrderStatsFulfillmentKind,
  orderBelongsToStatsDay,
  shouldCountOrderInDailyStats,
  STATS_ORDER_LIST_PROJECTION,
} from "../lib/server/helpers/orderStatsDay.js";

const args = process.argv.slice(2);
function arg(name) {
  const i = args.indexOf(name);
  return i >= 0 ? String(args[i + 1] || "").trim() : "";
}

const pointKey = arg("--point");
const dayKey = arg("--day");
const force = args.includes("--force");
const diag = args.includes("--diag");
const testMode = args.includes("--test");
const TEST_TELEGRAM_USER_ID = String(
  process.env.ADMIN_TEST_TELEGRAM_ID || "7119952932"
).trim();
const toTelegramId = testMode
  ? TEST_TELEGRAM_USER_ID
  : arg("--to");

if (!pointKey || !/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
  console.error(
    "Usage: node scripts/send-daily-stats-telegram.mjs --point mokot-w --day YYYY-MM-DD [--force] [--test | --to <telegramId>]"
  );
  process.exit(1);
}

const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
if (!token) {
  console.error("TELEGRAM_BOT_TOKEN is missing");
  process.exit(1);
}

setUserBots([new Telegraf(token)]);

const { sendDailyPointStats } = await import("../lib/server/helpers/chunk10.js");

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

const groupChatId = getPointStatsChatId(point);
const sendChatId = toTelegramId || groupChatId;

console.log({
  point: point.key,
  dayKey,
  statsChatId: point.statsChatId || "(empty)",
  notificationChatId: point.notificationChatId || "(empty)",
  groupChatId: groupChatId || "(none)",
  sendChatId: sendChatId || "(none)",
  testMode,
  force,
});

if (!sendChatId) {
  console.error(
    "Немає куди слати: додай --test / --to <id> або statsChatId у точки в CRM"
  );
  process.exit(1);
}

const orders = await Order.find(
  buildStatsOrdersMongoFilter(getOrderPointMatch(point), ordersSince),
  STATS_ORDER_LIST_PROJECTION
).lean();

const dayOrders = orders.filter((o) => orderBelongsToStatsDay(o, dayKey));

console.log({ completedOrders: dayOrders.length });

if (diag || (dayOrders.length === 0 && ["delivery", "delivery-2"].includes(pointKey.toLowerCase()))) {
  const wide = await Order.find(
    {
      deliveryType: "delivery",
      deliveryMethod:
        pointKey.toLowerCase().replace(/,+$/, "") === "delivery-2"
          ? "inpost"
          : "courier",
      status: { $nin: ["canceled", "annulled"] },
      createdAt: { $gte: ordersSince },
    },
    STATS_ORDER_LIST_PROJECTION
  ).lean();

  const gaps = wide.filter((o) => !orderBelongsToStatsDay(o, dayKey));
  console.log("[diag] recent delivery orders not in this stats day:", gaps.length);
  for (const o of gaps.slice(0, 15)) {
    const kind = getOrderStatsFulfillmentKind(o);
    let hint = "";
    if (kind === "courier" && !["completed", "done"].includes(String(o.status || "").toLowerCase())) {
      hint = " → потрібен status completed";
    } else if (kind === "inpost") {
      if (String(o.status) !== "shipped" || !o.shippedAt) {
        hint = " → потрібен shipped + shippedAt";
      }
    }
    console.log(
      `  #${o.orderNo} status=${o.status} completed=${Boolean(o.completedAt)} delivered=${Boolean(o.deliveredAt)} shippedAt=${Boolean(o.shippedAt)} counts=${shouldCountOrderInDailyStats(o)}${hint}`
    );
  }
  if (diag && !testMode && !toTelegramId) {
    console.log("[diag] use --test or --to before sending if dayOrders=0");
  }
}

const dedupeKey = `${String(point._id)}:${dayKey}`;

if (force) {
  await releaseDailyStatsDispatch(dedupeKey);
}

const result = await sendDailyPointStats(point, dayOrders, dayKey, {
  productBasePriceMap: new Map(),
  referredFirstOrderUsers: new Set(),
  userDisplayMap: new Map(),
  telegramChatIdOverride: toTelegramId || undefined,
});

console.log(result);

if (!result?.ok) {
  process.exit(1);
}

await mongoose.disconnect();
