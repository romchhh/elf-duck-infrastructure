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
import { BUILDER_STEPS } from "./categoryProductDefs.js";
import { CATEGORY_VARIANTS } from "./productFlow.js";

// ==================== CATEGORY EDIT ===================

bot.action("cat_edit_start", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("No access");
  await ctx.answerCbQuery();

  try {
    const r = await fetch(`${API_URL}/categories?active=0`);
    const data = await r.json().catch(() => ({}));
    const categories = Array.isArray(data) ? data : data.categories || [];

    if (!categories.length) return ctx.reply("Категорий пока нет", mainMenu(ctx));

    return ctx.reply(
      "Выберите категорию для редактирования:",
      Markup.inlineKeyboard(
        categories.map((c) => [
          Markup.button.callback(
            `${c.isActive ? "✅" : "⛔️"} ${c.title}`,
            `cat_edit_pick:${c._id}`
          ),
        ])
      )
    );
  } catch (e) {
    return ctx.reply(`❌ Ошибка: ${e.message}`, mainMenu(ctx));
  }
});

bot.action(/cat_edit_pick:(.+)/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("No access");
  await ctx.answerCbQuery();

  const id = ctx.match[1];

  const r = await fetch(`${API_URL}/categories?active=0`);
  const data = await r.json().catch(() => ({}));
  const categories = Array.isArray(data) ? data : data.categories || [];
  const cat = categories.find((c) => String(c._id) === String(id));

  if (!cat) return ctx.reply("Категория не найдена", mainMenu(ctx));

    setState(ctx.chat.id, {
    mode: "cat_edit_menu",
    editId: id,
    data: {
        key: cat.key || "",
        title: cat.title || "",
        badgeText: cat.badgeText || "",
        showOverlay: !!cat.showOverlay,
        classCardDuck: cat.classCardDuck || "cardImageLeft",
        titleClass: cat.titleClass || "cardTitle",
        cardBgUrl: cat.cardBgUrl || "",
        cardDuckUrl: cat.cardDuckUrl || "",
        sortOrder: cat.sortOrder || 0,
        isActive: cat.isActive !== false,
    },
    });

  return sendEditMenu(ctx);
});

bot.action("cat_edit_open_wizard", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("No access");
  await ctx.answerCbQuery();

  const st = getState(ctx.chat.id);
  if (!st || st.mode !== "cat_edit_menu") return;

  setState(ctx.chat.id, {
    mode: "cat_edit",
    step: 0,
    editId: st.editId,
    data: { ...st.data },
  });

  return askStep(ctx);
});

bot.action(/cat_builder_set_variant:(1|2|3|4)/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("No access");
  await ctx.answerCbQuery();

  const st = getState(ctx.chat.id);
  if (!st || (st.mode !== "cat_builder" && st.mode !== "cat_edit")) return;

  const id = Number(ctx.match[1]);
  const preset = CATEGORY_VARIANTS.find((v) => v.id === id);
  if (!preset) return;

  st.data.layoutVariant = id;
  st.data.classCardDuck = preset.value.classCardDuck;
  st.data.titleClass = preset.value.titleClass;
  st.data.showOverlay = preset.value.showOverlay;

  setState(ctx.chat.id, st);
  return nextStep(ctx);
});

// SALE/NEW DROP + side
bot.action(/cat_builder_set_badge:(SALE|NEW DROP):(left|right)/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("No access");
  await ctx.answerCbQuery();

  const st = getState(ctx.chat.id);
  if (!st || (st.mode !== "cat_builder" && st.mode !== "cat_edit")) return;

  st.data.badgeText = ctx.match[1];
  st.data.badgeSide = ctx.match[2] === "right" ? "right" : "left";

  setState(ctx.chat.id, st);
  return nextStep(ctx);
});

// NONE
bot.action("cat_builder_set_badge:NONE", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("No access");
  await ctx.answerCbQuery();

  const st = getState(ctx.chat.id);
  if (!st || (st.mode !== "cat_builder" && st.mode !== "cat_edit")) return;

  st.data.badgeText = "";
  st.data.badgeSide = "left";

  setState(ctx.chat.id, st);
  return nextStep(ctx);
});

