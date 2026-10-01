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

// ===== ask user per product step =====
export const askProductStep = async (ctx) => {
  const st = getState(ctx.chat.id);
  if (!st || st.mode !== "prod_builder") return;

  const step = PRODUCT_BUILDER_STEPS[st.step];
  const preview = renderProductPreview(st.data);

  // 1) CATEGORY (buttons from /categories)
  if (step === "category") {
    try {
      const r = await fetch(`${API_URL}/categories?active=0`);
      const data = await r.json().catch(() => ({}));
      const categories = Array.isArray(data) ? data : data.categories || [];

      if (!categories.length) {
        clearState(ctx.chat.id);
        return ctx.reply("Категорий пока нет. Сначала создай категорию.", mainMenu(ctx));
      }

      const kb = Markup.inlineKeyboard([
        ...categories
          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
          .map((c) => [
            Markup.button.callback(
              `${c.isActive ? "✅" : "⛔️"} ${c.title}`,
              `prod_set_category:${c.key}`
            ),
          ]),
        [Markup.button.callback("✖️ Отмена", "prod_builder_cancel")],
      ]);

      const caption = `${preview}\n\nВыберите *категорию* для товара:`;
      return sendStepCard(ctx, { photoUrl: PRODUCT_STEP_IMAGES.category, caption, keyboard: kb });
    } catch (e) {
      clearState(ctx.chat.id);
      return ctx.reply(`❌ Ошибка: ${e.message}`, mainMenu(ctx));
    }
  }

  // 2) TITLES (text)
  if (step === "titles") {
    const caption =
      `${preview}\n\n` +
      `Отправь *одним сообщением* через запятую:\n` +
      `*первая строка названия, вторая строка названия (или -)*\n\n` +
      `Пример:\nCHASER, FOR PODS 30 ML\nили\nSOLANA 30 ML, -`;

    return sendStepCard(ctx, { photoUrl: PRODUCT_STEP_IMAGES.titles, caption, keyboard: productNavKeyboard(st.step) });
  }

  // 3) PRICE (text)
  if (step === "price") {
    const caption = `${preview}\n\nВведите *цену* (число), пример: 55`;
    return sendStepCard(ctx, { photoUrl: PRODUCT_STEP_IMAGES.price, caption, keyboard: productNavKeyboard(st.step) });
  }

  // 4) CARD IMAGES (text)
  if (step === "cardImages") {
    const caption =
      `${preview}\n\n` +
      `Отправь *одним сообщением* через запятую:\n` +
      `*ссылка_на_фон_карточки, ссылка_на_утку_карточки*\n\n` +
      `Пример:\nhttps://...bg.png, https://...duck.png`;

    return sendStepCard(ctx, { photoUrl: PRODUCT_STEP_IMAGES.cardImages, caption, keyboard: productNavKeyboard(st.step) });
  }

  // 5) LAYOUT (buttons)  ✅ вот тут “шаг layout”
  if (step === "layout") {
    const caption = `${preview}\n\nВыберите *расположение карточки*:`;

    const kb = Markup.inlineKeyboard([
      [Markup.button.callback("Вариант 1 — утка справа", "prod_set_layout:1")],
      [Markup.button.callback("Вариант 2 — утка слева", "prod_set_layout:2")],
      [Markup.button.callback("⬅️ Назад", "prod_builder_back"), Markup.button.callback("✖️ Отмена", "prod_builder_cancel")],
    ]);

    return sendStepCard(ctx, { photoUrl: PRODUCT_STEP_IMAGES.layout, caption, keyboard: kb });
  }

  // 6) BADGE (buttons)
  if (step === "badge") {
    const caption = `${preview}\n\nХотите добавить бейдж?`;

    const kb = Markup.inlineKeyboard([
      [Markup.button.callback("NEW", "prod_set_badge:NEW"), Markup.button.callback("SALE", "prod_set_badge:SALE")],
      [Markup.button.callback("НЕ ДОБАВЛЯТЬ", "prod_set_badge:NONE")],
      [Markup.button.callback("⬅️ Назад", "prod_builder_back"), Markup.button.callback("✖️ Отмена", "prod_builder_cancel")],
    ]);

    return sendStepCard(ctx, { photoUrl: PRODUCT_STEP_IMAGES.badge, caption, keyboard: kb });
  }

  // 7) ORDER IMAGE (text)
  if (step === "orderImage") {
    const caption = `${preview}\n\nВставь *ссылку на изображение для оформления заказа* (https://...)`;
    return sendStepCard(ctx, { photoUrl: PRODUCT_STEP_IMAGES.orderImage, caption, keyboard: productNavKeyboard(st.step) });
  }

  // 8) TITLE MODAL (text)
  if (step === "titleModal") {
    const caption = `${preview}\n\nВведите *название для оформления заказа* (как в модалке)`;
    return sendStepCard(ctx, { photoUrl: PRODUCT_STEP_IMAGES.titleModal, caption, keyboard: productNavKeyboard(st.step) });
  }

  // 9) ACCENT COLOR (text)
  if (step === "accentColor") {
    const caption = `${preview}\n\nВведите *цвет (RGB)* в формате: \`32, 130, 231\``;
    return sendStepCard(ctx, { photoUrl: PRODUCT_STEP_IMAGES.accentColor, caption, keyboard: productNavKeyboard(st.step) });
  }

  // 10) SORT ORDER (text)
  if (step === "sortOrder") {
    const caption = `${preview}\n\nВведите *порядок в сетке* (0,1,2...)`;
    return sendStepCard(ctx, { photoUrl: PRODUCT_STEP_IMAGES.sortOrder, caption, keyboard: productNavKeyboard(st.step) });
  }

  // 11) IS ACTIVE (buttons)
  if (step === "isActive") {
    const caption = `${preview}\n\nТовар активен?`;

    const kb = Markup.inlineKeyboard([
      [Markup.button.callback("✅ Включить", "prod_set_isActive:true")],
      [Markup.button.callback("⛔️ Выключить", "prod_set_isActive:false")],
      [Markup.button.callback("⬅️ Назад", "prod_builder_back"), Markup.button.callback("✖️ Отмена", "prod_builder_cancel")],
    ]);

    return sendStepCard(ctx, { photoUrl: PRODUCT_STEP_IMAGES.isActive, caption, keyboard: kb });
  }

  // 12) CONFIRM (buttons)
  if (step === "confirm") {
    const caption = `${preview}\n\n*Вопрос:*\nПодтвердить создание товара?`;

    const kb = Markup.inlineKeyboard([
      [Markup.button.callback("✅ Создать", "prod_builder_confirm")],
      [Markup.button.callback("⬅️ Назад", "prod_builder_back"), Markup.button.callback("✖️ Отмена", "prod_builder_cancel")],
    ]);

    return sendStepCard(ctx, { photoUrl: PRODUCT_STEP_IMAGES.confirm, caption, keyboard: kb });
  }
};

