import { bot } from "../bot/single.js";
import { Markup, Input } from "./_telegraf.js";
import {
  API_URL,
  BOT_TOKEN,
  ADMIN_API_TOKEN,
  WEBAPP_URL,
  ADMIN_IDS,
  SUPER_ADMIN_IDS,
} from "../config.js";
import { api, isValidUrl } from "../api.js";
import {
  isAdmin,
  isSuperAdmin,
  accessDeniedReply,
  getAdminBotUsername,
  setAdminBotUsername,
} from "../auth.js";
import { getState, setState, clearState } from "../state.js";
import {
  startBroadcastStatusPolling,
  formatBroadcastJobStatus,
} from "../broadcastPolling.js";
import { translitRuToLat } from "../utils/translit.js";
import { sendStepCard } from "../ui/sendStepCard.js";
import {
  pickupPointManagerMenu,
  isPickupPointManager,
  isCourierManager,
  mainMenu,
} from "./menu.js";
import { askPickupCreateStep } from "./pickupFlow.js";
import {
  fetchMyPickupPoints,
  formatPickupScheduleDates,
  ppListKeyboard,
  ppMenuKeyboard,
  ppPaymentMenuKeyboard,
  renderPickupPointPreview,
} from "./pickupPointHelpers.js";
import {
  askCourierMessageStep,
  defaultCourierMessageData,
} from "./wizardState.js";

// =====================================================
// =================== PICKUP POINTS CRUD ==============
// =====================================================

bot.action("pp_list", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("No access");
  await ctx.answerCbQuery();

  try {
    const points = isSuperAdmin(ctx)
      ? await api("/pickup-points?active=0").then((data) => data.pickupPoints || [])
      : await fetchMyPickupPoints(ctx);

    if (!points.length) {
      return ctx.reply(
        "Точек самовывоза пока нет.",
        Markup.inlineKeyboard([
          ...(isSuperAdmin(ctx) ? [[Markup.button.callback("➕ Создать точку", "pp_create")]] : []),
          [Markup.button.callback("🏠 Меню", "menu")],
        ])
      );
    }

    return ctx.reply("🏪 *Точки самовывоза:*", {
      parse_mode: "Markdown",
      reply_markup: ppListKeyboard(points, ctx).reply_markup,
    });
  } catch (e) {
    return ctx.reply(`❌ Ошибка: ${e.message}`, mainMenu(ctx));
  }
});

bot.action("pp_create", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("No access");
  await ctx.answerCbQuery();

  setState(ctx.chat.id, {
    mode: "pp_create",
    step: 0,
    data: {
      title: "",
      address: "",
      sortOrder: 0,
      isActive: true,
      allowedAdminTelegramIds: [],
      notificationChatId: "",
      statsChatId: "",
      statsSendTime: "23:59",
      scheduleByDate: {},
    },
  });

  return askPickupCreateStep(ctx);
});

bot.action("pp_cancel", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("No access");
  await ctx.answerCbQuery();

  clearState(ctx.chat.id);
  return ctx.reply("Ок, отменено.", mainMenu(ctx));
});

bot.action("pp_back", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("No access");
  await ctx.answerCbQuery();

  const st = getState(ctx.chat.id);
  if (!st || st.mode !== "pp_create") return;

  st.step = Math.max(0, Number(st.step || 0) - 1);
  setState(ctx.chat.id, st);
  return askPickupCreateStep(ctx);
});

bot.action("pp_create_confirm", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("No access");
  await ctx.answerCbQuery();

  const st = getState(ctx.chat.id);
  if (!st || st.mode !== "pp_create") return;

  try {
    const d = st.data || {};
    if (!String(d.title || "").trim() && !String(d.address || "").trim()) {
      throw new Error("Нужно указать хотя бы название или адрес");
    }

    const payload = {
      title: String(d.title || "").trim(),
      address: String(d.address || "").trim(),
      sortOrder: Number(d.sortOrder || 0),
      isActive: d.isActive !== false,
      allowedAdminTelegramIds: Array.isArray(d.allowedAdminTelegramIds)
        ? d.allowedAdminTelegramIds.map((x) => String(x).trim()).filter(Boolean)
        : [],
      notificationChatId: String(d.notificationChatId || "").trim(),
      statsChatId: String(d.statsChatId || "").trim(),
      statsSendTime: String(d.statsSendTime || "23:59").trim(),
      scheduleByDate:
        d.scheduleByDate && typeof d.scheduleByDate === "object"
          ? d.scheduleByDate
          : {},
    };

    await api("/admin/pickup-points", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    clearState(ctx.chat.id);
    return ctx.reply(
      "✅ Точка создана",
      Markup.inlineKeyboard([
        [Markup.button.callback("🏪 К списку точек", "pp_list")],
        [Markup.button.callback("🏠 Меню", "cat_builder_cancel")],
      ])
    );
  } catch (e) {
    return ctx.reply(`❌ Ошибка: ${e.message}`);
  }
});

