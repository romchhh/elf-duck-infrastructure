import crypto from "crypto";
import { bindApiGlobals } from "./bindApiGlobals.js";

export function registerRoutes(app) {
  bindApiGlobals();

// ===== Public: pickup points =====
app.get("/pickup-points", async (req, res) => {
  try {
    const onlyActive = String(req.query.active || "1") === "1";
    const cacheKey = `pickup-points:${onlyActive ? "1" : "0"}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const filter = onlyActive ? { isActive: true } : {};
    const points = await PickupPoint.find(filter).sort({ sortOrder: 1, createdAt: -1 }).lean();
    const payload = { ok: true, pickupPoints: points };
    cacheSet(cacheKey, payload, 60 * 1000);
    res.json(payload);
  } catch (e) {
    console.error("GET /pickup-points error:", e);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

// ===== Admin: pickup points (CRUD) =====
app.post("/admin/pickup-points", requireAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    const rawTitle = String(b.title || "").trim();
    const rawAddress = String(b.address || "").trim();

    if (!rawTitle && !rawAddress) {
      return res.status(400).json({ ok: false, error: "title or address is required" });
    }

    const baseKey = b.key ? String(b.key) : translitRuToLat(rawTitle || rawAddress);
    const finalKey = await ensureUniquePickupPointKey(baseKey);

    const allowed = Array.isArray(b.allowedAdminTelegramIds)
      ? b.allowedAdminTelegramIds.map((x) => String(x)).filter(Boolean)
      : [];

    const notificationChatId = String(b.notificationChatId || "").trim();

    const statsChatId = String(b.statsChatId || "").trim();
    const statsSendTime = String(b.statsSendTime || "23:59").trim();
    const scheduleByDate =
      b.scheduleByDate && typeof b.scheduleByDate === "object"
        ? b.scheduleByDate
        : {};

    const created = await PickupPoint.create({
      key: finalKey,
      title: rawTitle,
      address: rawAddress,
      sortOrder: Number(b.sortOrder || 0),
      isActive: b.isActive ?? true,
      allowedAdminTelegramIds: allowed,
      notificationChatId,
      statsChatId,
      statsSendTime,
      scheduleByDate,
    });

    res.json({ ok: true, pickupPoint: created });
  } catch (e) {
    console.error("POST /admin/pickup-points error:", e);
    if (e?.code === 11000) return res.status(409).json({ ok: false, error: "Pickup point key already exists" });
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

app.get("/admin/users/export", requireAdmin, async (req, res) => {
  try {
    const actorTelegramId = String(
      req.headers["x-admin-telegram-id"] || ""
    ).trim();

    if (
      actorTelegramId &&
      !isServerSuperAdminTelegramId(actorTelegramId)
    ) {
      return res.status(403).json({
        ok: false,
        error: "SUPER_ADMIN_REQUIRED",
      });
    }

    const { buildUsersExportRows, sendUsersExportCsvResponse } =
      await import("./lib/usersExport.js");

    const rows = await buildUsersExportRows();
    return sendUsersExportCsvResponse(res, rows);
  } catch (e) {
    console.error("GET /admin/users/export error:", e);
    return res.status(500).json({
      ok: false,
      error: e.message || "SERVER_ERROR",
    });
  }
});

app.post("/admin/users/cashback/grant-by-username", async (req, res) => {
  try {
    const token = String(req.headers["x-admin-token"] || "").trim();
    if (!token || token !== process.env.ADMIN_API_TOKEN) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    const usernameRaw = String(req.body?.username || "").trim();
    const username = usernameRaw.replace(/^@+/, "").trim();
    const amountZl = Number(req.body?.amountZl || 0);
    // const note = String(req.body?.note || "").trim();
    const grantedByTelegramId = String(req.body?.grantedByTelegramId || "").trim();
    const grantedByUsername = String(req.body?.grantedByUsername || "").trim();

    if (!username) {
      return res.status(400).json({ ok: false, error: "USERNAME_REQUIRED" });
    }

    if (!(amountZl > 0)) {
      return res.status(400).json({ ok: false, error: "INVALID_CASHBACK_AMOUNT" });
    }

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ ok: false, error: "USER_NOT_FOUND" });
    }

    const result = await grantManualCashbackToUser(user, amountZl, {
      // note,
      grantedByTelegramId,
      grantedByUsername,
    });

    return res.json({
      ok: true,
      user: {
        telegramId: String(user.telegramId || ""),
        username: String(user.username || ""),
        firstName: String(user.firstName || ""),
      },
      cashbackBalance: Number(result.cashbackBalance || 0),
      grantedAmountZl: Number(result.grantedAmountZl || 0),
      expiresAt: result.expiresAt,
    });
  } catch (e) {
    console.error("POST /admin/users/cashback/grant-by-username error:", e);
    return res.status(500).json({ ok: false, error: e.message || "SERVER_ERROR" });
  }
});

const buildBroadcastUserFilter = async ({
  audienceType,
  segmentType,
  segmentValue,
  username,
}) => {
  const userFilter = {
    telegramId: { $exists: true, $ne: "" },
  };

  // Один пользователь по username
  if (audienceType === "username") {
    const safeUsername = String(username || "")
      .trim()
      .replace(/^@/, "");

    if (!safeUsername) {
      userFilter.telegramId = { $in: [] };

      return userFilter;
    }

    const escapedUsername = safeUsername.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

    userFilter.username = {
      $regex: `^${escapedUsername}$`,
      $options: "i",
    };

    return userFilter;
  }

  // Рассылка всем
  if (audienceType !== "segment") {
    return userFilter;
  }

  const orderFilter = {
    status: {
      $nin: ["canceled", "annulled"],
    },
  };

  // Покупатели определённой категории
  if (segmentType === "category") {
    const productIds = await Product.distinct("_id", {
      categoryKey: segmentValue,
    });

    if (!productIds.length) {
      userFilter.telegramId = { $in: [] };

      return userFilter;
    }

    orderFilter["items.productId"] = {
      $in: productIds,
    };
  }

  // Покупатели определённой точки самовывоза
  else if (segmentType === "pickupPoint") {
    orderFilter.deliveryType = "pickup";
    orderFilter.pickupPointId = segmentValue;
  }

  // Покупатели по способу получения
  else if (segmentType === "deliveryMethod") {
    if (segmentValue === "pickup") {
      orderFilter.deliveryType = "pickup";
    } else if (segmentValue === "courier") {
      orderFilter.deliveryType = "delivery";
      orderFilter.deliveryMethod = "courier";
    } else if (segmentValue === "inpost") {
      orderFilter.deliveryType = "delivery";
      orderFilter.deliveryMethod = "inpost";
    } else {
      userFilter.telegramId = { $in: [] };

      return userFilter;
    }
  } else {
    userFilter.telegramId = { $in: [] };

    return userFilter;
  }

  const telegramIds = (
    await Order.distinct(
      "userTelegramId",
      orderFilter
    )
  )
    .map((value) =>
      String(value || "").trim()
    )
    .filter(Boolean);

  userFilter.telegramId = {
    $in: telegramIds,
  };

  return userFilter;
};

app.post("/admin/users/broadcast-photo", async (req, res) => {
  try {
    const adminToken = String(req.headers["x-admin-token"] || "").trim();

    if (!adminToken || adminToken !== String(process.env.ADMIN_API_TOKEN || "").trim()) {
      return res.status(401).json({
        ok: false,
        error: "UNAUTHORIZED",
      });
    }

    if (!bot) {
      return res.status(500).json({
        ok: false,
        error: "BOT_DISABLED",
        message: "Telegram bot is disabled. Check TELEGRAM_BOT_TOKEN.",
      });
    }

    const dryRun = req.body?.dryRun !== false;
    const photoUrl = String(req.body?.photoUrl || "").trim();
    const text = String(req.body?.text || "").trim();
    const buttonText = String(req.body?.buttonText || "").trim();
    const buttonUrl = String(req.body?.buttonUrl || "").trim();
    const limit = Math.max(0, Number(req.body?.limit || 0));

    const audienceType = String(
      req.body?.audienceType || "all"
    ).trim();

    const segmentType = String(
      req.body?.segmentType || ""
    ).trim();

    const segmentValue = String(
      req.body?.segmentValue || ""
    ).trim();

    const username = String(
      req.body?.username || ""
    ).trim();


    if (!photoUrl) {
      return res.status(400).json({
        ok: false,
        error: "PHOTO_REQUIRED",
        message: "photoUrl is required",
      });
    }

    if (!text) {
      return res.status(400).json({
        ok: false,
        error: "TEXT_REQUIRED",
        message: "text is required",
      });
    }

    if (!buttonText) {
      return res.status(400).json({
        ok: false,
        error: "BUTTON_TEXT_REQUIRED",
        message: "buttonText is required",
      });
    }

    if (!buttonUrl) {
      return res.status(400).json({
        ok: false,
        error: "BUTTON_URL_REQUIRED",
        message: "buttonUrl is required",
      });
    }

    const userFilter =
      await buildBroadcastUserFilter({
        audienceType,
        segmentType,
        segmentValue,
        username,
      });

    const users = await User.find(
      userFilter,
      {
        telegramId: 1,
        username: 1,
        firstName: 1,
        shopBotIndex: 1,
        shopBotKnown: 1,
      }
    )
      .sort({ createdAt: 1 })
      .limit(limit > 0 ? limit : 0)
      .lean();

    const replyMarkup = {

      inline_keyboard: [

        [

          {

            text: buttonText,

            web_app: {

              url: buttonUrl,

            },

          },

        ],

      ],

    };

    const results = [];
    let sent = 0;
    let failed = 0;
    let blocked = 0;

    if (!dryRun) {
      for (const user of users) {
        const telegramId = String(user?.telegramId || "").trim();
        if (!telegramId) continue;

        try {
          await sendClientTelegramPhoto(
            telegramId,
            photoUrl,
            {
              caption: text,
              parse_mode: "HTML",
              reply_markup: replyMarkup,
            },
            { user }
          );

          sent += 1;
          results.push({ telegramId, ok: true });

          await new Promise((resolve) => setTimeout(resolve, 60));
        } catch (e) {
          failed += 1;

          const description = String(e?.response?.description || e?.message || e || "");

          const isBlocked =
            description.includes("bot was blocked") ||
            description.includes("user is deactivated") ||
            description.includes("chat not found") ||
            description.includes("Forbidden");

          if (isBlocked) blocked += 1;

          results.push({
            telegramId,
            ok: false,
            error: description,
          });
        }
      }
    }

    return res.json({
      ok: true,
      dryRun,
      totalUsers: users.length,
      sent,
      failed,
      blocked,
      preview: {

        audienceType,

        segmentType,

        segmentValue,

        username,

        photoUrl,

        text,

        buttonText,

        buttonUrl,

      },
      results: dryRun ? [] : results.slice(0, 200),
    });
  } catch (e) {
    console.error("admin photo broadcast error:", e);

    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
      message: String(e?.message || e),
    });
  }
});

app.post("/admin/users/broadcast-photo-async", async (req, res) => {
  try {
    const adminToken = String(req.headers["x-admin-token"] || "").trim();

    if (!adminToken || adminToken !== String(process.env.ADMIN_API_TOKEN || "").trim()) {
      return res.status(401).json({
        ok: false,
        error: "UNAUTHORIZED",
      });
    }

    if (!bot) {
      return res.status(500).json({
        ok: false,
        error: "BOT_DISABLED",
        message: "Telegram bot is disabled. Check TELEGRAM_BOT_TOKEN.",
      });
    }

    const photoUrl = String(req.body?.photoUrl || "").trim();
    const text = String(req.body?.text || "").trim();
    const buttonText = String(req.body?.buttonText || "").trim();
    const buttonUrl = String(req.body?.buttonUrl || "").trim();
    const limit = Math.max(0, Number(req.body?.limit || 0));

    const audienceType = String(
      req.body?.audienceType || "all"
    ).trim();

    const segmentType = String(
      req.body?.segmentType || ""
    ).trim();

    const segmentValue = String(
      req.body?.segmentValue || ""
    ).trim();

    const username = String(
      req.body?.username || ""
    ).trim();

    if (!photoUrl) {
      return res.status(400).json({ ok: false, error: "PHOTO_REQUIRED" });
    }

    if (!text) {
      return res.status(400).json({ ok: false, error: "TEXT_REQUIRED" });
    }

    if (!buttonText) {
      return res.status(400).json({ ok: false, error: "BUTTON_TEXT_REQUIRED" });
    }

    if (!buttonUrl) {
      return res.status(400).json({ ok: false, error: "BUTTON_URL_REQUIRED" });
    }

    const filter = {
      telegramId: { $exists: true, $ne: "" },
    };

    if (audienceType === "username") {
      filter.username = username;
    }

    if (audienceType === "segment") {
      switch (segmentType) {
        case "category":
          filter.lastOrderCategoryKey = segmentValue;
          break;

        case "pickupPoint":
          filter.lastPickupPointId = segmentValue;
          break;

        case "deliveryMethod":
          filter.lastDeliveryMethod = segmentValue;
          break;
      }
    }

    const userFilter =
      await buildBroadcastUserFilter({
        audienceType,
        segmentType,
        segmentValue,
        username,
      });

    const users = await User.find(
      userFilter,
      {
        telegramId: 1,
        username: 1,
        firstName: 1,
        shopBotIndex: 1,
        shopBotKnown: 1,
      }
    )
      .sort({ createdAt: 1 })
      .limit(limit > 0 ? limit : 0)
      .lean();

    const jobId = crypto.randomBytes(8).toString("hex");

    broadcastJobs.set(jobId, {
      jobId,
      status: "running",
      totalUsers: users.length,
      processed: 0,
      sent: 0,
      failed: 0,
      blocked: 0,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      lastErrors: [],
    });

    const replyMarkup = {
      inline_keyboard: [
        [
          {
            text: buttonText,
            web_app: {
              url: buttonUrl,
            },
          },
        ],
      ],
    };

    // сразу отвечаем admin-bot, чтобы он не падал по timeout
    res.json({
      ok: true,
      accepted: true,
      async: true,
      jobId,
      totalUsers: users.length,
      preview: {

        audienceType,

        segmentType,

        segmentValue,

        username,

        photoUrl,

        text,

        buttonText,

        buttonUrl,

      },
    });

    // дальше отправляем в фоне
    setImmediate(async () => {
      let sent = 0;
      let failed = 0;
      let blocked = 0;

      const updateJob = (patch = {}) => {

        const prev = broadcastJobs.get(jobId) || {};

        broadcastJobs.set(jobId, {

          ...prev,

          ...patch,

          updatedAt: new Date().toISOString(),

        });

      };

      console.log("[BROADCAST PHOTO ASYNC][START]", {
        jobId,
        totalUsers: users.length,
        buttonText,
        buttonUrl,
      });

      for (const user of users) {
        const telegramId = String(user?.telegramId || "").trim();
        if (!telegramId) continue;

        try {
          await sendClientTelegramPhoto(
            telegramId,
            photoUrl,
            {
              caption: text,
              parse_mode: "HTML",
              reply_markup: replyMarkup,
            },
            { user }
          );

          sent += 1;
        } catch (e) {
          failed += 1;

          const description = String(e?.response?.description || e?.message || e || "");

          const isBlocked =
            description.includes("bot was blocked") ||
            description.includes("user is deactivated") ||
            description.includes("chat not found") ||
            description.includes("Forbidden");

          if (isBlocked) blocked += 1;

          const prevJob = broadcastJobs.get(jobId) || {};

          const prevErrors = Array.isArray(prevJob.lastErrors) ? prevJob.lastErrors : [];

          updateJob({

            lastErrors: [

              ...prevErrors,

              {

                telegramId,

                error: description.slice(0, 300),

              },

            ].slice(-10),

          });

          if (failed <= 20) {
            console.warn("[BROADCAST PHOTO ASYNC][SEND FAILED]", {
              jobId,
              telegramId,
              error: description,
            });
          }
        }

        if ((sent + failed) % 100 === 0) {
          console.log("[BROADCAST PHOTO ASYNC][PROGRESS]", {
            jobId,
            processed: sent + failed,
            totalUsers: users.length,
            sent,
            failed,
            blocked,
          });
        }

        if ((sent + failed) % 25 === 0 || sent + failed === users.length) {

          updateJob({

            status: "running",

            processed: sent + failed,

            totalUsers: users.length,

            sent,

            failed,

            blocked,

          });

        }

        await new Promise((resolve) => setTimeout(resolve, 60));
      }

      updateJob({

        status: "done",

        processed: sent + failed,

        totalUsers: users.length,

        sent,

        failed,

        blocked,

        finishedAt: new Date().toISOString(),

      });

      console.log("[BROADCAST PHOTO ASYNC][DONE]", {

        jobId,

        totalUsers: users.length,

        sent,

        failed,

        blocked,

      });
    });
  } catch (e) {
    console.error("admin async photo broadcast error:", e);

    if (!res.headersSent) {
      return res.status(500).json({
        ok: false,
        error: "SERVER_ERROR",
        message: String(e?.message || e),
      });
    }
  }
});

app.get("/admin/promo-codes", requireAdmin, async (req, res) => {
  try {
    const promoCodes = await mongoose.connection
      .collection(PROMO_CODES_COLLECTION)
      .find({})
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray();

    return res.json({
      ok: true,
      promoCodes,
    });
  } catch (error) {
    console.error(
      "GET /admin/promo-codes error:",
      error
    );

    return res.status(500).json({
      ok: false,
      error: "PROMO_CODES_LIST_FAILED",
    });
  }
});

app.post("/admin/promo-codes", requireAdmin, async (req, res) => {
  try {
    const code = normalizePromoCode(
      req.body?.code
    );

    const amountZl = Number(
      req.body?.amountZl || 0
    );

    const expiresAtRaw =
      req.body?.expiresAt;

    let expiresAt = null;

    if (
      expiresAtRaw !== null &&
      expiresAtRaw !== undefined &&
      String(expiresAtRaw).trim() !== ""
    ) {
      expiresAt = new Date(
        expiresAtRaw
      );

      if (
        !Number.isFinite(
          expiresAt.getTime()
        )
      ) {
        return res.status(400).json({
          ok: false,
          error:
            "INVALID_PROMO_CODE_EXPIRES_AT",
        });
      }

      if (
        expiresAt.getTime() <=
        Date.now()
      ) {
        return res.status(400).json({
          ok: false,
          error:
            "PROMO_CODE_EXPIRATION_MUST_BE_IN_FUTURE",
        });
      }
    }

    if (!code || code.length < 3) {
      return res.status(400).json({
        ok: false,
        error: "INVALID_PROMO_CODE",
      });
    }

    if (
      !Number.isFinite(amountZl) ||
      amountZl <= 0 ||
      amountZl > 100000
    ) {
      return res.status(400).json({
        ok: false,
        error: "INVALID_PROMO_AMOUNT",
      });
    }

    const now = new Date();

    const result = await mongoose.connection
      .collection(PROMO_CODES_COLLECTION)
      .findOneAndUpdate(
        { code },

        {
          $set: {
            code,

            amountZl: Number(
              amountZl.toFixed(2)
            ),

            isActive: true,

            expiresAt,

            updatedAt: now,
          },

          $setOnInsert: {
            createdAt: now,

            createdByTelegramId: String(
              req.adminTelegramId || ""
            ),

            activationsCount: 0,
          },
        },

        {
          upsert: true,
          returnDocument: "after",
        }
      );

    const promoCode =
      result?.value || result;

    return res.json({
      ok: true,
      promoCode,
    });
  } catch (error) {
    console.error(
      "POST /admin/promo-codes error:",
      error
    );

    if (
      String(error?.code || "") === "11000"
    ) {
      return res.status(409).json({
        ok: false,
        error: "PROMO_CODE_ALREADY_EXISTS",
      });
    }

    return res.status(500).json({
      ok: false,
      error: "PROMO_CODE_SAVE_FAILED",
    });
  }
});

app.patch(
  "/admin/promo-codes/:code/toggle",
  requireAdmin,

  async (req, res) => {
    try {
      const code = normalizePromoCode(
        req.params?.code
      );

      const existing =
        await getPromoCodeByCode(code);

      if (!existing) {
        return res.status(404).json({
          ok: false,
          error: "PROMO_NOT_FOUND",
        });
      }

      const isActive =
        existing?.isActive !== true;

      await mongoose.connection
        .collection(PROMO_CODES_COLLECTION)
        .updateOne(
          { code },

          {
            $set: {
              isActive,
              updatedAt: new Date(),
            },
          }
        );

      return res.json({
        ok: true,
        code,
        isActive,
      });
    } catch (error) {
      console.error(
        "PATCH /admin/promo-codes/:code/toggle error:",
        error
      );

      return res.status(500).json({
        ok: false,
        error: "PROMO_CODE_TOGGLE_FAILED",
      });
    }
  }
);

app.get("/admin/users/broadcast-jobs/:jobId", async (req, res) => {
  try {
    const adminToken = String(req.headers["x-admin-token"] || "").trim();

    if (!adminToken || adminToken !== String(process.env.ADMIN_API_TOKEN || "").trim()) {
      return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
    }

    const jobId = String(req.params?.jobId || "").trim();
    const job = broadcastJobs.get(jobId);

    console.log("[BROADCAST JOB GET]", {
      jobId,
      exists: !!job,
      status: job?.status,
      processed: job?.processed,
      totalUsers: job?.totalUsers,
      sent: job?.sent,
    });

    if (!job) {
      return res.status(404).json({
        ok: false,
        error: "BROADCAST_JOB_NOT_FOUND",
        jobId,
      });
    }

    return res.json({ ok: true, job });
  } catch (e) {
    console.error("broadcast job status error:", e);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

app.patch("/admin/pickup-points/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const b = req.body || {};

    const allow = [
      "key",
      "title",
      "address",
      "sortOrder",
      "isActive",
      "allowedAdminTelegramIds",
      "notificationChatId",
      "statsChatId",
      "statsSendTime",
      "paymentConfig",
      "scheduleByDatePatch",
      "scheduleByDate",
    ];
    
    const update = {};
    for (const k of allow) if (b[k] !== undefined) update[k] = b[k];

    if (update.key !== undefined) update.key = String(update.key);
    if (update.title !== undefined) update.title = String(update.title);
    if (update.address !== undefined) update.address = String(update.address);
    if (update.sortOrder !== undefined) update.sortOrder = Number(update.sortOrder || 0);
    if (update.isActive !== undefined) update.isActive = !!update.isActive;

    if (update.allowedAdminTelegramIds !== undefined) {
      update.allowedAdminTelegramIds = Array.isArray(update.allowedAdminTelegramIds)
        ? update.allowedAdminTelegramIds.map((x) => String(x)).filter(Boolean)
        : [];
    }

    if (update.notificationChatId !== undefined) {
      update.notificationChatId = String(update.notificationChatId || "").trim();
    }

    if (update.statsChatId !== undefined) {
      update.statsChatId = String(update.statsChatId || "").trim();
    }

    if (update.statsSendTime !== undefined) {
      update.statsSendTime = String(update.statsSendTime || "23:59").trim();
    }

    if (update.scheduleByDate !== undefined) {
      update.scheduleByDate =
        update.scheduleByDate && typeof update.scheduleByDate === "object"
          ? update.scheduleByDate
          : {};
    }

    if (update.paymentConfig !== undefined) {
      const rawMethods = Array.isArray(update.paymentConfig?.methods)
        ? update.paymentConfig.methods
        : [];

      update.paymentConfig = {
        methods: rawMethods
          .map((m) => ({
            key: String(m?.key || "").trim(),
            label: String(m?.label || "").trim(),
            detailsValue: String(m?.detailsValue || "").trim(),
            badge: String(m?.badge || "").trim(),
            isActive: m?.isActive !== false,
          }))
          .filter((m) => m.key),
      };
    }

    if (
      update.scheduleByDatePatch !==
      undefined
    ) {
      const patch =
        update.scheduleByDatePatch &&
        typeof update.scheduleByDatePatch ===
          "object" &&
        !Array.isArray(
          update.scheduleByDatePatch
        )
          ? update.scheduleByDatePatch
          : {};

      const existingPoint =
        await PickupPoint.findById(
          id
        ).lean();

      if (!existingPoint) {
        return res.status(404).json({
          ok: false,
          error:
            "Pickup point not found",
        });
      }

      const currentSchedule =
        existingPoint.scheduleByDate &&
        typeof existingPoint
          .scheduleByDate === "object"
          ? {
              ...existingPoint
                .scheduleByDate,
            }
          : {};

      const datePattern =
        /^\d{4}-\d{2}-\d{2}$/;

      const timePattern =
        /^([01]\d|2[0-3]):([0-5]\d)$/;

      const timeToMinutes = (
        value
      ) => {
        const [hours, minutes] =
          String(value)
            .split(":")
            .map(Number);

        return (
          hours * 60 + minutes
        );
      };

      for (
        const [dateKey, value] of
          Object.entries(patch)
      ) {
        /*
        * Проверка формата даты.
        */
        if (
          !datePattern.test(dateKey)
        ) {
          return res
            .status(400)
            .json({
              ok: false,
              error:
                "INVALID_SCHEDULE_DATE_KEY",
              dateKey,
            });
        }

        /*
        * Проверка существования даты.
        */
        const [
          year,
          month,
          day,
        ] = dateKey
          .split("-")
          .map(Number);

        const parsedDate =
          new Date(
            Date.UTC(
              year,
              month - 1,
              day
            )
          );

        const isRealDate =
          parsedDate.getUTCFullYear() ===
            year &&
          parsedDate.getUTCMonth() ===
            month - 1 &&
          parsedDate.getUTCDate() ===
            day;

        if (!isRealDate) {
          return res
            .status(400)
            .json({
              ok: false,
              error:
                "INVALID_SCHEDULE_DATE",
              dateKey,
            });
        }

        const isOpen =
          value?.isOpen === true;

        /*
        * Закрытый день.
        */
        if (!isOpen) {
          currentSchedule[dateKey] = {
            isOpen: false,

            from: "",
            to: "",

            openFrom: "",
            openTo: "",

            periods: [],

            note: String(
              value?.note ||
                "закрыто"
            ).trim(),
          };

          continue;
        }

        /*
        * Рабочий день.
        */
        const sourcePeriods =
          Array.isArray(
            value?.periods
          )
            ? value.periods
            : [];

        if (
          !sourcePeriods.length
        ) {
          return res
            .status(400)
            .json({
              ok: false,
              error:
                "SCHEDULE_PERIODS_REQUIRED",
              dateKey,
            });
        }

        if (
          sourcePeriods.length > 8
        ) {
          return res
            .status(400)
            .json({
              ok: false,
              error:
                "TOO_MANY_SCHEDULE_PERIODS",
              dateKey,
            });
        }

        const periods = [];

        for (
          const sourcePeriod of
            sourcePeriods
        ) {
          const from = String(
            sourcePeriod?.from ||
              sourcePeriod?.openFrom ||
              ""
          ).trim();

          const to = String(
            sourcePeriod?.to ||
              sourcePeriod?.openTo ||
              ""
          ).trim();

          if (
            !timePattern.test(from) ||
            !timePattern.test(to)
          ) {
            return res
              .status(400)
              .json({
                ok: false,
                error:
                  "INVALID_SCHEDULE_TIME",
                dateKey,
                period:
                  sourcePeriod,
              });
          }

          const fromMinutes =
            timeToMinutes(from);

          const toMinutes =
            timeToMinutes(to);

          if (
            toMinutes <=
            fromMinutes
          ) {
            return res
              .status(400)
              .json({
                ok: false,
                error:
                  "INVALID_SCHEDULE_PERIOD",
                dateKey,
                period:
                  sourcePeriod,
              });
          }

          periods.push({
            openFrom: from,
            openTo: to,

            from,
            to,

            fromMinutes,
            toMinutes,
          });
        }

        /*
        * Сортируем периоды.
        */
        periods.sort(
          (a, b) =>
            a.fromMinutes -
            b.fromMinutes
        );

        /*
        * Проверяем пересечения.
        */
        for (
          let index = 1;
          index < periods.length;
          index += 1
        ) {
          if (
            periods[index]
              .fromMinutes <
            periods[index - 1]
              .toMinutes
          ) {
            return res
              .status(400)
              .json({
                ok: false,
                error:
                  "SCHEDULE_PERIODS_OVERLAP",
                dateKey,
              });
          }
        }

        const normalizedPeriods =
          periods.map(
            ({
              openFrom,
              openTo,
              from,
              to,
            }) => ({
              openFrom,
              openTo,
              from,
              to,
            })
          );

        currentSchedule[
          dateKey
        ] = {
          isOpen: true,

          from:
            normalizedPeriods[0]
              .from,

          to:
            normalizedPeriods[
              normalizedPeriods.length -
                1
            ].to,

          openFrom:
            normalizedPeriods[0]
              .openFrom,

          openTo:
            normalizedPeriods[
              normalizedPeriods.length -
                1
            ].openTo,

          periods:
            normalizedPeriods,

          note: String(
            value?.note ||
              normalizedPeriods
                .map(
                  (period) =>
                    `${period.from}-${period.to}`
                )
                .join(", ")
          ).trim(),
        };
      }

      update.scheduleByDate =
        currentSchedule;

      delete update
        .scheduleByDatePatch;
    }

    const updated = await PickupPoint.findByIdAndUpdate(id, update, { new: true });
    cacheInvalidate("pickup-points");
    if (!updated) return res.status(404).json({ ok: false, error: "Pickup point not found" });

    res.json({ ok: true, pickupPoint: updated });
  } catch (e) {
    console.error("PATCH /admin/pickup-points/:id error:", e);
    if (e?.code === 11000) return res.status(409).json({ ok: false, error: "Pickup point key already exists" });
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

app.delete("/admin/pickup-points/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await PickupPoint.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ ok: false, error: "Pickup point not found" });
    res.json({ ok: true });
  } catch (e) {
    console.error("DELETE /admin/pickup-points/:id error:", e);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

}
