import User from "../../models/User.js";
import { getTelegramBotTokens } from "./botTokens.js";
import { bot, userBots } from "../server/botRegistry.js";
import { getPrimaryShopBotIndex } from "./shopBotPrimary.js";

export function getActiveUserBots() {
  if (userBots.length) return userBots;
  return bot ? [bot] : [];
}

export function getShopBotByIndex(index) {
  const bots = getActiveUserBots();
  if (!bots.length) return null;
  const idx = Number(index);
  if (Number.isFinite(idx) && idx >= 0 && idx < bots.length) {
    return bots[idx];
  }
  return bots[0];
}

/** Лише primary (@elfduck_store_bot) — для клієнтських повідомлень. */
export function getClientDeliveryBots() {
  const bots = getActiveUserBots();
  if (!bots.length) return [];
  const primary = getShopBotByIndex(getPrimaryShopBotIndex());
  return primary ? [primary] : [bots[0]];
}

export async function resolveShopBotIndexForTelegramId(_telegramId) {
  return getPrimaryShopBotIndex();
}

export function isUserChatUnavailableTelegramError(e) {
  const errorCode = Number(e?.response?.error_code || 0);
  const description = String(
    e?.response?.description || e?.description || e?.message || ""
  );

  return (
    (errorCode === 400 && /chat not found/i.test(description)) ||
    (errorCode === 403 &&
      (/bot was blocked by the user/i.test(description) ||
        /user is deactivated/i.test(description))) ||
    (errorCode === 400 && /user not found/i.test(description))
  );
}

/**
 * Відправка клієнту лише через primary shop-бот (@elfduck_store_bot).
 */
export async function sendViaUserShopBot(telegramId, sendFn, options = {}) {
  const id = String(telegramId || "").trim();
  if (!id) {
    throw new Error("NO_TELEGRAM_ID");
  }

  const bots = getActiveUserBots();
  if (!bots.length) {
    throw new Error("NO_USER_BOT");
  }

  const preferredIndex = getPrimaryShopBotIndex();
  const activeBot = getShopBotByIndex(preferredIndex) || bots[0];
  const botIndex = getShopBotByIndex(preferredIndex) ? preferredIndex : 0;

  if (!activeBot) {
    throw new Error("NO_USER_BOT");
  }

  void options;

  try {
    const result = await sendFn(activeBot);
    await User.updateOne(
      { telegramId: id },
      { $set: { shopBotIndex: botIndex, shopBotKnown: true } }
    ).catch(() => {});

    return {
      result,
      botIndex,
      deliveredViaBots: 1,
    };
  } catch (e) {
    if (!isUserChatUnavailableTelegramError(e)) {
      console.error(
        `[bot][${botIndex}] client delivery failed`,
        id,
        e?.response?.description || e?.message || e
      );
    }
    throw e;
  }
}

export function getShopBotSendOptions(_context = {}) {
  return { preferredBotIndex: getPrimaryShopBotIndex() };
}

export async function sendClientTelegramMessage(
  telegramId,
  text,
  extra = {},
  context = {}
) {
  const id = String(telegramId || "").trim();
  if (!id || !getActiveUserBots().length) {
    return null;
  }

  return sendViaUserShopBot(
    id,
    (clientBot) => clientBot.telegram.sendMessage(id, text, extra),
    getShopBotSendOptions(context)
  );
}

export async function sendClientTelegramPhoto(
  telegramId,
  photo,
  extra = {},
  context = {}
) {
  const id = String(telegramId || "").trim();
  if (!id || !getActiveUserBots().length) {
    return null;
  }

  return sendViaUserShopBot(
    id,
    (clientBot) => clientBot.telegram.sendPhoto(id, photo, extra),
    getShopBotSendOptions(context)
  );
}

export function resolveShopBotIndexFromToken(botToken) {
  const token = String(botToken || "").trim();
  if (!token) return 0;
  const tokens = getTelegramBotTokens();
  const idx = tokens.indexOf(token);
  return idx >= 0 ? idx : 0;
}