bot.action(/pp_open:(.+)/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("No access");
  await ctx.answerCbQuery();

  const id = String(ctx.match[1] || "");

  try {
    const points = isSuperAdmin(ctx)
      ? await api("/pickup-points?active=0").then((data) => data.pickupPoints || [])
      : await fetchMyPickupPoints(ctx);
    const p = points.find((x) => String(x._id) === id);

    if (!p) return ctx.reply("Точка не найдена", mainMenu(ctx));

    setState(ctx.chat.id, { mode: "pp_open", ppId: id, data: p });

    return ctx.reply(renderPickupPointPreview(p), {
      parse_mode: "Markdown",
      reply_markup: (isSuperAdmin(ctx)
        ? ppMenuKeyboard(id)
        : pickupPointManagerMenu(id, {
            isSuper: isSuperAdmin(ctx),
            pointKey: p?.key,
          })
      ).reply_markup,
    });
  } catch (e) {
    return ctx.reply(`❌ Ошибка: ${e.message}`, mainMenu(ctx));
  }
});

bot.action(/pp_toggle:(.+)/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("No access");
  await ctx.answerCbQuery();

  const id = String(ctx.match[1] || "");

  try {
    const points = isSuperAdmin(ctx)
      ? await api("/pickup-points?active=0").then((data) => data.pickupPoints || [])
      : await fetchMyPickupPoints(ctx);
    const p = points.find((x) => String(x._id) === id);
    if (!p) return ctx.reply("Точка не найдена", mainMenu(ctx));

    const updated = await api(`/admin/pickup-points/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive: !p.isActive }),
    });

    const fresh = updated?.pickupPoint || updated;
    setState(ctx.chat.id, { mode: "pp_open", ppId: id, data: fresh });

    return ctx.reply(renderPickupPointPreview(fresh), {
      parse_mode: "Markdown",
      reply_markup: (
        isSuperAdmin(ctx)
          ? ppMenuKeyboard(id)
          : pickupPointManagerMenu(id, {
              isSuper: false,
              pointKey: fresh?.key,
            })
      ).reply_markup,
    });
  } catch (e) {
    return ctx.reply(`❌ Ошибка: ${e.message}`, mainMenu(ctx));
  }
});

bot.action(/pp_delete:(.+)/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("No access");
  await ctx.answerCbQuery();

  const id = String(ctx.match[1] || "");

  try {
    await api(`/admin/pickup-points/${id}`, { method: "DELETE" });
    clearState(ctx.chat.id);

    return ctx.reply(
      "🗑 Точка удалена",
      Markup.inlineKeyboard([
        [Markup.button.callback("🏪 К списку точек", "pp_list")],
        [Markup.button.callback("🏠 Меню", "cat_builder_cancel")],
      ])
    );
  } catch (e) {
    return ctx.reply(`❌ Ошибка: ${e.message}`, mainMenu(ctx));
  }
});

bot.action(/pp_edit_address:(.+)/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("No access");
  await ctx.answerCbQuery();

  const pickupPointId = String(ctx.match[1] || "").trim();
  const allowed = await isPickupPointManager(ctx, pickupPointId);
  if (!allowed) {
    return ctx.answerCbQuery("Нет доступа", { show_alert: true });
  }

  if (!pickupPointId) return ctx.reply("❌ Точка не найдена.");

  setState(ctx.chat.id, {
    mode: "pp_prompt",
    field: "address",
    ppId: pickupPointId,
  });

return ctx.reply("Введите новый *адрес* (или `-` чтобы отменить)", {
  parse_mode: "Markdown",
  reply_markup: Markup.inlineKeyboard([
    [Markup.button.callback("⬅️ К точке", `pp_open:${pickupPointId}`)],
    [Markup.button.callback("🏠 Меню", "menu")],
  ]).reply_markup,
});
});

bot.action(/pp_edit_schedule_by_date:(.+)/, async (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.answerCbQuery("No access");
  }

  await ctx.answerCbQuery();

  const pickupPointId = String(
    ctx.match?.[1] || ""
  ).trim();

  if (!pickupPointId) {
    return ctx.reply(
      "❌ Точка не найдена."
    );
  }

  const allowed =
    await isPickupPointManager(
      ctx,
      pickupPointId
    );

  if (!allowed) {
    return ctx.reply(
      "❌ Нет доступа."
    );
  }

  try {
    const pointsData = await api(
      "/pickup-points?active=0"
    );

    const points = Array.isArray(
      pointsData
    )
      ? pointsData
      : Array.isArray(
          pointsData?.pickupPoints
        )
      ? pointsData.pickupPoints
      : [];

    const point =
      points.find(
        (item) =>
          String(
            item?._id || ""
          ) === pickupPointId
      ) || null;

    if (!point) {
      return ctx.reply(
        "❌ Точка не найдена."
      );
    }

    const monthScheduleText =
      formatPickupScheduleDates(
        point?.scheduleByDate || {}
      );

    return ctx.reply(
      [
        "🗓 *График на текущий месяц:*",
        "",
        monthScheduleText,
      ].join("\n"),
      {
        parse_mode: "Markdown",

        reply_markup:
          Markup.inlineKeyboard([
            [
              Markup.button.callback(
                "➕ Добавить другую дату",
                `pp_add_schedule_date:${pickupPointId}`
              ),
            ],
            [
              Markup.button.callback(
                "⬅️ К точке",
                `pp_open:${pickupPointId}`
              ),
            ],
          ]).reply_markup,
      }
    );
  } catch (error) {
    console.error(
      "pp_edit_schedule_by_date error:",
      error
    );

    return ctx.reply(
      `❌ Не удалось загрузить график: ${error.message}`
    );
  }
});

bot.action(/pp_add_schedule_date:(.+)/, async (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.answerCbQuery(
      "No access"
    );
  }

  await ctx.answerCbQuery();

  const pickupPointId = String(
    ctx.match?.[1] || ""
  ).trim();

  if (!pickupPointId) {
    return ctx.reply(
      "❌ Точка не найдена."
    );
  }

  const allowed =
    await isPickupPointManager(
      ctx,
      pickupPointId
    );

  if (!allowed) {
    return ctx.reply(
      "❌ Нет доступа."
    );
  }

  setState(ctx.chat.id, {
    mode:
      "pp_prompt_schedule_by_date",

    step: "date",

    pickupPointId,

    dateKey: "",

    displayDate: "",
  });

  return ctx.reply(
    [
      "🗓 *График по конкретной дате*",
      "",
      "Введите дату в формате `ДД.ММ.ГГГГ`.",
      "",
      "Пример: `21.07.2026`",
    ].join("\n"),
    {
      parse_mode: "Markdown",

      reply_markup:
        Markup.inlineKeyboard([
          [
            Markup.button.callback(
              "⬅️ Назад к графику",
              `pp_edit_schedule_by_date:${pickupPointId}`
            ),
          ],
        ]).reply_markup,
    }
  );
});

bot.action(/pp_edit_orders_chat:(.+)/, async (ctx) => {
  if (!isSuperAdmin(ctx)) {
    return ctx.answerCbQuery("Нет доступа", { show_alert: true });
  }
  await ctx.answerCbQuery();

  const pickupPointId = String(ctx.match[1] || "").trim();
  if (!pickupPointId) return ctx.reply("❌ Точка не найдена.");

  setState(ctx.chat.id, {
    mode: "pp_prompt",
    field: "notificationChatId",
    ppId: pickupPointId,
  });

  return ctx.reply("Введите *ID чата* для получения уведомлений о заказах", {
    parse_mode: "Markdown",
  });
});

bot.action(/pp_edit_stats_chat:(.+)/, async (ctx) => {
  if (!isSuperAdmin(ctx)) {
    return ctx.answerCbQuery("Нет доступа", { show_alert: true });
  }
  await ctx.answerCbQuery();

  const pickupPointId = String(ctx.match[1] || "").trim();
  if (!pickupPointId) return ctx.reply("❌ Точка не найдена.");

  setState(ctx.chat.id, {
    mode: "pp_prompt",
    field: "statsChatId",
    ppId: pickupPointId,
  });

  return ctx.reply("Введите *ID чата* для получения статистики по складу", {
    parse_mode: "Markdown",
  });
});

bot.action(/pp_prompt:(title|address|allowedAdminTelegramIds|notificationChatId|statsChatId|sortOrder):(.+)/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("No access");
  await ctx.answerCbQuery();

  const field = String(ctx.match[1] || "");
  const id = String(ctx.match[2] || "");

  setState(ctx.chat.id, { mode: "pp_prompt", field, ppId: id });

  const prompts = {
    title: "Введите новое *название* (или `-` чтобы отменить)",
    address: "Введите новый *адрес* (или `-` чтобы отменить)",
    allowedAdminTelegramIds: "Введите *ID менеджеров* через запятую (telegramId) (или `-` чтобы очистить/отменить)",
    notificationChatId: "Введите *ID чата* для получения уведомлений о заказах",
    statsChatId: "Введите *ID чата* для получения статистики по складу",
    sortOrder: "Введите новый *sortOrder* (0,1,2...) (или `-` чтобы отменить)",
  };

  return ctx.reply(prompts[field] || "Введите новое значение", { parse_mode: "Markdown" });
});

bot.action(/pp_payment_menu:(.+)/, async (ctx) => {
  if (!isAdmin(ctx)) return;

  const id = String(ctx.match?.[1] || "").trim();
  if (!id) return;

  try {
    const points = isSuperAdmin(ctx)
      ? await api("/pickup-points?active=0").then((data) => data.pickupPoints || [])
      : await fetchMyPickupPoints(ctx);
    const point = points.find((x) => String(x._id) === id);

    if (!point) return ctx.answerCbQuery("Точка не найдена");

const escapeTelegramMarkdown = (value) =>
  String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\*/g, "\\*")
    .replace(/_/g, "\\_")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");

const pm = Array.isArray(point?.paymentConfig?.methods) ? point.paymentConfig.methods : [];

const paymentMethodsLabel = pm.length
  ? pm
      .map((m) => `\`${String(m?.key || "").trim().replace(/`/g, "")}${m?.isActive === false ? " (off)" : ""}\``)
      .filter(Boolean)
      .join(", ")
  : "—";

