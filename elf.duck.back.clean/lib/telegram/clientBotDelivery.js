import User from "../../models/User.js";
import { getTelegramBotTokens } from "./botTokens.js";
import { bot, userBots } from "../server/botRegistry.js";

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

export async function resolveShopBotIndexForTelegramId(telegramId) {
  const id = String(telegramId || "").trim();
  if (!id || id.startsWith("guest_")) return 0;

  const user = await User.findOne(
    { telegramId: id },
    { shopBotIndex: 1, shopBotKnown: 1 }
  ).lean();

  const bots = getActiveUserBots();
  const idx = Number(user?.shopBotIndex);

  if (
    user?.shopBotKnown &&
    Number.isFinite(idx) &&
    idx >= 0 &&
    idx < bots.length
  ) {
    return idx;
  }

  if (bots.length > 1) {
    return bots.length - 1;
  }

  return 0;
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
 * Відправка клієнту через усі shop-боти (TELEGRAM_BOT_TOKEN + _2).
 * Успіх — якщо доставлено хоча б одним ботом.
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

  const overrideIndex = Number(options.preferredBotIndex);
  let preferredIndex =
    Number.isFinite(overrideIndex) &&
    overrideIndex >= 0 &&
    overrideIndex < bots.length
      ? overrideIndex
      : await resolveShopBotIndexForTelegramId(id);

  const tryOrder = [
    preferredIndex,
    ...bots.map((_, i) => i).filter((i) => i !== preferredIndex),
  ];

  const successes = [];
  let lastUnavailable = null;
  let lastHardError = null;

  for (const idx of tryOrder) {
    const activeBot = getShopBotByIndex(idx);
    if (!activeBot) continue;

    try {
      const result = await sendFn(activeBot);
      successes.push({ result, botIndex: idx });
    } catch (e) {
      if (isUserChatUnavailableTelegramError(e)) {
        lastUnavailable = e;
        continue;
      }
      lastHardError = e;
      console.error(
        `[bot][${idx}] client delivery failed`,
        id,
        e?.response?.description || e?.message || e
      );
    }
  }

  if (!successes.length) {
    throw lastHardError || lastUnavailable || new Error("SEND_FAILED");
  }

  const primary =
    successes.find((item) => item.botIndex === preferredIndex) ||
    successes[0];

  if (primary.botIndex !== preferredIndex) {
    preferredIndex = primary.botIndex;
  }

  await User.updateOne(
    { telegramId: id },
    { $set: { shopBotIndex: preferredIndex, shopBotKnown: true } }
  ).catch(() => {});

  return {
    result: primary.result,
    botIndex: primary.botIndex,
    deliveredViaBots: successes.length,
  };
}

export function getShopBotSendOptions(context = {}) {
  const order = context?.order;
  const user = context?.user;

  if (order != null) {
    const idx = Number(order.shopBotIndex);
    if (Number.isFinite(idx) && idx >= 0) {
      return { preferredBotIndex: idx };
    }
  }

  if (user?.shopBotKnown) {
    const idx = Number(user.shopBotIndex);
    if (Number.isFinite(idx) && idx >= 0) {
      return { preferredBotIndex: idx };
    }
  }

  return {};
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
