/**
 * Дослати картки замовлень у групи точок, якщо payment.managerMessageId порожній.
 *
 * docker compose exec api node scripts/resend-missing-manager-orders.mjs --dry-run --point praga,r-dmie-cie --hours 24
 * docker compose exec api node scripts/resend-missing-manager-orders.mjs --point praga,r-dmie-cie --hours 24
 * docker compose exec api node scripts/resend-missing-manager-orders.mjs ED-U8SK8H ED-KURKMD
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import { Telegraf } from "telegraf";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(backendRoot, "..");
dotenv.config({ path: path.join(backendRoot, ".env") });
if (!process.env.MONGODB_URI) {
  dotenv.config({ path: path.join(repoRoot, ".env") });
}

import Order from "../models/Order.js";
import PickupPoint from "../models/PickupPoint.js";
import { bindApiGlobals } from "../routes/api/bindApiGlobals.js";
import { setUserBots, refreshPrimaryShopBot } from "../lib/server/botRegistry.js";
import { getTelegramBotTokens } from "../lib/telegram/botTokens.js";
import { setShopBotUsername } from "../lib/telegram/shopBotReferralLink.js";
import { getPrimaryShopBotIndex, getPrimaryShopBotUsername } from "../lib/telegram/shopBotPrimary.js";

const args = process.argv.slice(2);
function arg(name, fallback = "") {
  const i = args.indexOf(name);
  return i >= 0 ? String(args[i + 1] || "").trim() : fallback;
}

const dryRun = args.includes("--dry-run");
const pointKeys = arg("--point", "")
  .split(/[,;]+/)
  .map((s) => s.trim())
  .filter(Boolean);
const hours = Math.max(1, Number(arg("--hours", "48")) || 48);
const explicitNos = args.filter((a) => !a.startsWith("--") && !a.includes("="));

const SENDABLE_PAYMENT = new Set(["checking", "awaiting", "paid"]);

const tokens = getTelegramBotTokens();
if (!tokens.length && !dryRun) {
  console.error("TELEGRAM_BOT_TOKEN(S) missing");
  process.exit(1);
}

if (!dryRun) {
  const botInstances = tokens.map((token) => new Telegraf(token));
  setUserBots(botInstances);
  await Promise.all(
    botInstances.map(async (instance, botIndex) => {
      try {
        const me = await instance.telegram.getMe();
        setShopBotUsername(botIndex, me?.username);
      } catch (error) {
        console.warn("[resend-missing] getMe failed", botIndex, error?.message || error);
      }
    })
  );
  refreshPrimaryShopBot();
  bindApiGlobals();
}

const { sendOrderCreatedNotification } = await import("../lib/server/helpers/chunk11.js");

await mongoose.connect(process.env.MONGODB_URI);

const missingFilter = {
  $or: [
    { "payment.managerMessageId": { $exists: false } },
    { "payment.managerMessageId": null },
    { "payment.managerMessageId": "" },
    { "payment.managerMessageId": "__sending__" },
  ],
};

let orders = [];

if (explicitNos.length) {
  for (const ref of explicitNos) {
    const orderNo = String(ref || "").replace(/^#/, "").trim();
    const order = await Order.findOne({
      orderNo: new RegExp(`^${orderNo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
    });
    if (order) orders.push(order);
    else console.warn("NOT_FOUND", orderNo);
  }
} else {
  const since = new Date(Date.now() - hours * 3600 * 1000);
  const filter = {
    createdAt: { $gte: since },
    status: { $nin: ["canceled", "annulled"] },
    ...missingFilter,
  };

  if (pointKeys.length) {
    const points = await PickupPoint.find({ key: { $in: pointKeys } })
      .select("_id key notificationChatId")
      .lean();
    filter.pickupPointId = { $in: points.map((p) => p._id) };
    console.log(
      "points:",
      points.map((p) => ({ key: p.key, chat: p.notificationChatId }))
    );
  }

  orders = await Order.find(filter).sort({ createdAt: 1 });
}

console.log({
  dryRun,
  count: orders.length,
  hours,
  pointKeys,
  primaryBot: dryRun ? "n/a" : `@${getPrimaryShopBotUsername()}`,
  primaryIndex: dryRun ? "n/a" : getPrimaryShopBotIndex(),
});

let sent = 0;
let skipped = 0;
let failed = 0;

for (const order of orders) {
  const paymentStatus = String(order.payment?.status || "").trim().toLowerCase();
  const line = {
    orderNo: order.orderNo,
    status: order.status,
    payment: paymentStatus || "unpaid",
    totalZl: order.totalZl,
    managerMessageId: order.payment?.managerMessageId || "",
  };

  if (!SENDABLE_PAYMENT.has(paymentStatus)) {
    skipped += 1;
    console.log("skip", line);
    continue;
  }

  if (dryRun) {
    console.log("would-send", line);
    sent += 1;
    continue;
  }

  try {
    await sendOrderCreatedNotification(order.toObject(), {
      skipClientNotification: true,
    });
    const fresh = await Order.findById(order._id).lean();
    const messageId = String(fresh?.payment?.managerMessageId || "").trim();
    if (messageId && messageId !== "__sending__") {
      sent += 1;
      console.log("ok", line.orderNo, "messageId", messageId);
    } else {
      failed += 1;
      console.error("fail", line.orderNo, "no message id after send");
    }
  } catch (error) {
    failed += 1;
    console.error(
      "fail",
      line.orderNo,
      error?.response?.description || error?.message || error
    );
  }
}

console.log({ sent, skipped, failed });
await mongoose.disconnect();