const safeAddress = escapeTelegramMarkdown(String(point?.address || point?.title || "—"));

const text = [
  "🏪 *Точка самовывоза — методы оплаты*",
  "",
  `Адрес: *${safeAddress}*`,
  "",
  `Способы оплаты: ${paymentMethodsLabel}`,
  "",
  "Выберите способ оплаты для настройки:",
].join("\n");

    if (ctx.callbackQuery?.message?.photo) {
      await ctx.editMessageCaption(text, {
        parse_mode: "Markdown",
        reply_markup: ppPaymentMenuKeyboard(id).reply_markup,
      });
    } else {
      await ctx.editMessageText(text, {
        parse_mode: "Markdown",
        reply_markup: ppPaymentMenuKeyboard(id).reply_markup,
      });
    }
  } catch (e) {
    console.error(e);
    await ctx.answerCbQuery("Ошибка");
  }
});

bot.action(/pp_pay_prompt:(.+):(.+)/, async (ctx) => {
  if (!isAdmin(ctx)) return;
  await ctx.answerCbQuery();

  const id = String(ctx.match?.[1] || "").trim();
  const methodKey = String(ctx.match?.[2] || "").trim();
  if (!id || !methodKey) return;

  const paymentMethodPromptMeta = {
    blik: {
      title: "BLIK",
      label: "BLIK",
      badge: "BLIK",
      defaultDetailsValue: "+48 573 401 389",
      example: "+48 573 401 389",
    },
    crypto: {
      title: "Криптовалюта",
      label: "Криптовалюта",
      badge: "USDT TRC20",
      defaultDetailsValue: "TGG97dKjM1nQpQkVb8Yt6vYz2w3x4c5b6a",
      example: "TGG97dKjM1nQpQkVb8Yt6vYz2w3x4c5b6a",
    },
    ua_card: {
      title: "УКР. КАРТА",
      label: "Украинская карта",
      badge: "Перевод на карту",
      defaultDetailsValue: "5395 4182 3356 7590",
      example: "5395 4182 3356 7590",
    },
    cash: {
      title: "НАЛИЧНЫЕ",
      label: "Наличные",
      badge: "Наличные",
      defaultDetailsValue: "Оплата при получении",
      example: "Оплата при получении",
    },
  };

  const promptMeta = paymentMethodPromptMeta[String(methodKey || "").trim()] || {
    title: "СПОСОБ ОПЛАТЫ",
    example: "Label | detailsValue | badge | on",
  };

  try {
    const points = isSuperAdmin(ctx)
      ? await api("/pickup-points?active=0").then((data) => data.pickupPoints || [])
      : await fetchMyPickupPoints(ctx);

    const point = points.find((x) => String(x._id) === id);
    if (!point) return ctx.reply("❌ Точка не найдена.");

    const methods = Array.isArray(point?.paymentConfig?.methods) ? point.paymentConfig.methods : [];
    const currentMethod = methods.find((m) => String(m?.key || "") === methodKey) || null;

    const currentMethodText = currentMethod
      ? [
          `Текущие настройки для *${promptMeta.title}*:`,
          `Реквизиты: \`${String(currentMethod.detailsValue || "").trim() || "—"}\``,
          `Статус: *${currentMethod.isActive === false ? "выключен" : "включен"}*`,
        ].join("\n")
      : `Текущий метод оплаты для *${promptMeta.title}* не установлен.`;

    const isActive = currentMethod?.isActive !== false;
    const toggleLabel = isActive ? "🔴 Выключить" : "🟢 Включить";

    const promptText = [
      `Введите *реквизиты* для *${promptMeta.title}*:`,
      "",
      currentMethodText,
      "",
      `Что нужно отправить сейчас:`,
      `\`${promptMeta.example}\``,
    ].join("\n");

    setState(ctx.chat.id, {
      mode: "pp_payment_prompt",
      pointId: id,
      methodKey,
    });

    return ctx.reply(promptText, {
      parse_mode: "Markdown",
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback(toggleLabel, `pp_pay_toggle:${id}:${methodKey}`)],
        [Markup.button.callback("⬅️ К оплатам", `pp_payment_menu:${id}`)],
        [Markup.button.callback("🏠 Меню", `pp_open:${id}`)],
      ]).reply_markup,
    });
  } catch (e) {
    console.error(e);
    return ctx.reply(`❌ Ошибка: ${e.message}`);
  }
});

