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
import { mainMenu } from "./menu.js";
import { defaultProductData, PRODUCT_LAYOUTS } from "./categoryProductDefs.js";
import { askProductStep, nextProductStep } from "./productFlow.js";

// =====================================================
// =================== PRODUCT BUILDER =================
// =====================================================

bot.action("prod_builder_start", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("No access");
  await ctx.answerCbQuery();

  setState(ctx.chat.id, {
    mode: "prod_builder",
    step: 0,
    data: defaultProductData(),
  });

  return askProductStep(ctx);
});

bot.action("prod_builder_cancel", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("No access");
  await ctx.answerCbQuery();

  clearState(ctx.chat.id);
  return ctx.reply("Ок, отменил.", mainMenu(ctx));
});

bot.action("prod_builder_back", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("No access");
  await ctx.answerCbQuery();

  const st = getState(ctx.chat.id);
  if (!st || st.mode !== "prod_builder") return;

  st.step = Math.max(0, Number(st.step || 0) - 1);
  setState(ctx.chat.id, st);
  return askProductStep(ctx);
});

// CATEGORY
bot.action(/prod_set_category:(.+)/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("No access");
  await ctx.answerCbQuery();

  const st = getState(ctx.chat.id);
  if (!st || st.mode !== "prod_builder") return;

  st.data.categoryKey = String(ctx.match[1] || "");
  setState(ctx.chat.id, st);
  return nextProductStep(ctx);
});

// LAYOUT
bot.action(/prod_set_layout:(1|2)/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("No access");
  await ctx.answerCbQuery();

  const st = getState(ctx.chat.id);
  if (!st || st.mode !== "prod_builder") return;

  const id = Number(ctx.match[1]);
  const preset = PRODUCT_LAYOUTS.find((x) => x.id === id);
  if (!preset) return;

  st.data.classCardDuck = preset.value.classCardDuck;
  st.data.classActions = preset.value.classActions;

  setState(ctx.chat.id, st);
  return nextProductStep(ctx);
});

// BADGE
bot.action(/prod_set_badge:(NEW|SALE|NONE)/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("No access");
  await ctx.answerCbQuery();

  const st = getState(ctx.chat.id);
  if (!st || st.mode !== "prod_builder") return;

  const v = String(ctx.match[1]);
  if (v === "NONE") {
    st.data.newBadge = "";
    st.data.classNewBadge = "";
  } else {
    st.data.newBadge = v;
    // у тебя в карточках сейчас используется classNewBadge:"actionBadge sale"
    st.data.classNewBadge = "actionBadge sale";
  }

  setState(ctx.chat.id, st);
  return nextProductStep(ctx);
});

// IS ACTIVE
bot.action(/prod_set_isActive:(true|false)/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("No access");
  await ctx.answerCbQuery();

  const st = getState(ctx.chat.id);
  if (!st || st.mode !== "prod_builder") return;

  st.data.isActive = ctx.match[1] === "true";
  setState(ctx.chat.id, st);
  return nextProductStep(ctx);
});

