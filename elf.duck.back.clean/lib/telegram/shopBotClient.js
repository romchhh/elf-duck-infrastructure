/**
 * Multi-shop-bot Telegram delivery: pick the bot the client opened, fallback across tokens.
 */
export function createShopBotClient({
  getActiveUserBots,
  User,
  verifyTelegramWebAppInitData,
  getTelegramBotTokens,
}) {
  function resolveShopBotIndexFromToken(botToken) {
    const token = String(botToken || "").trim();
    if (!token) return 0;
    const tokens = getTelegramBotTokens();
    const idx = tokens.indexOf(token);
    return idx >= 0 ? idx : 0;
  }

  function getShopBotByIndex(index) {
    const bots = getActiveUserBots();
    if (!bots.length) return null;
    const idx = Number(index);
    if (Number.isFinite(idx) && idx >= 0 && idx < bots.length) {
      return bots[idx];
    }
    return bots[0];
  }

  async function resolveShopBotIndexForTelegramId(telegramId) {
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

  function resolveShopBotIndexFromRequest(req) {
    const verified = verifyTelegramWebAppInitData(
      req.headers?.["x-telegram-init-data"]
    );
    if (verified?.botToken) {
      return resolveShopBotIndexFromToken(verified.botToken);
    }
    return null;
  }

  async function resolveShopBotIndexForOrder(order, req = null) {
    const fromOrder = Number(order?.shopBotIndex);
    const bots = getActiveUserBots();
    if (
      Number.isFinite(fromOrder) &&
      fromOrder >= 0 &&
      fromOrder < bots.length &&
      order?.shopBotIndex != null
    ) {
      return fromOrder;
    }

    const fromReq = req ? resolveShopBotIndexFromRequest(req) : null;
    if (fromReq != null && fromReq >= 0 && fromReq < bots.length) {
      return fromReq;
    }

    return resolveShopBotIndexForTelegramId(order?.userTelegramId);
  }

  async function getShopBotForTelegramId(telegramId) {
    const idx = await resolveShopBotIndexForTelegramId(telegramId);
    return getShopBotByIndex(idx);
  }

  async function persistShopBotIndexFromInitData(req, telegramId) {
    const id = String(telegramId || "").trim();
    if (!id || id.startsWith("guest_")) return;

    const verified = verifyTelegramWebAppInitData(
      req.headers?.["x-telegram-init-data"]
    );
    const token = String(verified?.botToken || "").trim();
    if (!token) return;

    const shopBotIndex = resolveShopBotIndexFromToken(token);
    await User.updateOne(
      { telegramId: id },
      { $set: { shopBotIndex, shopBotKnown: true } }
    ).catch(() => {});
  }

  function isUserChatUnavailableTelegramError(e) {
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

  async function sendViaUserShopBot(telegramId, sendFn, options = {}) {
    const id = String(telegramId || "").trim();
    if (!id) {
      throw new Error("NO_TELEGRAM_ID");
    }

    const bots = getActiveUserBots();
    if (!bots.length) {
      throw new Error("NO_USER_BOT");
    }

    const overrideIndex = Number(options.preferredBotIndex);
    const preferredIndex =
      Number.isFinite(overrideIndex) &&
      overrideIndex >= 0 &&
      overrideIndex < bots.length
        ? overrideIndex
        : await resolveShopBotIndexForTelegramId(id);
    const tryOrder = [
      preferredIndex,
      ...bots.map((_, i) => i).filter((i) => i !== preferredIndex),
    ];

    let lastError = null;

    for (const idx of tryOrder) {
      const activeBot = getShopBotByIndex(idx);
      if (!activeBot) continue;

      try {
        const result = await sendFn(activeBot);
        if (idx !== preferredIndex) {
          await User.updateOne(
            { telegramId: id },
            { $set: { shopBotIndex: idx } }
          ).catch(() => {});
        }
        return { result, botIndex: idx };
      } catch (e) {
        lastError = e;
        if (!isUserChatUnavailableTelegramError(e)) {
          throw e;
        }
      }
    }

    throw lastError || new Error("SEND_FAILED");
  }

  function getShopBotSendOptions(context = {}) {
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

  async function sendClientTelegramMessage(
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

  async function sendClientTelegramPhoto(
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

  return {
    resolveShopBotIndexFromToken,
    getShopBotByIndex,
    resolveShopBotIndexForTelegramId,
    resolveShopBotIndexFromRequest,
    resolveShopBotIndexForOrder,
    getShopBotForTelegramId,
    persistShopBotIndexFromInitData,
    sendClientTelegramMessage,
    sendClientTelegramPhoto,
  };
}
