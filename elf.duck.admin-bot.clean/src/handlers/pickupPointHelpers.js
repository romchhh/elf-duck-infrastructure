import { Markup } from "./_telegraf.js";
import { API_URL } from "../config.js";
import { isSuperAdmin } from "../auth.js";

export async function fetchMyPickupPoints(ctx) {
  const r = await fetch(`${API_URL}/pickup-points?active=0&_ts=${Date.now()}`);
  const data = await r.json().catch(() => ({}));
  const points = data.pickupPoints || [];
  const myId = String(ctx.from?.id || "");

  if (isSuperAdmin(ctx)) return points;

  return points.filter((p) =>
    Array.isArray(p.allowedAdminTelegramIds)
      ? p.allowedAdminTelegramIds.map((x) => String(x)).includes(myId)
      : false
  );
}

export function renderPickupPointPreview(p) {
  const lines = [];
  lines.push("🏪 *Точка самовывоза — превью*");
  lines.push("");
  lines.push(`Адрес: *${p?.address || "—"}*`);
  lines.push("");
  lines.push(
    `Менеджеры (ID): ${
      Array.isArray(p?.allowedAdminTelegramIds) && p.allowedAdminTelegramIds.length
        ? p.allowedAdminTelegramIds.join(", ")
        : "—"
    }`
  );

  const todayKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const todaySchedule =
    p?.scheduleByDate?.[todayKey] ||
    p?.scheduleByDate?.get?.(todayKey) ||
    null;

  const todayScheduleLabel = todaySchedule
    ? todaySchedule.isOpen
      ? `${todaySchedule.from || "--:--"}-${todaySchedule.to || "--:--"}`
      : String(todaySchedule.note || "выходной")
    : "не задан";

  lines.push("");
  lines.push(`График на сегодня: *${todayScheduleLabel}*`);
  lines.push("");
  const autoStatsTime = String(todaySchedule?.to || p?.statsSendTime || "23:59").trim();
  lines.push(`Время отправки статистики: *${autoStatsTime}*`);

  const pm = Array.isArray(p?.paymentConfig?.methods) ? p.paymentConfig.methods : [];
  lines.push("");
  lines.push(
    `Способы оплаты: ${
      pm.length
        ? pm
            .map(
              (m) =>
                `\`${String(m.key || "").replace(/`/g, "")}${m.isActive === false ? " (off)" : ""}\``
            )
            .join(", ")
        : "—"
    }`
  );

  return lines.join("\n");
}

export function ppMenuKeyboard(id) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("🟢/🔴 Вкл/Выкл", `pp_toggle:${id}`),
      Markup.button.callback("🗑 Удалить", `pp_delete:${id}`),
    ],
    [
      Markup.button.callback("📝 Название", `pp_prompt:title:${id}`),
      Markup.button.callback("📍 Адрес", `pp_prompt:address:${id}`),
    ],
    [
      Markup.button.callback(
        "🗓 График по датам",
        `pp_edit_schedule_by_date:${id}`
      ),
    ],
    [Markup.button.callback("👤 ID менеджеров", `pp_prompt:allowedAdminTelegramIds:${id}`)],
    [Markup.button.callback("🔔 ID канала уведомлений", `pp_prompt:notificationChatId:${id}`)],
    [Markup.button.callback("📊 ID канала статистики", `pp_prompt:statsChatId:${id}`)],
    [Markup.button.callback("💳 Настроить оплату", `pp_payment_menu:${id}`)],
    [Markup.button.callback("🔢 sortOrder", `pp_prompt:sortOrder:${id}`)],
    [Markup.button.callback("⬅️ К списку", "pp_list")],
    [Markup.button.callback("🏠 Меню", "cat_builder_cancel")],
  ]);
}

export function ppListKeyboard(points = [], ctx = null) {
  return Markup.inlineKeyboard([
    ...points
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((p) => [
        Markup.button.callback(
          `${p.isActive ? "✅" : "⛔️"} ${p.title || p.address || "(без названия)"}`,
          `pp_open:${p._id}`
        ),
      ]),
    ...(ctx && isSuperAdmin(ctx)
      ? [[Markup.button.callback("➕ Создать точку", "pp_create")]]
      : []),
    [Markup.button.callback("🏠 Меню", "menu")],
  ]);
}