// CONFIRM -> POST /admin/products
bot.action("prod_builder_confirm", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("No access");
  await ctx.answerCbQuery();

  const st = getState(ctx.chat.id);
  if (!st || st.mode !== "prod_builder") return;

  try {
    // минимальная валидация
    if (!st.data.categoryKey) throw new Error("Не выбрана категория");
    if (!st.data.title1) throw new Error("Нет названия (строка 1)");
    if (!st.data.price || Number(st.data.price) <= 0) throw new Error("Цена должна быть больше 0");
    if (!st.data.cardBgUrl || !isValidUrl(st.data.cardBgUrl)) throw new Error("Неверная ссылка на фон");
    if (!st.data.cardDuckUrl || !isValidUrl(st.data.cardDuckUrl)) throw new Error("Неверная ссылка на утку");
    if (!st.data.orderImgUrl || !isValidUrl(st.data.orderImgUrl)) throw new Error("Неверная ссылка на картинку оформления");

    const payload = {
      categoryKey: st.data.categoryKey,

      title1: st.data.title1,
      title2: st.data.title2,
      titleModal: st.data.titleModal,
      price: Number(st.data.price || 0),

      cardBgUrl: st.data.cardBgUrl,
      cardDuckUrl: st.data.cardDuckUrl,
      orderImgUrl: st.data.orderImgUrl,

      classCardDuck: st.data.classCardDuck,
      classActions: st.data.classActions,

      classNewBadge: st.data.classNewBadge,
      newBadge: st.data.newBadge,

      accentColor: st.data.accentColor,

      sortOrder: Number(st.data.sortOrder || 0),
      isActive: st.data.isActive !== false,

      flavors: [], // вкусы добавим отдельным конструктором
    };

    const created = await api("/admin/products", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    clearState(ctx.chat.id);
    return ctx.reply(`✅ Товар создан: ${created?.product?.title1 || "OK"}`, mainMenu(ctx));
  } catch (e) {
    return ctx.reply(`❌ Ошибка: ${e.message}`, mainMenu(ctx));
  }
});

// ===== Text steps handler for product wizard =====
bot.on("text", async (ctx, next) => {
  const st = getState(ctx.chat.id);
  if (!st || st.mode !== "prod_builder") return next();

  const step = PRODUCT_BUILDER_STEPS[st.step];
  const text = String(ctx.message?.text || "").trim();

  try {
    if (step === "titles") {
      const parts = text.split(",").map((s) => s.trim());
      if (parts.length < 2) throw new Error("Нужно 2 значения через запятую");

      st.data.title1 = parts[0] || "";
      st.data.title2 = parts[1] === "-" ? "" : (parts[1] || "");

      setState(ctx.chat.id, st);
      return nextProductStep(ctx);
    }

    if (step === "price") {
      const n = Number(text.replace(/\s+/g, ""));
      if (!Number.isFinite(n) || n <= 0) throw new Error("Цена должна быть числом больше 0");

      st.data.price = n;
      setState(ctx.chat.id, st);
      return nextProductStep(ctx);
    }

    if (step === "cardImages") {
      const parts = text.split(",").map((s) => s.trim());
      if (parts.length < 2) throw new Error("Нужно 2 ссылки через запятую");

      const bg = parts[0];
      const duck = parts[1];

      if (!isValidUrl(bg)) throw new Error("Ссылка на фон некорректная");
      if (!isValidUrl(duck)) throw new Error("Ссылка на утку некорректная");

      st.data.cardBgUrl = bg;
      st.data.cardDuckUrl = duck;

      setState(ctx.chat.id, st);
      return nextProductStep(ctx);
    }

    if (step === "orderImage") {
      if (!isValidUrl(text)) throw new Error("Ссылка некорректная");
      st.data.orderImgUrl = text;

      setState(ctx.chat.id, st);
      return nextProductStep(ctx);
    }

    if (step === "titleModal") {
      if (text.length < 2) throw new Error("Название слишком короткое");
      st.data.titleModal = text;

      setState(ctx.chat.id, st);
      return nextProductStep(ctx);
    }

    if (step === "accentColor") {
      const m = text.match(/^\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*$/);
      if (!m) throw new Error("Формат: 32, 130, 231");

      const r = Number(m[1]);
      const g = Number(m[2]);
      const b = Number(m[3]);

      if ([r, g, b].some((x) => x < 0 || x > 255)) throw new Error("RGB должен быть 0..255");

      st.data.accentColor = `${r}, ${g}, ${b}`;
      setState(ctx.chat.id, st);
      return nextProductStep(ctx);
    }

    if (step === "sortOrder") {
      const n = Number(text);
      if (!Number.isFinite(n) || n < 0) throw new Error("sortOrder должен быть числом 0+");

      st.data.sortOrder = n;
      setState(ctx.chat.id, st);
      return nextProductStep(ctx);
    }

    return next();
  } catch (e) {
    return ctx.reply(`❌ ${e.message}`);
  }
});
