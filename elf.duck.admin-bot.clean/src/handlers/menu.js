import { Markup } from "./_telegraf.js";
import { API_URL } from "../config.js";
import { isAdmin, isSuperAdmin } from "../auth.js";

// =====================================================
// ====================== UI MENU =======================
// =====================================================
const managerMainMenu = () =>

  Markup.keyboard([

    ["➕ Категория", "➕ Товар"],

    ["📦 Наличие", "💰 Кэшбек"],

    ["🎟 Промокоды"],

    ["🏪 Самовывоз", "👨‍💻 Админ-панель"],

  ])

    .resize()

    .persistent();

const superAdminMainMenu = () =>
  Markup.keyboard([
    ["➕ Категория", "➕ Товар"],
    ["🍓 Вкусы / наличие", "💰 Кэшбек"],
    ["🎟 Промокоды"],
    ["🏪 Точки", "✏️ Категории"],
    ["📋 Список категорий"],
    ["👨‍💻 Админ-панель", "👥 Выгрузка базы"],
  ])
    .resize()
    .persistent();

export const mainMenu = (ctx) => (isSuperAdmin(ctx) ? superAdminMainMenu() : managerMainMenu());

const MAIN_MENU_TEXT_TO_CALLBACK = new Map([
  ["📦 Наличие", "fl_quick_start"],
  ["🍓 Вкусы / наличие", "fl_quick_start"],
  ["💰 Кэшбек", "cashback_menu_start"],
  ["🎟 Промокоды", "promo_codes_menu"],
  ["🏪 Самовывоз", "pp_list"],
  ["➕ Категория", "cat_builder_start"],
  ["➕ Товар", "prod_builder_start"],
  ["🏪 Точки", "pp_list"],
  ["✏️ Категории", "cat_edit_start"],
  ["📋 Список категорий", "cat_list"],
  ["👥 Выгрузка базы", "users_export"],
  ["👨‍💻 Админ-панель", "admin_panel"],
]);

/** Тексты reply-клавиатуры, которые не должны перехватываться wizard `bot.on("text")`. */
export const DELEGATED_REPLY_KEYBOARD_TEXTS = new Set([
  ...MAIN_MENU_TEXT_TO_CALLBACK.keys(),
  "🏠 Операционное меню",
  "📣 Рассылка",
  "📊 Статистика",
  "📈 Аналитика",
  "🔄 Обновить данные",
]);

export function isDelegatedReplyKeyboardText(text) {
  return DELEGATED_REPLY_KEYBOARD_TEXTS.has(String(text || "").trim());
}

export function registerMainMenuHandlers(bot) {
  bot.hears(
  Array.from(MAIN_MENU_TEXT_TO_CALLBACK.keys()),
  async (ctx) => {
    if (!isAdmin(ctx)) return;

    const text = String(ctx?.message?.text || "").trim();
    const callbackData = MAIN_MENU_TEXT_TO_CALLBACK.get(text);

    if (!callbackData) return;

    const syntheticUpdate = {
      update_id: Number(ctx?.update?.update_id || Date.now()),
      __fromReplyKeyboard: true,
      callback_query: {
        id: `reply-keyboard-${Date.now()}`,
        from: ctx.from,
        chat_instance: String(ctx?.chat?.id || ""),
        data: callbackData,
        message: ctx.message,
      },
    };

    return bot.handleUpdate(syntheticUpdate);
  }
  );
}

export const pickupPointManagerMenu = (ppId, options = {}) => {
  const isSuper = options?.isSuper === true;

  const pointKey = String(options?.pointKey || "").trim().replace(/,+$/, "");
  const canSendCourierMessage = true;

  const rows = [
    [Markup.button.callback("📍 Адрес", `pp_edit_address:${ppId}`)],
    [

      Markup.button.callback(

        "🗓 График по датам",

        `pp_edit_schedule_by_date:${ppId}`

      ),

    ],
  ];

  if (isSuper) {
    rows.push(
      [Markup.button.callback("🔔 ID канала уведомлений", `pp_edit_orders_chat:${ppId}`)],
      [Markup.button.callback("📊 ID канала статистики", `pp_edit_stats_chat:${ppId}`)],
    );
  }

  if (canSendCourierMessage) {
    rows.push([Markup.button.callback("📨 Сообщение клиенту", `courier_msg_start:${ppId}`)]);
  }

  rows.push(
    [Markup.button.callback("💳 Настроить оплату", `pp_payment_menu:${ppId}`)],
    [Markup.button.callback("⬅️ К списку", "pp_list")],
    [Markup.button.callback("🏠 Меню", "menu")],
  );

  return Markup.inlineKeyboard(rows);
};

export const isPickupPointManager = async (ctx, pickupPointId) => {
  if (isSuperAdmin(ctx)) return true;

  const myTelegramId = String(ctx?.from?.id || "").trim();
  const safePickupPointId = String(pickupPointId || "").trim();

  if (!myTelegramId || !safePickupPointId) return false;

  try {
    const r = await fetch(`${API_URL}/pickup-points?active=0&_ts=${Date.now()}`);
    const data = await r.json().catch(() => ({}));

    const pickupPoints = Array.isArray(data?.pickupPoints)
      ? data.pickupPoints
      : Array.isArray(data)
      ? data
      : [];

    const point = pickupPoints.find((p) => String(p?._id || "") === safePickupPointId);
    if (!point) return false;

    return Array.isArray(point.allowedAdminTelegramIds)
      ? point.allowedAdminTelegramIds.map((x) => String(x)).includes(myTelegramId)
      : false;
  } catch (e) {
    console.error("isPickupPointManager error:", e);
    return false;
  }
};

export const isCourierManager = async (ctx) => {
  if (isSuperAdmin(ctx)) return true;

  const myTelegramId = String(ctx?.from?.id || "").trim();
  if (!myTelegramId) return false;

  try {
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

    if (!courierPoint) return false;

    return Array.isArray(courierPoint.allowedAdminTelegramIds)
      ? courierPoint.allowedAdminTelegramIds.map((x) => String(x)).includes(myTelegramId)
      : false;
  } catch (e) {
    console.error("isCourierManager error:", e);
    return false;
  }
};

