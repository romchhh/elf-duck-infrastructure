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
import {
  CAT_STEP_IMAGES,
  renderCategoryPreview,
  getDuckLabel,
  getTitleLabel,
} from "./productFlow.js";
import {
  renderPickupPointPreview,
  ppListKeyboard,
} from "./pickupPointHelpers.js";

export { ppListKeyboard } from "./pickupPointHelpers.js";

// =====================================================
// =================== PICKUP POINTS ===================
// ====================================================

export const askPickupCreateStep = async (ctx) => {
  const st = getState(ctx.chat.id);
  if (!st || st.mode !== "pp_create") return;

  const step = Number(st.step || 0);

  // step 0: title,address
  if (step === 0) {
    const caption =
      "🏪 *Создание точки самовывоза*\n\n" +
      "Отправь *одним сообщением* через запятую:\n" +
      "*название, адрес*\n\n" +
      "Пример:\nKrucza, ul. Krucza 03, Śródmieście";

    return sendStepCard(ctx, {
      photoUrl: "",
      caption,
      keyboard: Markup.inlineKeyboard([[Markup.button.callback("✖️ Отмена", "pp_cancel")]]),
    });
  }

  // step 1: managers ids
  if (step === 1) {
    const d = st.data || {};
    const caption =
      `${renderPickupPointPreview(d)}\n\n` +
      "Вставь *ID менеджеров* через запятую (telegramId).\n" +
      "Если никого не добавлять — отправь `-`.\n\n" +
      "Пример:\n123456789, 987654321";

    return sendStepCard(ctx, {
      photoUrl: "",
      caption,
      keyboard: Markup.inlineKeyboard([
        [Markup.button.callback("⬅️ Назад", "pp_back"), Markup.button.callback("✖️ Отмена", "pp_cancel")],
      ]),
    });
  }

  // step 2: confirm
  if (step === 2) {
    const d = st.data || {};
    const caption = `${renderPickupPointPreview(d)}\n\n*Вопрос:*\nПодтвердить создание точки?`;

    return sendStepCard(ctx, {
      photoUrl: "",
      caption,
      keyboard: Markup.inlineKeyboard([
        [Markup.button.callback("✅ Создать", "pp_create_confirm")],
        [Markup.button.callback("⬅️ Назад", "pp_back"), Markup.button.callback("✖️ Отмена", "pp_cancel")],
      ]),
    });
  }
};

export const nextPickupCreateStep = async (ctx) => {
  const st = getState(ctx.chat.id);
  if (!st || st.mode !== "pp_create") return;
  st.step = Number(st.step || 0) + 1;
  setState(ctx.chat.id, st);
  return askPickupCreateStep(ctx);
};

// ----- quick edit menu (no wizard) -----
const renderEditMenuText = (d) => {
  const lines = [];
  lines.push("✏️ *Редактирование категории*");
  lines.push("");
  lines.push(`• key: \`${d.key || "—"}\``);
  lines.push(`• title: *${d.title || "—"}*`);
  lines.push(`• badgeText: ${d.badgeText ? `*${d.badgeText}*` : "—"}`);
  lines.push(`• showOverlay: *${d.showOverlay ? "true" : "false"}*`);
  lines.push(`• classCardDuck: ${getDuckLabel(d.classCardDuck)} (\`${d.classCardDuck || "—"}\`)`);
  lines.push(`• titleClass: ${getTitleLabel(d.titleClass)} (\`${d.titleClass || "—"}\`)`);
  lines.push(`• cardBgUrl: ${d.cardBgUrl || "—"}`);
  lines.push(`• cardDuckUrl: ${d.cardDuckUrl || "—"}`);
  lines.push(`• sortOrder: *${d.sortOrder ?? 0}*`);
  lines.push(`• isActive: *${d.isActive ? "true" : "false"}*`);
  lines.push("");
  lines.push("Выбери, что поменять:");
  return lines.join("\n");
};

const editMenuKeyboard = () =>
  Markup.inlineKeyboard([
    [
      Markup.button.callback("🟢/🔴 isActive", "cat_edit_toggle_isActive"),
      Markup.button.callback("🌓 overlay", "cat_edit_toggle_overlay"),
    ],
    [
      Markup.button.callback("📝 title", "cat_edit_prompt:title"),
      Markup.button.callback("🔑 key", "cat_edit_prompt:key"),
    ],
    [
      Markup.button.callback("🏷 badgeText", "cat_edit_prompt:badgeText"),
      Markup.button.callback("🔢 sortOrder", "cat_edit_prompt:sortOrder"),
    ],
    [Markup.button.callback("🖼 фон (cardBgUrl)", "cat_edit_prompt:cardBgUrl")],
    [Markup.button.callback("🦆 утка (cardDuckUrl)", "cat_edit_prompt:cardDuckUrl")],
    [
      Markup.button.callback("📐 classCardDuck", "cat_edit_pick_classDuck"),
      Markup.button.callback("🔤 titleClass", "cat_edit_pick_titleClass"),
    ],
    [Markup.button.callback("🧩 Открыть конструктор", "cat_edit_open_wizard")],
    [
      Markup.button.callback("⬅️ К списку", "cat_edit_start"),
      Markup.button.callback("🏠 Меню", "cat_builder_cancel"),
    ],
  ]);

export const sendEditMenu = async (ctx) => {
  const st = getState(ctx.chat.id);
  if (!st || st.mode !== "cat_edit_menu") return;

  return ctx.replyWithMarkdownV2(
    renderEditMenuText(st.data).replace(/[-.()]/g, "\\$&"),
    editMenuKeyboard()
  );
};