export const nextProductStep = async (ctx) => {
  const st = getState(ctx.chat.id);
  st.step += 1;
  setState(ctx.chat.id, st);
  return askProductStep(ctx);
};

// ===== Step images (Pinata) =====
export const CAT_STEP_IMAGES = {
  variant: "https://blush-impressive-moth-462.mypinata.cloud/ipfs/bafkreicopjyvhtoec43taajyah3rsb22hriuwm4mdiamilbbqztmfldmoe",
  assetsAndTitle: "",
  sortOrder: "https://blush-impressive-moth-462.mypinata.cloud/ipfs/bafybeiaectbg64b5iud6p3thvqmciwusne4xvn2woosyso3cgqruoqx3wy",
  isActive: "https://blush-impressive-moth-462.mypinata.cloud/ipfs/bafybeibqdkr5tk6ozooh4lngx37coih63v7m2ufrspimstxccxbcuqfzke",
  confirm: "https://blush-impressive-moth-462.mypinata.cloud/ipfs/bafkreiembjot7lxn3lvjwkjc5nswqizgldije3hrib2jy5hdxkgtfnzh7q",
};


// ----- defaults for new category -----
export const defaultCategoryData = () => ({
  layoutVariant: null,
  key: "",
  title: "",
  badgeText: "",
  badgeSide: "left",
  showOverlay: false,
  classCardDuck: "cardImageLeft",
  titleClass: "cardTitle",
  cardBgUrl: "",
  cardDuckUrl: "",
  sortOrder: 0,
  isActive: true,
});

