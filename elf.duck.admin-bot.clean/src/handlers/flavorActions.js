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
  FL_BUILDER_STEPS,
  FL_QUICK_STEPS,
  isFlavorFlowMode,
  defaultFlavorBuilderData,
  askFlavorStep,
  askQuickStockStep,
  nextFlavorStep,
  slugify,
  isHex,
  fetchMyPickupPoints,
} from "./flavorFlow.js";
import { mainMenu } from "./menu.js";

// =====================================================
// ================== FLAVOR BUILDER ACTIONS ============
// =====================================================

bot.action("fl_quick_start", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("No access");
  await ctx.answerCbQuery();

  setState(ctx.chat.id, {
    mode: "fl_quick",
    step: 0,
    data: { ...defaultFlavorBuilderData(), mode: "stock" },
  });

  return askQuickStockStep(ctx);
});

bot.action("fl_builder_start", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("No access");
  await ctx.answerCbQuery();

  setState(ctx.chat.id, {
    mode: "fl_builder",
    step: 0,
    data: defaultFlavorBuilderData(),
  });

  return askFlavorStep(ctx);
});

bot.action("fl_cancel", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("No access");
  await ctx.answerCbQuery();

  clearState(ctx.chat.id);
  return ctx.reply("Ок, отменил.", mainMenu(ctx));
});

bot.action("fl_back", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("No access");
  await ctx.answerCbQuery();

  const st = getState(ctx.chat.id);
  if (!st || !isFlavorFlowMode(st.mode)) return;

  if (st.mode === "fl_quick") {
    const currentStep = FL_QUICK_STEPS[st.step];

    if (currentStep === "product" && st.data?.categoryKey) {
      st.data.categoryKey = "";
      st.data.categoryTitle = "";
      st.data.productId = "";
      st.data.productTitle = "";
      setState(ctx.chat.id, st);
      return askQuickStockStep(ctx);
    }

    if (currentStep === "product") {
      st.step = FL_QUICK_STEPS.indexOf("pickupPoint");
      setState(ctx.chat.id, st);
      return askQuickStockStep(ctx);
    }

    st.step = Math.max(0, Number(st.step || 0) - 1);
    setState(ctx.chat.id, st);
    return askQuickStockStep(ctx);
  }

  const currentStep = FL_BUILDER_STEPS[st.step];

  // Меню модели -> список товаров выбранной категории
  if (currentStep === "mode") {
    st.data.productId = "";
    st.data.productTitle = "";
    st.data.mode = "";

    st.step = FL_BUILDER_STEPS.indexOf("product");

    setState(ctx.chat.id, st);
    return askFlavorStep(ctx);
  }

  // Список товаров -> список категорий
  if (currentStep === "product") {
    st.data.categoryKey = "";
    st.data.categoryTitle = "";
    st.data.productId = "";
    st.data.productTitle = "";
    st.data.mode = "";

    st.step = FL_BUILDER_STEPS.indexOf("product");

    setState(ctx.chat.id, st);
    return askFlavorStep(ctx);
  }

  // На остальных шагах возвращаемся на один шаг назад
  st.step = Math.max(0, Number(st.step || 0) - 1);

  setState(ctx.chat.id, st);
  return askFlavorStep(ctx);
});

bot.action(/^fl_category:(.+)$/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("No access");
  await ctx.answerCbQuery();

  const st = getState(ctx.chat.id);
  if (!st || !isFlavorFlowMode(st.mode)) return;

  const categoryKey = String(ctx.match[1] || "");

  try {
    const r = await fetch(`${API_URL}/categories?active=0`);
    const data = await r.json().catch(() => ({}));

    const categories = Array.isArray(data)
      ? data
      : data.categories || [];

    const category = categories.find(
      (c) => String(c.key) === categoryKey
    );

    st.data.categoryKey = categoryKey;
    st.data.categoryTitle = category?.title || "";

    st.data.productId = "";
    st.data.productTitle = "";
    st.data.mode = "";

    setState(ctx.chat.id, st);

    if (st.mode === "fl_quick") return askQuickStockStep(ctx);
    return askFlavorStep(ctx);
  } catch (e) {
    console.error(e);
    return ctx.reply("❌ Не удалось загрузить категории.");
  }
});

bot.action("fl_category_back", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("No access");
  await ctx.answerCbQuery();

  const st = getState(ctx.chat.id);
  if (!st || !isFlavorFlowMode(st.mode)) return;

  st.data.categoryKey = "";
  st.data.categoryTitle = "";

  st.data.productId = "";
  st.data.productTitle = "";
  st.data.mode = "";

  setState(ctx.chat.id, st);

  if (st.mode === "fl_quick") return askQuickStockStep(ctx);
  return askFlavorStep(ctx);
});

