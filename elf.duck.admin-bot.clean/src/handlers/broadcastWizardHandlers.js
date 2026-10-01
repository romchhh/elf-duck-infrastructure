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
import { mainMenu, isDelegatedReplyKeyboardText } from "./menu.js";
import {
  defaultPromoCodeData,
  PROMO_CODE_STEPS,
  normalizePromoCodeInput,
  askPromoCodeStep,
  defaultBroadcastData,
  askBroadcastStep,
  askBroadcastTemplateStep,
  defaultBroadcastTemplateData,
  askCourierMessageStep,
  defaultCourierMessageData,
} from "./wizardState.js";
import {
  askCashbackGrantStep,
  askCashbackDeductStep,
  runCashbackLookup,
  CASHBACK_GRANT_STEPS,
  CASHBACK_DEDUCT_STEPS,
} from "./cashback.js";
import { loadBroadcastTemplates, getBroadcastTemplateById } from "./broadcastTemplates.js";
import {
  FL_BUILDER_STEPS,
  FL_QUICK_STEPS,
  isFlavorFlowMode,
  askFlavorStep,
  askQuickStockStep,
} from "./flavorFlow.js";
import { BUILDER_STEPS } from "./categoryProductDefs.js";
import { PRODUCT_BUILDER_STEPS } from "./categoryProductDefs.js";
import { nextProductStep } from "./productFlow.js";
// ----- text inputs for steps -----
bot.on("text", async (ctx, next) => {
  if (!isAdmin(ctx)) return;

  const text = String(ctx.message?.text || "").trim();
  if (text.startsWith("/")) return next();

  if (isDelegatedReplyKeyboardText(text)) {
    clearState(ctx.chat.id);
    return next();
  }

  const broadcastState = getState(ctx.chat.id);

  if (broadcastState?.mode === "broadcast") {
    if (!isAdmin(ctx)) {
      clearState(ctx.chat.id);
      return ctx.reply("Недостаточно прав.");
    }

    const step = BROADCAST_STEPS[broadcastState.step];
    const d = broadcastState.data || defaultBroadcastData();

    if (
      step === "segmentType" &&
      d.audienceType === "username"
    ) {
      const username = String(ctx.message?.text || "")
        .trim()
        .replace(/^@/, "");

      if (!username) {
        return ctx.reply("Введите корректный username.");
      }

      d.username = username;
      broadcastState.data = d;

      broadcastState.step =
        BROADCAST_STEPS.indexOf("templateChoice");

      setState(ctx.chat.id, broadcastState);

      return askBroadcastStep(ctx);
    }

    if (step === "photo") {
      const photoUrl = String(ctx.message?.text || "").trim();

      if (!isValidUrl(photoUrl)) {
        return ctx.reply(
          "❌ Отправьте прямую публичную ссылку на картинку, которая начинается с http:// или https://.\n\nНапример: https://.../banner.jpg"
        );
      }

      d.photoUrl = photoUrl;
      broadcastState.data = d;
      broadcastState.step = BROADCAST_STEPS.indexOf("text");

      setState(ctx.chat.id, broadcastState);

      return askBroadcastStep(ctx);
    }

    if (step === "text") {
      const text = String(ctx.message?.text || ctx.message?.caption || "").trim();

      if (!text) {
        return ctx.reply("Введите текст уведомления.");
      }

      d.text = text.slice(0, 1024);
      broadcastState.data = d;
      broadcastState.step = BROADCAST_STEPS.indexOf("buttonText");

      setState(ctx.chat.id, broadcastState);

      return askBroadcastStep(ctx);
    }

    if (step === "buttonText") {
      const text = String(ctx.message?.text || "").trim();

      if (!text) {
        return ctx.reply("Введите текст кнопки.");
      }

      d.buttonText = text.slice(0, 64);
      broadcastState.data = d;
      broadcastState.step = BROADCAST_STEPS.indexOf("buttonUrl");

      setState(ctx.chat.id, broadcastState);

      return askBroadcastStep(ctx);
    }

    if (step === "buttonUrl") {
      const text = String(ctx.message?.text || "").trim();

      if (!isValidUrl(text)) {
        return ctx.reply("Введите корректную ссылку, которая начинается с http:// или https://");
      }

      d.buttonUrl = text;
      broadcastState.data = d;
      broadcastState.step = BROADCAST_STEPS.indexOf("confirm");

      setState(ctx.chat.id, broadcastState);

      return askBroadcastStep(ctx);
    }

    return askBroadcastStep(ctx);
  }

  const st = getState(ctx.chat.id);

  if (!st) return;

  // ================= BROADCAST TEMPLATE WIZARD =================

  if (

    st.mode === "broadcast_template_create" ||

    st.mode === "broadcast_template_edit"

  ) {

    const step = BROADCAST_TEMPLATE_STEPS[st.step];

    switch (step) {

      case "title":

        st.data.title = text;

        break;

      case "photoUrl":

        if (!isValidUrl(text)) {

          return ctx.reply("❌ Укажите корректную ссылку.");

        }

        st.data.photoUrl = text;

        break;

      case "text":

        st.data.text = text;

        break;

      case "buttonText":

        st.data.buttonText = text;

        break;

      case "buttonUrl":

        if (!isValidUrl(text)) {

          return ctx.reply("❌ Укажите корректную ссылку.");

        }

        st.data.buttonUrl = text;

        break;

    }

    st.step++;

    setState(ctx.chat.id, st);

    return askBroadcastTemplateStep(ctx);

  }

  // ===== PROMO CODES =====

  if (st.mode === "promo_code_create") {
    const step = PROMO_CODE_STEPS[st.step];
    const data = st.data || defaultPromoCodeData();

    if (step === "code") {
      const code = normalizePromoCodeInput(text);

      if (!code || code.length < 3) {
        return ctx.reply(
          "❌ Введите корректный промокод длиной минимум 3 символа. Разрешены латинские буквы, цифры, _ и -."
        );
      }

      data.code = code;
      st.data = data;
      st.step = PROMO_CODE_STEPS.indexOf("amount");

      setState(ctx.chat.id, st);

      return askPromoCodeStep(ctx);
    }

    if (step === "amount") {
      const amountZl = Number(
        text.replace(",", ".")
      );

      if (
        !Number.isFinite(amountZl) ||
        amountZl <= 0
      ) {
        return ctx.reply(
          "❌ Введите корректную сумму больше 0. Например: 25 или 37.5"
        );
      }

      data.amountZl = Number(
        amountZl.toFixed(2)
      );

      st.data = data;

      st.step =
        PROMO_CODE_STEPS.indexOf(
          "expiresAt"
        );

      setState(ctx.chat.id, st);

      return askPromoCodeStep(ctx);
    }

    if (step === "expiresAt") {
      const rawExpiresAt = String(
        text || ""
      ).trim();

      if (
        [
          "без срока",
          "бессрочно",
          "нет",
          "none",
        ].includes(
          rawExpiresAt.toLowerCase()
        )
      ) {
        data.expiresAt = null;
        data.expiresAtInput =
          "без срока";

        st.data = data;

        st.step =
          PROMO_CODE_STEPS.indexOf(
            "confirm"
          );

        setState(ctx.chat.id, st);

        return askPromoCodeStep(ctx);
      }

      const match = rawExpiresAt.match(
        /^(\d{2})\.(\d{2})\.(\d{4})\s+([01]\d|2[0-3]):([0-5]\d)$/
      );

      if (!match) {
        return ctx.reply(
          "❌ Неверный формат. Используйте `ДД.ММ.ГГГГ ЧЧ:ММ`, например `31.08.2026 23:59`, или отправьте `без срока`.",
          {
            parse_mode: "Markdown",
          }
        );
      }

      const day = Number(match[1]);
      const month = Number(match[2]);
      const year = Number(match[3]);
      const hours = Number(match[4]);
      const minutes = Number(match[5]);

      const probe = new Date(
        Date.UTC(
          year,
          month - 1,
          day,
          hours,
          minutes
        )
      );

      const isRealDate =
        probe.getUTCFullYear() === year &&
        probe.getUTCMonth() ===
          month - 1 &&
        probe.getUTCDate() === day &&
        probe.getUTCHours() === hours &&
        probe.getUTCMinutes() ===
          minutes;

      if (!isRealDate) {
        return ctx.reply(
          "❌ Такой даты или времени не существует."
        );
      }

      const getWarsawOffsetMinutes = (
        date
      ) => {
        const parts =
          new Intl.DateTimeFormat(
            "en-GB",
            {
              timeZone:
                "Europe/Warsaw",
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              hour12: false,
            }
          ).formatToParts(date);

        const values =
          Object.fromEntries(
            parts.map((part) => [
              part.type,
              part.value,
            ])
          );

        const warsawAsUtc =
          Date.UTC(
            Number(values.year),
            Number(values.month) - 1,
            Number(values.day),
            Number(values.hour),
            Number(values.minute),
            Number(values.second)
          );

        return Math.round(
          (
            warsawAsUtc -
            date.getTime()
          ) / 60000
        );
      };

      const requestedUtcMs =
        Date.UTC(
          year,
          month - 1,
          day,
          hours,
          minutes
        );

      let expiresAt = new Date(
        requestedUtcMs
      );

      let offsetMinutes =
        getWarsawOffsetMinutes(
          expiresAt
        );

      expiresAt = new Date(
        requestedUtcMs -
          offsetMinutes *
            60 *
            1000
      );

      const correctedOffsetMinutes =
        getWarsawOffsetMinutes(
          expiresAt
        );

      if (
        correctedOffsetMinutes !==
        offsetMinutes
      ) {
        offsetMinutes =
          correctedOffsetMinutes;

        expiresAt = new Date(
          requestedUtcMs -
            offsetMinutes *
              60 *
              1000
        );
      }

      if (
        expiresAt.getTime() <=
        Date.now()
      ) {
        return ctx.reply(
          "❌ Срок действия должен быть в будущем."
        );
      }

      data.expiresAt =
        expiresAt.toISOString();

      data.expiresAtInput =
        rawExpiresAt;

      st.data = data;

      st.step =
        PROMO_CODE_STEPS.indexOf(
          "confirm"
        );

      setState(ctx.chat.id, st);

      return askPromoCodeStep(ctx);
    }

    return askPromoCodeStep(ctx);
  }

    if (st?.mode === "cashback_grant") {
      const step = CASHBACK_GRANT_STEPS[st.step];
      if (text.startsWith("/")) return;

      if (step === "username") {
        const username = text.replace(/^@+/, "").trim();
        if (!username || username.includes(" ")) {
          return ctx.reply("❌ Введи username в формате @username или username без пробелов.");
        }

        st.data.username = `@${username}`;
        st.step = 1;
        setState(ctx.chat.id, st);
        return askCashbackGrantStep(ctx);
      }

      if (step === "amount") {
        const normalized = text.replace(",", ".");
        const amountZl = Number(normalized);
        if (!Number.isFinite(amountZl) || amountZl <= 0) {
          return ctx.reply("❌ Введи корректную сумму больше 0. Пример: 25 или 37.5");
        }

        st.data.amountZl = Number(amountZl.toFixed(2));
        st.step = 2;
        setState(ctx.chat.id, st);
        return askCashbackGrantStep(ctx);
      }
    }

    if (st?.mode === "cashback_deduct") {
      const step = CASHBACK_DEDUCT_STEPS[st.step];
      if (text.startsWith("/")) return;

      if (step === "username") {
        const username = text.replace(/^@+/, "").trim();
        if (!username || username.includes(" ")) {
          return ctx.reply("❌ Введи username в формате @username или username без пробелов.");
        }

        st.data.username = `@${username}`;
        st.step = 1;
        setState(ctx.chat.id, st);
        return askCashbackDeductStep(ctx);
      }

      if (step === "amount") {
        const normalized = text.replace(",", ".");
        const amountZl = Number(normalized);
        if (!Number.isFinite(amountZl) || amountZl <= 0) {
          return ctx.reply("❌ Введи корректную сумму больше 0. Пример: 10 или 12.5");
        }

        st.data.amountZl = Number(amountZl.toFixed(2));
        st.step = 2;
        setState(ctx.chat.id, st);
        return askCashbackDeductStep(ctx);
      }
    }

    if (st?.mode === "cashback_lookup") {
      if (text.startsWith("/")) return;

      const username = text.replace(/^@+/, "").trim();
      if (!username || username.includes(" ")) {
        return ctx.reply("❌ Введи username в формате @username или username без пробелов.");
      }

      clearState(ctx.chat.id);
      try {
        return await runCashbackLookup(ctx, username);
      } catch (e) {
        return ctx.reply(`❌ Ошибка: ${e.message}`, mainMenu(ctx));
      }
    }

    // ===== pickup points: create wizard =====
    if (st.mode === "pp_create") {
      const step = Number(st.step || 0);

      try {
        if (step === 0) {
          const parts = text.split(",").map((s) => s.trim()).filter(Boolean);
          if (parts.length < 2) return ctx.reply("❌ Формат неверный. Нужно: название, адрес");

          st.data.title = parts[0] || "";
          st.data.address = parts.slice(1).join(", ");
          setState(ctx.chat.id, st);
          return nextPickupCreateStep(ctx);
        }

        if (step === 1) {
          if (text === "-" || text.toLowerCase() === "нет") {
            st.data.allowedAdminTelegramIds = [];
          } else {
            const ids = text.split(",").map((s) => s.trim()).filter(Boolean);
            const bad = ids.find((x) => !/^\d+$/.test(x));
            if (bad) return ctx.reply("❌ ID менеджера должен быть числом (telegramId). Пример: 123456789");
            st.data.allowedAdminTelegramIds = ids;
          }

          setState(ctx.chat.id, st);
          return nextPickupCreateStep(ctx);
        }

        return ctx.reply("❌ Неожиданный шаг. Нажми Отмена и попробуй снова.");
      } catch (e) {
        return ctx.reply(`❌ ${e.message}`);
      }
    }

    // ===== Text handler for FLAVOR / QUICK STOCK =====
    if (st && isFlavorFlowMode(st.mode)) {
      const flowStep =
        st.mode === "fl_quick"
          ? FL_QUICK_STEPS[st.step]
          : FL_BUILDER_STEPS[st.step];

      try {
        if (flowStep === "bulkEdit") {
          const raw = String(text || "").trim();

          if (!raw) {
            return ctx.reply(
              "❌ Отправь хотя бы одно изменение в формате `1=10` или `Blueberry Ice=10`.",
              { parse_mode: "Markdown" }
            );
          }

          try {
            const r = await fetch(`${API_URL}/products?active=0`);
            const data = await r.json().catch(() => ({}));
            const products = data.products || [];
            const prod = products.find((p) => String(p._id) === String(st.data.productId));
            const flavors = Array.isArray(prod?.flavors) ? prod.flavors.filter((f) => f.isActive !== false) : [];

            if (!prod || !flavors.length) {
              return ctx.reply("❌ Не удалось загрузить вкусы товара.");
            }

            const byIndex = new Map();
            const byName = new Map();

            flavors.forEach((f, index) => {
              const label = String(f?.label || f?.flavorKey || "").trim();
              byIndex.set(String(index + 1), f);
              if (label) byName.set(label.toLowerCase(), f);
            });

            const lines = raw
              .split(/\r?\n/)
              .map((line) => line.trim())
              .filter(Boolean);

            const parsed = [];

            for (const line of lines) {
              const parts = line.split("=");
              if (parts.length !== 2) {
                return ctx.reply(
                  `❌ Неверный формат строки: ${line}\nИспользуй \`1=10\` или \`Blueberry Ice=10\`.`,
                  { parse_mode: "Markdown" }
                );
              }

              const left = String(parts[0] || "").trim();
              const right = String(parts[1] || "").trim();
              const qty = Number(right);

              if (!left || !Number.isFinite(qty) || qty < 0) {
                return ctx.reply(`❌ Неверное количество в строке: ${line}`);
              }

              let flavor = byIndex.get(left);
              if (!flavor) {
                flavor = byName.get(left.toLowerCase());
              }

              if (!flavor) {
                return ctx.reply(`❌ Не найден вкус: ${left}`);
              }

              parsed.push({
                flavorId: String(flavor._id || ""),
                totalQty: qty,
              });
            }

            const pointId = String(st.data.pickupPointId || "").trim();

            if (!pointId) {
              return ctx.reply("❌ Сначала выбери точку самовывоза.");
            }

            for (const row of parsed) {
              await api(`/admin/products/${st.data.productId}/flavors/${row.flavorId}/stock`, {
                method: "PATCH",
                body: JSON.stringify({
                  pickupPointId: pointId,
                  totalQty: row.totalQty,
                }),
              });
            }

            clearState(ctx.chat.id);
            return ctx.reply(
              `✅ Наличие сохранено.\n\nИзменено вкусов: ${parsed.length}`,
              mainMenu(ctx)
            );
          } catch (e) {
            return ctx.reply(`❌ Ошибка: ${e.message}`);
          }
        }

        if (st.mode === "fl_quick") {
          return next?.();
        }

        const step = FL_BUILDER_STEPS[st.step];

        // new flavor input: "label, #HEX1, #HEX2"
        if (step === "newFlavor") {
          const parts = text.split(",").map((s) => s.trim());
          if (parts.length < 3) throw new Error("Нужно: название, #ЦВЕТ1, #ЦВЕТ2");

          const label = parts[0];
          const c1 = parts[1];
          const c2 = parts[2];

          if (label.length < 2) throw new Error("Слишком короткое название вкуса");
          if (!isHex(c1) || !isHex(c2)) throw new Error("Цвета должны быть в формате #RRGGBB");

          st.data.label = label;
          st.data.gradient = [c1, c2];
          st.data.flavorKey = slugify(label);

          // дальше — выбор точки
          st.step = FL_BUILDER_STEPS.indexOf("pickupPoint");
          setState(ctx.chat.id, st);
          return askFlavorStep(ctx);
        }

        // qty
        if (step === "qty") {
          const n = Number(text.replace(/\s+/g, ""));
          if (!Number.isFinite(n) || n < 0) throw new Error("Количество должно быть числом 0+");

          st.data.totalQty = n;
          st.step = FL_BUILDER_STEPS.indexOf("confirm");
          setState(ctx.chat.id, st);
          return askFlavorStep(ctx);
        }

        return next?.();
      } catch (e) {
        return ctx.reply(`❌ ${e.message}`);
      }
    }

    if (st.mode === "pp_payment_prompt") {
      try {
        const paymentMethodPromptMeta = {
          blik: {
            label: "BLIK",
            badge: "BLIK",
            defaultDetailsValue: "+48 573 401 389",
          },
          crypto: {
            label: "Криптовалюта",
            badge: "USDT TRC20",
            defaultDetailsValue: "TGG97dKjM1nQpQkVb8Yt6vYz2w3x4c5b6a",
          },
          ua_card: {
            label: "Украинская карта",
            badge: "Перевод на карту",
            defaultDetailsValue: "5395 4182 3356 7590",
          },
          cash: {
            label: "Наличные",
            badge: "Наличные",
            defaultDetailsValue: "Оплата при получении",
          },
        };

        const methodMeta = paymentMethodPromptMeta[String(st.methodKey || "").trim()] || {
          label: "Способ оплаты",
          badge: "",
          defaultDetailsValue: "",
        };

        const detailsRaw = String(text || "").trim();

        if (!detailsRaw) {
          return ctx.reply("❌ Отправьте только реквизиты для выбранного способа оплаты.");
        }

        const data = await api(`/pickup-points?active=0`);
        const points = data.pickupPoints || [];
        const point = points.find((x) => String(x._id) === String(st.pointId));

        if (!point) {
          clearState(ctx.chat.id);
          return ctx.reply("❌ Точка не найдена", mainMenu(ctx));
        }

        const methods = Array.isArray(point?.paymentConfig?.methods)
          ? [...point.paymentConfig.methods]
          : [];

        const idx = methods.findIndex(
          (m) => String(m?.key || "") === String(st.methodKey)
        );

        const nextMethod = {
          key: st.methodKey,
          label: methodMeta.label,
          detailsValue: detailsRaw || methodMeta.defaultDetailsValue || "",
          badge: methodMeta.badge,
          isActive: idx >= 0 ? methods[idx]?.isActive !== false : true,
        };

        if (idx >= 0) methods[idx] = nextMethod;
        else methods.push(nextMethod);

        await api(`/admin/pickup-points/${st.pointId}`, {
          method: "PATCH",
          body: JSON.stringify({
            paymentConfig: { methods },
          }),
        });

        const refreshed = await api(`/pickup-points?active=0`);
        const updatedPoint = (refreshed.pickupPoints || []).find(
          (x) => String(x._id) === String(st.pointId)
        );

        clearState(ctx.chat.id);

        return ctx.reply(renderPickupPointPreview(updatedPoint), {
          parse_mode: "Markdown",
          ...ppMenuKeyboard(updatedPoint._id),
        });
      } catch (e) {
        console.error(e);
        return ctx.reply(`❌ Ошибка: ${e.message}`);
      }
    }

    // ===== pickup points: prompt edit =====
    if (st.mode === "pp_prompt") {
      // cancel
      if (text === "-") {
        clearState(ctx.chat.id);
        return ctx.reply(
          "Ок.",
          Markup.inlineKeyboard([
            [Markup.button.callback("🏪 К списку точек", "pp_list")],
            [Markup.button.callback("🏠 Меню", "cat_builder_cancel")],
          ])
        );
      }

      const field = st.field;
      const id = st.ppId;

      try {
        const patch = {};

        if (field === "title") patch.title = text;
        if (field === "address") patch.address = text;

        if (field === "sortOrder") {
          const n = Number(text);
          if (!Number.isFinite(n) || n < 0) return ctx.reply("❌ sortOrder должен быть числом 0+");
          patch.sortOrder = n;
        }

        if (field === "allowedAdminTelegramIds") {
          const ids = text.split(",").map((s) => s.trim()).filter(Boolean);
          const bad = ids.find((x) => !/^\d+$/.test(x));
          if (bad) return ctx.reply("❌ ID менеджера должен быть числом (telegramId). Пример: 123456789");
          patch.allowedAdminTelegramIds = ids;
        }

        if (field === "notificationChatId" || field === "statsChatId") {
          patch[field] = String(text || "").trim();
        }

        const updated = await api(`/admin/pickup-points/${id}`, {
          method: "PATCH",
          body: JSON.stringify(patch),
        });

        const fresh = updated?.pickupPoint || updated;
        setState(ctx.chat.id, { mode: "pp_open", ppId: id, data: fresh });

        return ctx.reply(renderPickupPointPreview(fresh), {
          parse_mode: "Markdown",
          reply_markup: (isSuperAdmin(ctx)
            ? ppMenuKeyboard(id)
            : pickupPointManagerMenu(id, {
                isSuper: false,
                pointKey: fresh?.key,
              })
          ).reply_markup,
        });
      } catch (e) {
        return ctx.reply(`❌ Ошибка: ${e.message}`);
      }
    }

    if (
      st?.mode ===
      "pp_prompt_schedule_by_date"
    ) {
      const input = String(
        ctx.message?.text || ""
      ).trim();

      const pickupPointId = String(
        st?.pickupPointId || ""
      ).trim();

      if (!pickupPointId) {
        clearState(ctx.chat.id);

        return ctx.reply(
          "❌ Точка не найдена."
        );
      }

      /*
      * Шаг 1: ввод даты.
      */
      if (st.step === "date") {
        const match = input.match(
          /^(\d{2})\.(\d{2})\.(\d{4})$/
        );

        if (!match) {
          return ctx.reply(
            "❌ Неверный формат даты. Используйте `ДД.ММ.ГГГГ`, например `21.07.2026`.",
            {
              parse_mode: "Markdown",
            }
          );
        }

        const day = Number(match[1]);
        const month = Number(match[2]);
        const year = Number(match[3]);

        const parsedDate = new Date(
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
          return ctx.reply(
            "❌ Такой даты не существует."
          );
        }

        st.step = "schedule";

        st.dateKey = [
          String(year).padStart(4, "0"),
          String(month).padStart(2, "0"),
          String(day).padStart(2, "0"),
        ].join("-");

        st.displayDate = input;

        setState(ctx.chat.id, st);

        return ctx.reply(
          [
            `🗓 *Дата:* ${input}`,
            "",
            "Введите один или несколько интервалов работы.",
            "",
            "Примеры:",
            "`12:00-20:00`",
            "`11:00-14:00, 15:00-20:00`",
            "",
            "Чтобы отметить день закрытым, отправьте:",
            "`закрыто`",
          ].join("\n"),
          {
            parse_mode: "Markdown",

            reply_markup:
              Markup.inlineKeyboard([
                [
                  Markup.button.callback(
                    "⬅️ К точке",
                    `pp_open:${pickupPointId}`
                  ),
                ],
              ]).reply_markup,
          }
        );
      }

      /*
      * Шаг 2: ввод графика.
      */
      if (st.step === "schedule") {
        const normalizedInput =
          input.toLowerCase();

        const isClosed = [
          "закрыто",
          "выходной",
          "closed",
          "off",
        ].includes(normalizedInput);

        let scheduleValue;

        if (isClosed) {
          scheduleValue = {
            isOpen: false,

            from: "",
            to: "",

            openFrom: "",
            openTo: "",

            periods: [],

            note: "закрыто",
          };
        } else {
          const rawPeriods = input
            .split(/[,;\n]+/)
            .map((value) =>
              value.trim()
            )
            .filter(Boolean);

          if (!rawPeriods.length) {
            return ctx.reply(
              "❌ Укажите график, например `12:00-20:00`.",
              {
                parse_mode:
                  "Markdown",
              }
            );
          }

          const timePattern =
            /^([01]\d|2[0-3]):([0-5]\d)\s*-\s*([01]\d|2[0-3]):([0-5]\d)$/;

          const periods = [];

          for (
            const rawPeriod of rawPeriods
          ) {
            const match =
              rawPeriod.match(
                timePattern
              );

            if (!match) {
              return ctx.reply(
                "❌ Неверный формат. Используйте `HH:MM-HH:MM`, например `12:00-20:00`.",
                {
                  parse_mode:
                    "Markdown",
                }
              );
            }

            const from =
              `${match[1]}:${match[2]}`;

            const to =
              `${match[3]}:${match[4]}`;

            const fromMinutes =
              Number(match[1]) * 60 +
              Number(match[2]);

            const toMinutes =
              Number(match[3]) * 60 +
              Number(match[4]);

            if (
              toMinutes <= fromMinutes
            ) {
              return ctx.reply(
                `❌ В интервале ${rawPeriod} время окончания должно быть позже начала.`
              );
            }

            periods.push({
              from,
              to,

              openFrom: from,
              openTo: to,

              fromMinutes,
              toMinutes,
            });
          }

          periods.sort(
            (a, b) =>
              a.fromMinutes -
              b.fromMinutes
          );

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
              return ctx.reply(
                "❌ Интервалы пересекаются. Исправьте график."
              );
            }
          }

          const cleanPeriods =
            periods.map(
              ({
                from,
                to,
                openFrom,
                openTo,
              }) => ({
                from,
                to,
                openFrom,
                openTo,
              })
            );

          scheduleValue = {
            isOpen: true,

            from:
              cleanPeriods[0].from,

            to:
              cleanPeriods[
                cleanPeriods.length - 1
              ].to,

            openFrom:
              cleanPeriods[0].from,

            openTo:
              cleanPeriods[
                cleanPeriods.length - 1
              ].to,

            periods: cleanPeriods,

            note: cleanPeriods
              .map(
                (period) =>
                  `${period.from}-${period.to}`
              )
              .join(", "),
          };
        }

        await api(

          `/admin/pickup-points/${pickupPointId}`,

          {

            method: "PATCH",

            body: JSON.stringify({

              scheduleByDatePatch: {

                [st.dateKey]: scheduleValue,

              },

            }),

          }

        );

        let freshPoint = null;

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

          freshPoint =
            points.find(
              (point) =>
                String(
                  point?._id || ""
                ) === pickupPointId
            ) || null;
        } catch (loadError) {
          console.error(
            "load pickup schedules after save error:",
            loadError
          );
        }

        const savedDate = String(
          st.displayDate ||
            st.dateKey
        );

        const allScheduleDatesText =
          formatPickupScheduleDates(
            freshPoint?.scheduleByDate || {
              [st.dateKey]: scheduleValue,
            }
          );

        clearState(ctx.chat.id);

        return ctx.reply(
          [
            "✅ *График сохранён*",
            "",
            `Дата: *${savedDate}*`,

            scheduleValue.isOpen
              ? `Время: *${scheduleValue.periods
                  .map(
                    (period) =>
                      `${period.from}-${period.to}`
                  )
                  .join(" / ")}*`
              : "Статус: *закрыто*",

            "",
            "🗓 *График на текущий месяц:*",
            allScheduleDatesText,
          ].join("\n"),
          {
            parse_mode: "Markdown",

            reply_markup:
              Markup.inlineKeyboard([
                [
                  Markup.button.callback(
                    "➕ Добавить другую дату",
                    `pp_add_schedule_date:${pickupPointId}`
                  )
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
      }
    }

    // ===== quick edit prompt inputs =====
    if (st.mode === "cat_edit_prompt") {
    const field = st.field;

    // cancel/back
    if (text === "-") {
        setState(ctx.chat.id, { ...st, mode: "cat_edit_menu" });
        return sendEditMenu(ctx);
    }

    const patch = {};

    if (field === "key") {
        if (!isValidKey(text)) {
        return ctx.reply("❌ Неверный key. Формат: a-z, 0-9, дефис. 2-32 символа.");
        }
        patch.key = text;
    }

    if (field === "title") {
        if (text.length < 2) return ctx.reply("❌ Слишком короткий title");
        patch.title = text;
    }

    if (field === "badgeText") {
        patch.badgeText = text;
    }

    if (field === "cardBgUrl") {
        if (!isValidUrl(text)) return ctx.reply("❌ Вставь нормальный URL (https://...)");
        patch.cardBgUrl = text;
    }

    if (field === "cardDuckUrl") {
        if (!isValidUrl(text)) return ctx.reply("❌ Вставь нормальный URL (https://...)");
        patch.cardDuckUrl = text;
    }

    if (field === "sortOrder") {
        const n = Number(text);
        if (Number.isNaN(n)) return ctx.reply("❌ sortOrder должен быть числом (0,1,2...)");
        patch.sortOrder = n;
    }

    try {
        const updated = await api(`/admin/categories/${st.editId}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
        });

        setState(ctx.chat.id, {
        mode: "cat_edit_menu",
        editId: st.editId,
        data: {
            key: updated.category.key || "",
            title: updated.category.title || "",
            badgeText: updated.category.badgeText || "",
            showOverlay: !!updated.category.showOverlay,
            classCardDuck: updated.category.classCardDuck || "cardImageLeft",
            titleClass: updated.category.titleClass || "cardTitle",
            cardBgUrl: updated.category.cardBgUrl || "",
            cardDuckUrl: updated.category.cardDuckUrl || "",
            sortOrder: updated.category.sortOrder || 0,
            isActive: updated.category.isActive !== false,
        },
        });

        return sendEditMenu(ctx);
    } catch (e) {
        return ctx.reply(`❌ Ошибка: ${e.message}`, mainMenu(ctx));
    }
    }


      if (st?.mode === "courier_msg") {
        const text = String(ctx.message?.text || "").trim();

        if (st.step === 0) {
          st.data.username = text.replace(/^@+/, "").trim();
          st.step = 1;
          setState(ctx.chat.id, st);
          return askCourierMessageStep(ctx);
        }

        if (st.step === 1) {
          st.data.text = text;
          st.step = 2;
          setState(ctx.chat.id, st);
          return askCourierMessageStep(ctx);
        }

        if (st.step === 2) {
          if (text !== "-") {
            return ctx.reply(
              "❌ На этом шаге прикрепите фото сообщением или отправьте '-' если фото не нужно."
            );
          }

          st.data.photoFileId = "";
          st.step = 3;
          setState(ctx.chat.id, st);
          return askCourierMessageStep(ctx);
        }
      }
    
    // ===== wizard inputs (старое поведение) =====
    if (st.mode !== "cat_builder" && st.mode !== "cat_edit") return;

    const step = BUILDER_STEPS[st.step];

  if (step === "assetsAndTitle") {
  const parts = text.split(",").map((p) => p.trim()).filter(Boolean);

  if (parts.length < 3) {
    return ctx.reply("❌ Формат неверный. Нужно так: ссылка_на_фон, ссылка_на_утку, название категории");
  }

  const bg = parts[0];
  const duck = parts[1];
  const title = parts.slice(2).join(", ");

  if (!isValidUrl(bg)) return ctx.reply("❌ Первая часть должна быть ссылкой на фон (https://...)");
  if (!isValidUrl(duck)) return ctx.reply("❌ Вторая часть должна быть ссылкой на утку (https://...)");
  if (title.length < 2) return ctx.reply("❌ Слишком короткое название категории");

  st.data.cardBgUrl = bg;
  st.data.cardDuckUrl = duck;
  st.data.title = title;

  if (!st.data.key) {
    st.data.key = translitRuToLat(st.data.title);
  }

  setState(ctx.chat.id, st);
  return nextStep(ctx);
  }

  // sortOrder
  if (step === "sortOrder") {
    const n = Number(text);
    if (Number.isNaN(n)) return ctx.reply("❌ sortOrder должен быть числом (0,1,2...)");
    st.data.sortOrder = n;
    setState(ctx.chat.id, st);
    return nextStep(ctx);
  }
});