// ----- options: managers see `label`, DB stores `value` -----
export const DUCK_CLASS_OPTIONS = [
  { label: "высота 95%, слева", value: "cardImageLeft" },
  { label: "высота 60%, справа", value: "cardImageRight" },
  { label: "высота 60%, слева", value: "cardImageLeft2" },
  { label: "высота 95%, справа", value: "cardImageRight2" },
];

export const TITLE_CLASS_OPTIONS = [
  { label: "по центру", value: "cardTitle" },
  { label: "сверху", value: "cardTitle2" },
];

// ===== 4 готовых варианта карточки категории =====
export const CATEGORY_VARIANTS = [
  {
    id: 1,
    label: "ВАРИАНТ 1",
    value: { layoutVariant: 1, classCardDuck: "cardImageLeft", titleClass: "cardTitle", showOverlay: true },
  },
  {
    id: 2,
    label: "ВАРИАНТ 2",
    value: { layoutVariant: 2, classCardDuck: "cardImageRight", titleClass: "cardTitle2", showOverlay: false },
  },
  {
    id: 3,
    label: "ВАРИАНТ 3",
    value: { layoutVariant: 3, classCardDuck: "cardImageLeft2", titleClass: "cardTitle2", showOverlay: false },
  },
  {
    id: 4,
    label: "ВАРИАНТ 4",
    value: { layoutVariant: 4, classCardDuck: "cardImageRight2", titleClass: "cardTitle", showOverlay: true },
  },
];

const getVariantLabel = (v) =>
  CATEGORY_VARIANTS.find((x) => x.id === v)?.label || (v ? `ВАРИАНТ ${v}` : "—");

export const getDuckLabel = (value) =>
  DUCK_CLASS_OPTIONS.find((o) => o.value === value)?.label || value || "—";

export const getTitleLabel = (value) =>
  TITLE_CLASS_OPTIONS.find((o) => o.value === value)?.label || value || "—";

// ----- render preview text -----
export const renderCategoryPreview = (d) => {
  const lines = [];
  lines.push("🧩 *Конструктор категории — превью*");
  lines.push("");
  lines.push(`• вариант: *${getVariantLabel(d.layoutVariant)}*`);
  // lines.push(`• key: \`${d.key || "—"}\``);
  lines.push(`• title: *${d.title || "—"}*`);
  lines.push(`• badgeText: ${d.badgeText ? `*${d.badgeText}*` : "—"}`);
  lines.push(`• badgeSide: *${d.badgeText ? (d.badgeSide || "left") : "—"}*`);
  lines.push(`• showOverlay: *${d.showOverlay ? "true" : "false"}*`);
  lines.push(`• classCardDuck: ${getDuckLabel(d.classCardDuck)} (\`${d.classCardDuck}\`)`);
  lines.push(`• titleClass: ${getTitleLabel(d.titleClass)} (\`${d.titleClass}\`)`);
  lines.push(`• cardBgUrl: ${d.cardBgUrl || "—"}`);
  lines.push(`• cardDuckUrl: ${d.cardDuckUrl || "—"}`);
  lines.push(`• sortOrder: *${d.sortOrder}*`);
  lines.push(`• isActive: *${d.isActive ? "true" : "false"}*`);
  return lines.join("\n");
};