bot.action("cat_edit_toggle_isActive", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("No access");
  await ctx.answerCbQuery();

  const st = getState(ctx.chat.id);
  if (!st || st.mode !== "cat_edit_menu") return;

  const nextVal = !st.data.isActive;

  try {
    const updated = await api(`/admin/categories/${st.editId}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive: nextVal }),
    });

    st.data.isActive = updated.category.isActive !== false;
    setState(ctx.chat.id, st);
    return sendEditMenu(ctx);
  } catch (e) {
    return ctx.reply(`❌ Ошибка: ${e.message}`, mainMenu(ctx));
  }
});

bot.action("cat_edit_toggle_overlay", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("No access");
  await ctx.answerCbQuery();

  const st = getState(ctx.chat.id);
  if (!st || st.mode !== "cat_edit_menu") return;

  const nextVal = !st.data.showOverlay;

  try {
    const updated = await api(`/admin/categories/${st.editId}`, {
      method: "PATCH",
      body: JSON.stringify({ showOverlay: nextVal }),
    });

    st.data.showOverlay = !!updated.category.showOverlay;
    setState(ctx.chat.id, st);
    return sendEditMenu(ctx);
  } catch (e) {
    return ctx.reply(`❌ Ошибка: ${e.message}`, mainMenu(ctx));
  }
});

bot.action(/cat_edit_prompt:(key|title|badgeText|cardBgUrl|cardDuckUrl|sortOrder)/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("No access");
  await ctx.answerCbQuery();

  const st = getState(ctx.chat.id);
  if (!st || st.mode !== "cat_edit_menu") return;

  const field = ctx.match[1];
  setState(ctx.chat.id, { ...st, mode: "cat_edit_prompt", field });

  const prompts = {
    key: "Введите новый *key* (a-z/0-9/-, 2-32) или `-` чтобы отменить",
    title: "Введите новый *title* или `-` чтобы отменить",
    badgeText: "Введите новый *badgeText* (или `-` чтобы отменить)",
    cardBgUrl: "Вставьте новый *cardBgUrl* (https://...) или `-` чтобы отменить",
    cardDuckUrl: "Вставьте новый *cardDuckUrl* (https://...) или `-` чтобы отменить",
    sortOrder: "Введите новый *sortOrder* (число) или `-` чтобы отменить",
  };

  return ctx.reply(prompts[field], { parse_mode: "Markdown" });
});

bot.action("cat_edit_pick_classDuck", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("No access");
  await ctx.answerCbQuery();

  const st = getState(ctx.chat.id);
  if (!st || st.mode !== "cat_edit_menu") return;

  return ctx.reply(
    "Выберите classCardDuck:",
    Markup.inlineKeyboard([
      ...DUCK_CLASS_OPTIONS.map((o) => [Markup.button.callback(o.label, `cat_edit_set_classDuck:${o.value}`)]),
      [Markup.button.callback("⬅️ Назад", "cat_edit_back_to_menu")],
    ])
  );
});

bot.action(/cat_edit_set_classDuck:(.+)/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("No access");
  await ctx.answerCbQuery();

  const st = getState(ctx.chat.id);
  if (!st || st.mode !== "cat_edit_menu") return;

  const val = ctx.match[1];
  const nextVal = DUCK_CLASS_OPTIONS.some((o) => o.value === val) ? val : "cardImageLeft";

  try {
    const updated = await api(`/admin/categories/${st.editId}`, {
      method: "PATCH",
      body: JSON.stringify({ classCardDuck: nextVal }),
    });

    st.data.classCardDuck = updated.category.classCardDuck || nextVal;
    setState(ctx.chat.id, st);
    return sendEditMenu(ctx);
  } catch (e) {
    return ctx.reply(`❌ Ошибка: ${e.message}`, mainMenu(ctx));
  }
});

bot.action("cat_edit_pick_titleClass", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("No access");
  await ctx.answerCbQuery();

  const st = getState(ctx.chat.id);
  if (!st || st.mode !== "cat_edit_menu") return;

  return ctx.reply(
    "Выберите titleClass:",
    Markup.inlineKeyboard([
      ...TITLE_CLASS_OPTIONS.map((o) => [Markup.button.callback(o.label, `cat_edit_set_titleClass:${o.value}`)]),
      [Markup.button.callback("⬅️ Назад", "cat_edit_back_to_menu")],
    ])
  );
});

bot.action(/cat_edit_set_titleClass:(.+)/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("No access");
  await ctx.answerCbQuery();

  const st = getState(ctx.chat.id);
  if (!st || st.mode !== "cat_edit_menu") return;

  const val = ctx.match[1];
  const nextVal = TITLE_CLASS_OPTIONS.some((o) => o.value === val) ? val : "cardTitle";

  try {
    const updated = await api(`/admin/categories/${st.editId}`, {
      method: "PATCH",
      body: JSON.stringify({ titleClass: nextVal }),
    });

    st.data.titleClass = updated.category.titleClass || nextVal;
    setState(ctx.chat.id, st);
    return sendEditMenu(ctx);
  } catch (e) {
    return ctx.reply(`❌ Ошибка: ${e.message}`, mainMenu(ctx));
  }
});

bot.action("cat_edit_back_to_menu", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("No access");
  await ctx.answerCbQuery();
  return sendEditMenu(ctx);
});

// =====================================================
// ==================== CATEGORY LIST ===================
// =====================================================
bot.action("cat_list", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("No access");
  await ctx.answerCbQuery();

  try {
    const r = await fetch(`${API_URL}/categories?active=0`);
    const data = await r.json().catch(() => ({}));
    const categories = Array.isArray(data) ? data : data.categories || [];

    if (!categories.length) return ctx.reply("Категорий пока нет", mainMenu(ctx));

    const msg = categories
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((c) => `${c.isActive ? "✅" : "⛔️"} ${c.title} (${c.key})`)
      .join("\n");

    return ctx.reply(msg, mainMenu(ctx));
  } catch (e) {
    return ctx.reply(`❌ Ошибка: ${e.message}`, mainMenu(ctx));
  }
});