bot.action(/pp_pay_toggle:(.+):(.+)/, async (ctx) => {
  if (!isAdmin(ctx)) return;
  await ctx.answerCbQuery();

  const id = String(ctx.match?.[1] || "").trim();
  const methodKey = String(ctx.match?.[2] || "").trim();
  if (!id || !methodKey) return;

  try {
    const data = await api("/pickup-points?active=0");
    const points = data.pickupPoints || [];
    const point = points.find((x) => String(x._id) === id);

    if (!point) return ctx.reply("❌ Точка не найдена.");

    const methods = Array.isArray(point?.paymentConfig?.methods)
      ? [...point.paymentConfig.methods]
      : [];

    const idx = methods.findIndex((m) => String(m?.key || "") === methodKey);

    if (idx >= 0) {
      methods[idx] = {
        ...methods[idx],
        isActive: methods[idx]?.isActive === false ? true : false,
      };
    } else {
      methods.push({
        key: methodKey,
        label: "",
        detailsValue: "",
        badge: "",
        isActive: true,
      });
    }

    await api(`/admin/pickup-points/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        paymentConfig: { methods },
      }),
    });

    return ctx.reply("✅ Статус метода оплаты обновлён.", {
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback("⬅️ Вернуться к методу", `pp_pay_prompt:${id}:${methodKey}`)],
        [Markup.button.callback("⬅️ К оплатам", `pp_payment_menu:${id}`)],
      ]).reply_markup,
    });
  } catch (e) {
    console.error(e);
    return ctx.reply(`❌ Ошибка: ${e.message}`);
  }
});

bot.action("courier_msg_main", async (ctx) => {
  try {
  if (!isAdmin(ctx)) {
    return ctx.answerCbQuery("Нет доступа", { show_alert: true });
  }

    const r = await fetch(`${API_URL}/pickup-points?active=0&_ts=${Date.now()}`);
    const data = await r.json().catch(() => ({}));
    const pickupPoints = Array.isArray(data?.pickupPoints)
      ? data.pickupPoints
      : Array.isArray(data)
      ? data
      : [];

    const courierPoint = pickupPoints.find(
      (p) => String(p?.key || "").trim().replace(/,+$/, "") === "delivery"
    );

    if (!courierPoint?._id) {
      return ctx.answerCbQuery("Точка delivery не найдена", { show_alert: true });
    }

    if (!ctx.from?.username) {
      await ctx.answerCbQuery();
      return ctx.reply(
        "❌ У вас должен быть установлен Telegram username, чтобы клиент мог связаться с курьером.",
        mainMenu(ctx)
      );
    }

    setState(ctx.chat.id, {
      mode: "courier_msg",
      step: 0,
      data: {
        ...defaultCourierMessageData(),
        pickupPointId: String(courierPoint._id),
      },
    });

    await ctx.answerCbQuery();
    return askCourierMessageStep(ctx);
  } catch (e) {
    console.error("courier_msg_main error:", e);
    return ctx.reply(`❌ Ошибка: ${e.message}`, mainMenu(ctx));
  }
});

bot.action(/^courier_msg_start:(.+)$/, async (ctx) => {
  try {
    const pickupPointId = String(ctx.match[1] || "").trim();

    if (!pickupPointId) {
      return ctx.answerCbQuery("Точка не найдена");
    }

    const allowed = await isPickupPointManager(ctx, pickupPointId);
    if (!allowed && !isSuperAdmin(ctx)) {
      return ctx.answerCbQuery("Нет доступа", { show_alert: true });
    }

    const r = await fetch(`${API_URL}/pickup-points?active=0&_ts=${Date.now()}`);
    const data = await r.json().catch(() => ({}));
    const pickupPoints = Array.isArray(data?.pickupPoints)
      ? data.pickupPoints
      : Array.isArray(data)
      ? data
      : [];

    const point = pickupPoints.find((p) => String(p?._id || "") === pickupPointId);
    const pointKey = String(point?.key || "").trim().replace(/,+$/, "");

    if (pointKey !== "delivery") {
      return ctx.answerCbQuery("Только для курьера", { show_alert: true });
    }

    if (!ctx.from?.username) {
      return ctx.reply("❌ У вас должен быть установлен Telegram username, чтобы клиент мог связаться с курьером.");
    }

    setState(ctx.chat.id, {
      mode: "courier_msg",
      step: 0,
      data: {
        ...defaultCourierMessageData(),
        pickupPointId,
      },
    });

    await ctx.answerCbQuery();
    return askCourierMessageStep(ctx);
  } catch (e) {
    console.error("courier_msg_start error:", e);
    return ctx.reply(`❌ Ошибка: ${e.message}`);
  }
});

bot.action("courier_msg_back", async (ctx) => {
  const st = getState(ctx.chat.id);
  if (!st || st.mode !== "courier_msg") return ctx.answerCbQuery();

  st.step = Math.max(0, Number(st.step || 0) - 1);
  setState(ctx.chat.id, st);

  await ctx.answerCbQuery();
  return askCourierMessageStep(ctx);
});

bot.action("courier_msg_cancel", async (ctx) => {
  clearState(ctx.chat.id);
  await ctx.answerCbQuery("Отменено");
  return ctx.reply("❌ Отправка сообщения отменена", mainMenu(ctx));
});

bot.action("courier_msg_confirm", async (ctx) => {
  try {
    const st = getState(ctx.chat.id);
    if (!st || st.mode !== "courier_msg") return ctx.answerCbQuery();

    const d = st.data || {};

    const result = await api("/admin/courier/customer-message", {
      method: "POST",
      body: JSON.stringify({
        pickupPointId: d.pickupPointId,
        target: d.username,
        username: d.username,
        text: d.text,
        photoUrl: d.photoUrl || "",
        managerTelegramId: String(ctx.from?.id || ""),
        managerUsername: String(ctx.from?.username || ""),
      }),
    });

    clearState(ctx.chat.id);
    await ctx.answerCbQuery("Отправлено");

    const sentToLabel = result?.sentToUsername

      ? `@${result.sentToUsername}`

      : String(result?.sentToTelegramId || d.username || "клиент");

    return ctx.reply(

      `✅ Сообщение отправлено клиенту ${sentToLabel}`,

      mainMenu(ctx)

    );
  } catch (e) {
    console.error("courier_msg_confirm error:", e);
    return ctx.reply(`❌ Ошибка: ${e.message}`);
  }
});