bot.action(/fl_pick_product:(.+)/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("No access");
  await ctx.answerCbQuery();

  const productId = String(ctx.match[1] || "");
  const st = getState(ctx.chat.id);
  if (!st || !isFlavorFlowMode(st.mode)) return;

  // найдём title для превью
  const r = await fetch(`${API_URL}/products?active=0`);
  const data = await r.json().catch(() => ({}));
  const products = data.products || [];
  const prod = products.find((p) => String(p._id) === productId);

  st.data.productId = productId;
  st.data.productTitle = prod ? `${prod.title1 || ""} ${prod.title2 || ""}`.trim() : productId;

  setState(ctx.chat.id, st);

  if (st.mode === "fl_quick") {
    st.step = FL_QUICK_STEPS.indexOf("bulkEdit");
    setState(ctx.chat.id, st);
    return askQuickStockStep(ctx);
  }

  return nextFlavorStep(ctx);
});

bot.action(/^fl_delete_ask:(.+)$/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("No access");
  await ctx.answerCbQuery();

  const st = getState(ctx.chat.id);
  if (!st || st.mode !== "fl_builder") return;

  const productId = String(ctx.match[1] || "");

  return ctx.reply(
    `❌ *Удалить модель?*

*${st.data.productTitle || "Модель"}*

Будут удалены:

• модель
• все вкусы
• все остатки

Это действие необратимо.`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback(
            "✅ Да, удалить",
            `fl_delete_confirm:${productId}`
          ),
        ],
        [
          Markup.button.callback(
            "⬅️ Отмена",
            "fl_delete_cancel"
          ),
        ],
      ]),
    }
  );
});

bot.action("fl_delete_cancel", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("No access");
  await ctx.answerCbQuery();

  const st = getState(ctx.chat.id);
  if (!st || st.mode !== "fl_builder") return;

  st.step = FL_BUILDER_STEPS.indexOf("mode");

  setState(ctx.chat.id, st);

  return askFlavorStep(ctx);
});

bot.action(/^fl_delete_confirm:(.+)$/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("No access");
  await ctx.answerCbQuery();

  const productId = String(ctx.match[1] || "");

  const st = getState(ctx.chat.id);
  if (!st || st.mode !== "fl_builder") return;

  try {
    await api(`/admin/products/${productId}`, {
      method: "DELETE",
    });

    st.data.productId = "";
    st.data.productTitle = "";
    st.data.mode = "";

    st.step = FL_BUILDER_STEPS.indexOf("product");

    setState(ctx.chat.id, st);

    await ctx.reply("✅ Модель удалена.");

    return askFlavorStep(ctx);
  } catch (e) {
    console.error(e);

    return ctx.reply(
      `❌ Ошибка удаления:\n${e.message}`
    );
  }
});

bot.action(/fl_set_mode:(new|stock)/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("No access");
  await ctx.answerCbQuery();

  const st = getState(ctx.chat.id);
  if (!st || st.mode !== "fl_builder") return;

  const mode = String(ctx.match[1]);
  st.data.mode = mode;

  // если new -> шаг newFlavor, если stock -> шаг pickFlavor
  st.step = mode === "new"
    ? FL_BUILDER_STEPS.indexOf("newFlavor")
    : FL_BUILDER_STEPS.indexOf("pickFlavor");

  setState(ctx.chat.id, st);
  return askFlavorStep(ctx);
});

bot.action("fl_bulk_edit_start", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("No access");
  await ctx.answerCbQuery();

  const st = getState(ctx.chat.id);
  if (!st || st.mode !== "fl_builder") return;

  st.data.bulkEditText = "";
  st.data.bulkEdits = [];
  st.step = st.data.pickupPointId
    ? FL_BUILDER_STEPS.indexOf("bulkEdit")
    : FL_BUILDER_STEPS.indexOf("pickupPoint");
  setState(ctx.chat.id, st);
  return askFlavorStep(ctx);
});