const builderNavKeyboard = (stepIndex) => {
  const backBtn = stepIndex > 0 ? Markup.button.callback("⬅️ Назад", "cat_builder_back") : null;
  const cancelBtn = Markup.button.callback("✖️ Отмена", "cat_builder_cancel");

  if (backBtn) return Markup.inlineKeyboard([[backBtn, cancelBtn]]);
  return Markup.inlineKeyboard([[cancelBtn]]);
};

// ----- ask user per step -----
export const askStep = async (ctx) => {
  const st = getState(ctx.chat.id);
  const step = BUILDER_STEPS[st.step];

  const preview = renderCategoryPreview(st.data);
  const navKb = builderNavKeyboard(st.step);

  // Текст вопроса для каждого шага
  let question = "";

  if (step === "variant") {
    const caption = `${preview}\n\nВыберите *вариант карточки* (готовая разметка):`;
    const kb = Markup.inlineKeyboard([
      [
        Markup.button.callback("ВАРИАНТ 1", "cat_builder_set_variant:1"),
        Markup.button.callback("ВАРИАНТ 2", "cat_builder_set_variant:2"),
      ],
      [
        Markup.button.callback("ВАРИАНТ 3", "cat_builder_set_variant:3"),
        Markup.button.callback("ВАРИАНТ 4", "cat_builder_set_variant:4"),
      ],
      [Markup.button.callback("✖️ Отмена", "cat_builder_cancel")],
    ]);

    return sendStepCard(ctx, { photoUrl: CAT_STEP_IMAGES.variant, caption, keyboard: kb });
  }

  if (step === "sortOrder") {
    question = "Введите *порядок в сетке* (0,1,2...)";
  } else if (step === "confirm") {
    const isEdit = st?.mode === "cat_edit";
    question = isEdit ? "Подтвердить обновление категории?" : "Подтвердить создание категории?";
  }

  if (step === "assetsAndTitle") {
    const caption =
      `${preview}\n\n` +
      `Отправь *одним сообщением* через запятую:\n` +
      `*ссылка_на_фон, ссылка_на_утку, название категории*\n\n` +
      `Пример:\nhttps://...bg.png, https://...duck.png, ЖИДКОСТИ`;

    const kb = builderNavKeyboard(st.step);
    return sendStepCard(ctx, { photoUrl: CAT_STEP_IMAGES.assetsAndTitle, caption, keyboard: kb });
  }

  if (step === "badge") {
    const caption = `${preview}\n\nХотите добавить бейдж?`;
    const kb = Markup.inlineKeyboard([
      [
        Markup.button.callback("SALE (слева)", "cat_builder_set_badge:SALE:left"),
        Markup.button.callback("SALE (справа)", "cat_builder_set_badge:SALE:right"),
      ],
      [
        Markup.button.callback("NEW DROP (слева)", "cat_builder_set_badge:NEW DROP:left"),
        Markup.button.callback("NEW DROP (справа)", "cat_builder_set_badge:NEW DROP:right"),
      ],
      [Markup.button.callback("НЕ ДОБАВЛЯТЬ", "cat_builder_set_badge:NONE")],
      [Markup.button.callback("⬅️ Назад", "cat_builder_back"), Markup.button.callback("✖️ Отмена", "cat_builder_cancel")],
    ]);
    return sendStepCard(ctx, { photoUrl: CAT_STEP_IMAGES.badge, caption, keyboard: kb });
  }

  // Кнопочные шаги оставим как есть (там inline keyboard да/нет)
  // но превью всё равно можно отправить одним сообщением (см. ниже)

  // Если шаг НЕ кнопочный — отправляем 1 сообщение (картинка+подпись)
  const photoUrl = CAT_STEP_IMAGES[step];
  if (
    ["key", "title", "badgeText", "cardBgUrl", "cardDuckUrl", "sortOrder"].includes(step)
  ) {
    const caption = `${preview}\n\n*Вопрос:*\n${question}`;
    return sendStepCard(ctx, { photoUrl, caption, keyboard: navKb });
  }


  if (step === "isActive") {
    const caption = `${preview}\n\nКатегория активна?`;
    const kb = Markup.inlineKeyboard([
      [Markup.button.callback("✅ Включить", "cat_builder_set_isActive:true")],
      [Markup.button.callback("⛔️ Выключить", "cat_builder_set_isActive:false")],
      [Markup.button.callback("⬅️ Назад", "cat_builder_back"), Markup.button.callback("✖️ Отмена", "cat_builder_cancel")],
    ]);
    return sendStepCard(ctx, { photoUrl: CAT_STEP_IMAGES[step], caption, keyboard: kb });
  }

  if (step === "confirm") {
    const st = getState(ctx.chat.id);
    const isEdit = st?.mode === "cat_edit";

    const caption = `${preview}\n\n*Вопрос:*\n${isEdit ? "Подтвердить обновление категории?" : "Подтвердить создание категории?"}`;

    const kb = Markup.inlineKeyboard([
      [
        Markup.button.callback(
          isEdit ? "💾 Сохранить" : "✅ Создать",
          isEdit ? "cat_edit_confirm" : "cat_builder_confirm"
        ),
      ],
      [
        Markup.button.callback("⬅️ Назад", "cat_builder_back"),
        Markup.button.callback("✖️ Отмена", "cat_builder_cancel"),
      ],
    ]);

    return sendStepCard(ctx, {
      photoUrl: CAT_STEP_IMAGES.confirm,
      caption,
      keyboard: kb,
    });
  }
};

export const nextStep = async (ctx) => {
  const st = getState(ctx.chat.id);
  st.step += 1;
  setState(ctx.chat.id, st);
  return askStep(ctx);
};

