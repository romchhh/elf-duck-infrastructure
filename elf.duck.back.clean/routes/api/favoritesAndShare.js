import { getServerContext } from "../../lib/server/context.js";

export function registerRoutes(app) {
  Object.assign(globalThis, getServerContext());

// ==== Public: get favorites by telegramId ====
app.get("/favorites", async (req, res) => {
  try {
    const telegramId = requireTrustedTelegramId(req, res);
    if (!telegramId) return;
    // if (!telegramId) {
    //   return res.status(400).json({ ok: false, error: "telegramId is required" });
    // }

    const user = await User.findOne({ telegramId }, { favoriteProductKeys: 1 }).lean();

    return res.json({
      ok: true,
      favoriteProductKeys: Array.isArray(user?.favoriteProductKeys)
        ? user.favoriteProductKeys
        : [],
    });
  } catch (e) {
    console.error("GET /favorites error:", e);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// ===== Public: toggle favorite product =====
app.post("/favorites/toggle", async (req, res) => {
  try {
    const telegramId = requireTrustedTelegramId(req, res);
    if (!telegramId) return;
    const productKey = String(req.body?.productKey || "").trim();

    if (!telegramId) {
      return res.status(400).json({ ok: false, error: "telegramId is required" });
    }

    if (!productKey) {
      return res.status(400).json({ ok: false, error: "productKey is required" });
    }

    const user = await User.findOne({ telegramId });
    if (!user) {
      return res.status(404).json({ ok: false, error: "User not found" });
    }

    const current = Array.isArray(user.favoriteProductKeys)
      ? user.favoriteProductKeys.map((x) => String(x))
      : [];

    const exists = current.includes(productKey);

    if (exists) {
      user.favoriteProductKeys = current.filter((x) => x !== productKey);
    } else {
      user.favoriteProductKeys = [...current, productKey];
    }

    await user.save();

    return res.json({
      ok: true,
      isFavorite: !exists,
      favoriteProductKeys: user.favoriteProductKeys || [],
    });
  } catch (e) {
    console.error("POST /favorites/toggle error:", e);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// ===== Telegram prepared share (rich preview like “via @bot”) =====
app.post("/tg/prepared-referral-message", async (req, res) => {
  try {
    const trustedTelegramId = requireTrustedTelegramId(req, res);
    if (!trustedTelegramId) return;

    const b = req.body || {};

    const code = String(
      b.refCode ||
        b.referralCode ||
        b.code ||
        ""
    ).trim();

    if (!code) {
      return res.status(400).json({
        ok: false,
        error: "REF_CODE_REQUIRED",
        message: "refCode is required",
      });
    }

    const userId = Number(trustedTelegramId);

    if (!userId || Number.isNaN(userId)) {
      return res.status(401).json({
        ok: false,
        error: "INVALID_TELEGRAM_INIT_DATA",
        message: "Telegram initData is required",
      });
    }

    const ownerUser = await User.findOne(
      { telegramId: String(trustedTelegramId) },
      { telegramId: 1, shopBotIndex: 1, shopBotKnown: 1 }
    ).lean();

    await persistShopBotIndexFromInitData(req, trustedTelegramId);

    const shopBotIndex = await resolveShopBotIndexForReferral(
      req,
      ownerUser || { telegramId: trustedTelegramId }
    );

    const shareBot = getShopBotByIndex(shopBotIndex) || bot;

    if (!shareBot) {
      return res.status(500).json({
        ok: false,
        error: "Bot disabled (no TELEGRAM_BOT_TOKEN)",
      });
    }

    const deepLink = buildReferralMiniAppDeepLink(code, shopBotIndex);
    const startParam = `ref_${String(code).replace(/^ref_/, "").trim()}`;

    // Твой баннер/картинка для карточки
    const photo = "https://blush-impressive-moth-462.mypinata.cloud/ipfs/bafybeifdnnsv4ddcjyorb3xrf6fvzi4yyqizuhhpomv7aew4j7oodfsg3q";

    const caption =
      `🦆 ELF DUCK\n\n` +
      `💸 Залетай по моей ссылке и получи 10% скидки на заказ!`;

    // Уникальный id для inline-result (обязателен)
    const resultId = crypto
      .createHash("sha256")
      .update(`${userId}|${startParam}|${photo}`)
      .digest("hex")
      .slice(0, 32);

    // InlineQueryResultPhoto
    const result = {
      type: "photo",
      id: resultId,
      photo_url: photo,
      thumbnail_url: photo,
      caption,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "Получить бонус",
              url: deepLink,
            },
          ],
        ],
      },
    };

    // Create a PreparedInlineMessage for WebApp.shareMessage()
    const prepared = await shareBot.telegram.callApi("savePreparedInlineMessage", {
      user_id: userId,
      result,
      // важно: нужно разрешить хотя бы один тип чатов, иначе будет ошибка
      allow_user_chats: true,
      allow_group_chats: true,
      allow_channel_chats: true,
      allow_bot_chats: true,
    });

    return res.json({ ok: true, id: prepared?.id });
  } catch (e) {
    console.error("/tg/prepared-referral-message error:", e);
    const tgDesc = e?.response?.description || e?.description || e?.message;
    return res.status(500).json({ ok: false, error: tgDesc || "Server error" });
  }
});

}