bot.action(/fl_pick_flavor:(.+)/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("No access");
  await ctx.answerCbQuery();

  const flavorId = String(ctx.match[1] || "");
  const st = getState(ctx.chat.id);
  if (!st || st.mode !== "fl_builder") return;

  // подцепим label/gradient чтобы показывать в превью
  const r = await fetch(`${API_URL}/products?active=0`);
  const data = await r.json().catch(() => ({}));
  const products = data.products || [];
  const prod = products.find((p) => String(p._id) === String(st.data.productId));
  const fl = (prod?.flavors || []).find((f) => String(f._id) === flavorId);

  st.data.flavorId = flavorId;
  st.data.label = fl?.label || "";
  st.data.flavorKey = fl?.flavorKey || "";
  st.data.gradient = Array.isArray(fl?.gradient) ? fl.gradient : ["", ""];

  // дальше — точка
  st.step = FL_BUILDER_STEPS.indexOf("pickupPoint");
  setState(ctx.chat.id, st);
  return askFlavorStep(ctx);
});

bot.action(/fl_pick_point:(.+)/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("No access");
  await ctx.answerCbQuery();

  const id = String(ctx.match[1] || "");
  const st = getState(ctx.chat.id);
  if (!st || !isFlavorFlowMode(st.mode)) return;

  const points = await fetchMyPickupPoints(ctx);
  const p = points.find((x) => String(x._id) === id);

  st.data.pickupPointId = id;
  st.data.pickupPointLabel = p?.title || p?.address || "—";

  if (st.mode === "fl_quick") {
    st.step = FL_QUICK_STEPS.indexOf("product");
    setState(ctx.chat.id, st);
    return askQuickStockStep(ctx);
  }

  if (Array.isArray(st.data.bulkEdits) && st.data.bulkEdits.length) {
    try {
      for (const row of st.data.bulkEdits) {
        await api(`/admin/products/${st.data.productId}/flavors/${row.flavorId}/stock`, {
          method: "PATCH",
          body: JSON.stringify({
            pickupPointId: st.data.pickupPointId,
            totalQty: row.totalQty,
          }),
        });
      }

      clearState(ctx.chat.id);
      return ctx.reply(
        `✅ Массовое изменение сохранено.\n\nИзменено вкусов: ${st.data.bulkEdits.length}`,
        mainMenu(ctx)
      );
    } catch (e) {
      return ctx.reply(`❌ Ошибка: ${e.message}`);
    }
  }

  

  // дальше qty
  if (FL_BUILDER_STEPS[st.step] === "pickupPoint" && st.data.mode === "stock" && !st.data.flavorId) {
    st.step = FL_BUILDER_STEPS.indexOf("bulkEdit");
    setState(ctx.chat.id, st);
    return askFlavorStep(ctx);
  }

  // дальше qty
  st.step = FL_BUILDER_STEPS.indexOf("qty");
  setState(ctx.chat.id, st);
  return askFlavorStep(ctx);
});

bot.action("fl_confirm", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("No access");
  await ctx.answerCbQuery();

  const st = getState(ctx.chat.id);
  if (!st || st.mode !== "fl_builder") return;

  try {
    const d = st.data;

    if (!d.productId) throw new Error("Не выбран товар");
    if (!d.pickupPointId) throw new Error("Не выбрана точка");
    if (!Number.isFinite(Number(d.totalQty)) || Number(d.totalQty) < 0) throw new Error("Некорректное количество");

    let flavorId = d.flavorId;

    // 1) если новый вкус — создаём вкус
    if (d.mode === "new") {
      if (!d.label) throw new Error("Нет названия вкуса");
      if (!isHex(d.gradient?.[0]) || !isHex(d.gradient?.[1])) throw new Error("Цвета должны быть #RRGGBB");

      const flavorKey = d.flavorKey || slugify(d.label);

      const created = await api(`/admin/products/${d.productId}/flavors`, {
        method: "POST",
        body: JSON.stringify({
          flavorKey,
          label: d.label,
          gradient: [d.gradient[0], d.gradient[1]],
          isActive: true,
        }),
      });

      const prod = created.product || created?.data?.product || created; // на всякий
      const found = (prod.flavors || []).find((f) => String(f.flavorKey) === String(flavorKey));
      if (!found?._id) throw new Error("Не смог найти созданный вкус в ответе сервера");
      flavorId = String(found._id);
    }

    if (!flavorId) throw new Error("Не выбран вкус");

    // 2) выставляем остаток по точке
    await api(`/admin/products/${d.productId}/flavors/${flavorId}/stock`, {
      method: "PATCH",
      body: JSON.stringify({
        pickupPointId: d.pickupPointId,
        totalQty: Number(d.totalQty),
        updatedByTelegramId: String(ctx.from?.id || ""),
      }),
    });

    clearState(ctx.chat.id);
    return ctx.reply("✅ Готово! Вкус/наличие сохранены.", mainMenu(ctx));
  } catch (e) {
    return ctx.reply(`❌ Ошибка: ${e.message}`);
  }
});

