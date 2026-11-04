/**
 * Повторно надіслати картки замовлень у групи точок (нове повідомлення від primary shop-бота).
 *
 * docker compose exec api node scripts/repost-manager-orders.mjs ED-GNDF8E ED-P2BMUR ED-92DPV4 ED-LJXR29
 * docker compose exec api node scripts/repost-manager-orders.mjs --dry-run ED-GNDF8E
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

import { bindApiGlobals } from "../routes/api/bindApiGlobals.js";
import { setUserBots, refreshPrimaryShopBot } from "../lib/server/botRegistry.js";
import { getTelegramBotTokens } from "../lib/telegram/botTokens.js";
import { setShopBotUsername } from "../lib/telegram/shopBotReferralLink.js";
import { getPrimaryShopBotIndex, getPrimaryShopBotUsername } from "../lib/telegram/shopBotPrimary.js";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const orderNos = args.filter((a) => !a.startsWith("--"));

if (!orderNos.length) {
  console.error(
    "Usage: node scripts/repost-manager-orders.mjs [--dry-run] ED-XXXXXX [ED-YYYYYY ...]"
  );
  process.exit(1);
}

const tokens = getTelegramBotTokens();
if (!tokens.length) {
  console.error("TELEGRAM_BOT_TOKEN(S) missing");
  process.exit(1);
}

const botInstances = tokens.map((token) => new Telegraf(token));
setUserBots(botInstances);

await Promise.all(
  botInstances.map(async (instance, botIndex) => {
    try {
      const me = await instance.telegram.getMe();
      setShopBotUsername(botIndex, me?.username);
    } catch (error) {
      console.warn("[repost] getMe failed", botIndex, error?.message || error);
    }
  })
);
refreshPrimaryShopBot();

bindApiGlobals();

const { repostManagerOrderToGroup } = await import("../lib/server/helpers/chunk11.js");

console.log({
  dryRun,
  orders: orderNos,
  primaryIndex: getPrimaryShopBotIndex(),
  primaryBot: `@${getPrimaryShopBotUsername()}`,
});

await mongoose.connect(process.env.MONGODB_URI);

for (const ref of orderNos) {
  const key = String(ref || "").replace(/^#/, "").trim();
  if (!key) continue;

  if (dryRun) {
    const Order = (await import("../models/Order.js")).default;
    const order = await Order.findOne({
      orderNo: new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
    }).lean();
    console.log("[dry-run]", key, order ? { id: order._id, status: order.status, payment: order.payment?.status } : "NOT_FOUND");
    continue;
  }

  try {
    const result = await repostManagerOrderToGroup(key);
    console.log(key, result);
  } catch (error) {
    console.error(
      key,
      "FAILED",
      error?.response?.description || error?.message || error
    );
  }
}

await mongoose.disconnect();
