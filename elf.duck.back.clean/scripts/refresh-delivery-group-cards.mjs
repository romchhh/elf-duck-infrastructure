/**
 * Кур'єрська доставка: прибрати картки в Telegram-групі (за збереженим message id) і
 * надіслати знову від @elfduck_store_bot у порядку createdAt.
 *
 * Замовлення в Mongo НЕ видаляються — лише повідомлення в групі + нові картки.
 *
 * ID повідомлення зберігається в order.payment.managerMessageChatId / managerMessageId
 * (і дублікати полів на корені order).
 *
 * docker compose exec api node scripts/refresh-delivery-group-cards.mjs --dry-run
 * docker compose exec api node scripts/refresh-delivery-group-cards.mjs --day 2026-11-04 --skip-delivered --apply
 * docker compose exec api node scripts/refresh-delivery-group-cards.mjs --skip-order ED-XXXXXX --apply
 * docker compose exec api node scripts/refresh-delivery-group-cards.mjs --extra-msg -1003271120190:2091,-1003271120190:2077 --apply
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { Telegraf } from "telegraf";
import mongoose from "mongoose";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(backendRoot, "..");
dotenv.config({ path: path.join(backendRoot, ".env") });
if (!process.env.MONGODB_URI) {
  dotenv.config({ path: path.join(repoRoot, ".env") });
}

import Order from "../models/Order.js";
import { bindApiGlobals } from "../routes/api/bindApiGlobals.js";
import { setUserBots, refreshPrimaryShopBot } from "../lib/server/botRegistry.js";
import {
  collectManagerTelegramMessageRefs,
  deleteGroupMessageWithAllShopBots,
  deleteOrderManagerTelegramCards,
} from "../lib/telegram/deleteGroupMessageWithShopBots.js";
import { getTelegramBotTokens } from "../lib/telegram/botTokens.js";
import { setShopBotUsername, getShopBotUsername } from "../lib/telegram/shopBotReferralLink.js";
import { getPrimaryShopBotIndex, getPrimaryShopBotUsername } from "../lib/telegram/shopBotPrimary.js";
import { getWarsawDayKey } from "../lib/server/helpers/orderStatsDay.js";

const args = process.argv.slice(2);
function arg(name) {
  const i = args.indexOf(name);
  return i >= 0 ? String(args[i + 1] || "").trim() : "";
}

const dryRun = args.includes("--dry-run");
const apply = args.includes("--apply");
const skipDelivered = args.includes("--skip-delivered");
const dayKey = arg("--day") || getWarsawDayKey(new Date());
const pauseMs = Number(arg("--pause-ms") || 1500) || 1500;

const skipOrderNos = new Set();
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === "--skip-order" && args[i + 1]) {
    skipOrderNos.add(String(args[i + 1]).replace(/^#/, "").toUpperCase());
  }
}

if (!dryRun && !apply) {
  console.error(
    "Укажите --dry-run (план) или --apply (удалить сохранённые TG-сообщения + repost).\n" +
      "Пример:\n" +
      "  node scripts/refresh-delivery-group-cards.mjs --dry-run\n" +
      "  node scripts/refresh-delivery-group-cards.mjs --day 2026-11-04 --skip-delivered --apply"
  );
  process.exit(1);
}

function parseExtraMessageRefs(raw) {
  return String(raw || "")
    .split(/[,;\n]+/)
    .map((chunk) => String(chunk || "").trim())
    .filter(Boolean)
    .map((chunk) => {
      const [chatId, messageId] = chunk.split(":");
      return {
        chatId: String(chatId || "").trim(),
        messageId: Number(String(messageId || "").trim()),
      };
    })
    .filter(
      (ref) =>
        ref.chatId &&
        Number.isFinite(ref.messageId) &&
        ref.messageId > 0
    );
}

const extraDeleteRefs = parseExtraMessageRefs(arg("--extra-msg"));

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const tokens = getTelegramBotTokens();
if (!tokens.length && apply) {
  console.error("TELEGRAM_BOT_TOKEN(S) missing");
  process.exit(1);
}

let allBots = [];
if (apply) {
  allBots = tokens.map((token) => new Telegraf(token));
  setUserBots(allBots);
  await Promise.all(
    allBots.map(async (instance, botIndex) => {
      try {
        const me = await instance.telegram.getMe();
        setShopBotUsername(botIndex, me?.username);
      } catch (error) {
        console.warn("[refresh-delivery] getMe failed", botIndex, error?.message || error);
      }
    })
  );
  refreshPrimaryShopBot();
  bindApiGlobals();
  console.log(
    "shop bots for delete:",
    allBots.map((_, i) => `@${String(getShopBotUsername(i) || i).replace(/^@/, "")}`)
  );
}

await mongoose.connect(process.env.MONGODB_URI);

const since = new Date(`${dayKey}T00:00:00.000Z`);
since.setUTCDate(since.getUTCDate() - 1);

const candidates = await Order.find({
  deliveryType: "delivery",
  deliveryMethod: "courier",
  status: { $nin: ["canceled", "annulled"] },
  createdAt: { $gte: since },
})
  .select({
    orderNo: 1,
    status: 1,
    createdAt: 1,
    payment: 1,
    managerMessageChatId: 1,
    managerMessageId: 1,
  })
  .sort({ createdAt: 1 })
  .lean();

const orders = candidates.filter(
  (o) => getWarsawDayKey(o.createdAt) === dayKey
);

const plan = [];
for (const order of orders) {
  const no = String(order.orderNo || "").toUpperCase();
  if (skipOrderNos.has(no)) {
    plan.push({ order, action: "skip-explicit" });
    continue;
  }
  if (skipDelivered && ["completed", "done"].includes(String(order.status || "").toLowerCase())) {
    plan.push({ order, action: "skip-delivered" });
    continue;
  }
  plan.push({ order, action: apply ? "refresh" : "would-refresh" });
}

console.log({
  mode: dryRun ? "dry-run" : "apply",
  dayKey,
  skipDelivered,
  skipOrderNos: [...skipOrderNos],
  primaryBot: apply ? `@${getPrimaryShopBotUsername()}` : undefined,
  primaryIndex: apply ? getPrimaryShopBotIndex() : undefined,
  totalTodayCourier: orders.length,
  toRefresh: plan.filter((p) => p.action.includes("refresh")).length,
});

for (let i = 0; i < plan.length; i += 1) {
  const { order, action } = plan[i];
  const refs = collectManagerTelegramMessageRefs(order);
  console.log(
    `${i + 1}. #${order.orderNo} ${order.status} created=${order.createdAt?.toISOString?.() || order.createdAt} → ${action}`,
    refs.length
      ? refs.map((r) => `tg chat=${r.chatId} msg=${r.messageId}`).join("; ")
      : "no tg id in mongo"
  );
}

if (dryRun) {
  console.log(
    "\nДублікаты старых repost в группе Mongo не знает — только последний message id. Лишние сообщения удалите вручную в группе.\n" +
      "Запуск: --skip-delivered (оставить доставленные) + --apply"
  );
  await mongoose.disconnect();
  process.exit(0);
}

const { repostManagerOrderToGroup } = await import("../lib/server/helpers/chunk11.js");

if (extraDeleteRefs.length) {
  console.log("\nExtra delete refs (--extra-msg):");
  for (const ref of extraDeleteRefs) {
    const result = await deleteGroupMessageWithAllShopBots(
      ref.chatId,
      ref.messageId
    );
    console.log(result);
  }
}

for (const row of plan) {
  if (!row.action.includes("refresh")) continue;

  const label = String(row.order.orderNo || "");
  console.log("\n---", label, "---");

  try {
    const fresh = await Order.findById(row.order._id);
    const result = await repostManagerOrderToGroup(fresh);
    console.log("repost", result);
  } catch (error) {
    console.error(
      "repost FAILED",
      error?.response?.description || error?.message || error
    );
  }

  await sleep(pauseMs);
}

await mongoose.disconnect();
console.log("\nDone.");
