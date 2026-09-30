import { getServerContext } from "../../lib/server/context.js";

export function registerRoutes(app) {
  Object.assign(globalThis, getServerContext());

app.post("/admin/courier/customer-message", requireAdmin, async (req, res) => {
  try {
    const pickupPointId = String(req.body?.pickupPointId || "").trim();
    const targetRaw = String(
      req.body?.target || req.body?.telegramId || req.body?.username || ""
    ).trim();
    const textRaw = String(req.body?.text || "").trim();
    const photoUrl = String(req.body?.photoUrl || "").trim();
    const managerTelegramId = String(req.body?.managerTelegramId || "").trim();
    const managerUsernameRaw = String(req.body?.managerUsername || "")
      .trim()
      .replace(/^@+/, "");

    if (!bot) {
      return res.status(500).json({ ok: false, error: "BOT_NOT_AVAILABLE" });
    }

    if (!pickupPointId) {
      return res.status(400).json({ ok: false, error: "PICKUP_POINT_ID_REQUIRED" });
    }

    const normalizedTarget = targetRaw.replace(/^@+/, "").trim();
    const isTelegramIdTarget = /^\d+$/.test(normalizedTarget);
    const username = isTelegramIdTarget ? "" : normalizedTarget.toLowerCase();

    if (!normalizedTarget) {
      return res.status(400).json({ ok: false, error: "TARGET_REQUIRED" });
    }

    if (!isTelegramIdTarget && !/^[a-zA-Z0-9_]{5,32}$/.test(username)) {
      return res.status(400).json({ ok: false, error: "INVALID_USERNAME_OR_TELEGRAM_ID" });
    }

    if (!textRaw) {
      return res.status(400).json({ ok: false, error: "TEXT_REQUIRED" });
    }

    // if (!managerUsernameRaw) {
    //   return res.status(400).json({ ok: false, error: "MANAGER_USERNAME_REQUIRED" });
    // }

    const managerUsername = managerUsernameRaw || "elfduck_shop_bot";

    const pickupPoint = await PickupPoint.findById(
      pickupPointId,
      { _id: 1, key: 1, title: 1, allowedAdminTelegramIds: 1 }
    ).lean();

    if (!pickupPoint) {
      return res.status(404).json({ ok: false, error: "PICKUP_POINT_NOT_FOUND" });
    }

    // const pointKey = normalizePickupPointKey(pickupPoint?.key || "");
    // if (pointKey !== "delivery") {
    //   return res.status(403).json({ ok: false, error: "ONLY_COURIER_POINT_ALLOWED" });
    // }

    // if (!isServerAdminTelegramId(managerTelegramId) && !isServerSuperAdminTelegramId(managerTelegramId)) {
    //   return res.status(403).json({ ok: false, error: "FORBIDDEN_FOR_THIS_MANAGER" });
    // }

    function isServerAdminTelegramId(telegramId) {

      const safeTelegramId = String(telegramId || "").trim();

      if (!safeTelegramId) return false;

      return String(process.env.ADMIN_IDS || "")

        .split(",")

        .map((x) => String(x || "").trim())

        .filter(Boolean)

        .includes(safeTelegramId);

    }

    const user = await User.findOne(

      isTelegramIdTarget

        ? { telegramId: normalizedTarget }

        : { username },

      { telegramId: 1, username: 1, firstName: 1 }

    ).lean();

    if (!user?.telegramId) {
      return res.status(404).json({ ok: false, error: "USER_NOT_FOUND" });
    }

    const buttonText = "Связаться";
    const managerUsernameSafe = String(managerUsername || "")
      .trim()
      .replace(/^@+/, "");

    const managerUrl = managerUsernameSafe
      ? `https://t.me/${managerUsernameSafe}`
      : "https://t.me/elfduck_shop_bot";
    const safeText = escapeHtml(textRaw);
    const replyMarkup = {
      inline_keyboard: [[{ text: buttonText, url: managerUrl }]],
    };

    if (photoUrl) {
      await sendClientTelegramPhoto(
        user.telegramId,
        { url: photoUrl },
        {
          caption: safeText.slice(0, 1024),
          parse_mode: "HTML",
          reply_markup: replyMarkup,
        },
        { user }
      );
    } else {
      await sendClientTelegramMessage(
        user.telegramId,
        safeText,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true,
          reply_markup: replyMarkup,
        },
        { user }
      );
    }

    return res.json({

      ok: true,

      sentToTelegramId: String(user.telegramId || ""),

      sentToUsername: String(user.username || username || ""),

      managerUsername,

    });
  } catch (e) {
    console.error("POST /admin/courier/customer-message error:", e);
    return res.status(500).json({ ok: false, error: e.message || "SERVER_ERROR" });
  }
});
}
