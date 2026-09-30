import { bot } from "../bot/single.js";
import { Markup } from "./_telegraf.js";
import { api } from "../api.js";
import { CRM_WEB_URL } from "../config.js";
import { isAdmin, isSuperAdmin } from "../auth.js";
import { clearState } from "../state.js";
import { mainMenu } from "./menu.js";

const PERIOD_BUTTONS = [
  ["today", "Сегодня"],
  ["week", "Неделя"],
  ["month", "Месяц"],
];

export const adminPanelMenu = () =>
  Markup.keyboard([
    ["📣 Рассылка", "📊 Статистика"],
    ["📈 Аналитика", "🔄 Обновить данные"],
    ["🏠 Операционное меню"],
  ])
    .resize()
    .persistent();

function periodPickerKeyboard(mode, ctx) {
  const prefix = mode === "analytics" ? "admin_analytics" : "admin_stats";
  const rows = [
    PERIOD_BUTTONS.map(([key, label]) =>
      Markup.button.callback(label, `${prefix}:${key}`)
    ),
  ];

  if (CRM_WEB_URL) {
    rows.push([
      Markup.button.url("🌐 Веб-CRM", CRM_WEB_URL),
    ]);
  }

  if (ctx && isSuperAdmin(ctx)) {
    rows.push([
      Markup.button.callback("🔍 Выгрузить БД", "users_export"),
    ]);
  }

  rows.push([Markup.button.callback("⬅️ В админ-панель", "admin_panel")]);

  return Markup.inlineKeyboard(rows);
}

function crmLinkLine() {
  if (!CRM_WEB_URL) return "";
  return `\n🌐 <a href="${escapeHtml(CRM_WEB_URL)}">Открыть веб-CRM</a>`;
}

function formatDeltaLine(label, current, previous, pct, suffix = "") {
  const arrow =
    pct > 0 ? "📈" : pct < 0 ? "📉" : "➖";
  const sign = pct > 0 ? "+" : "";
  return [
    `<b>${label}:</b> ${current}${suffix}`,
    `   ${arrow} ${sign}${pct}% к прошлому периоду`,
  ].join("\n");
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatStatsMessage(data) {
  const m = data.metrics || {};
  const p = data.previousMetrics || {};
  const d = data.deltas || {};
  const users = data.users || {};
  const stamp = new Date().toLocaleString("ru-RU", {
    timeZone: "Europe/Warsaw",
  });

  const lines = [
    "<b>📊 СТАТИСТИКА МАГАЗИНА</b>",
    "",
    `Период: <b>${escapeHtml(data.periodLabel || "—")}</b>`,
    `🕐 ${escapeHtml(stamp)} (Warsaw)`,
    "",
    "<b>👥 База бота</b>",
    `Всего пользователей: <b>${users.total ?? "—"}</b>`,
    `Новых за период: <b>${users.newInPeriod ?? 0}</b>`,
    "",
    "<b>🛒 Продажи (завершённые заказы)</b>",
    formatDeltaLine(
      "Заказы",
      m.orders ?? 0,
      p.orders ?? 0,
      d.ordersPct ?? 0
    ),
    formatDeltaLine(
      "Выручка",
      `${Number(m.revenue || 0).toFixed(2)} zł`,
      `${Number(p.revenue || 0).toFixed(2)} zł`,
      d.revenuePct ?? 0
    ),
    formatDeltaLine(
      "Средний чек",
      `${Number(m.averageCheck || 0).toFixed(2)} zł`,
      `${Number(p.averageCheck || 0).toFixed(2)} zł`,
      d.averageCheckPct ?? 0
    ),
    formatDeltaLine(
      "Покупатели",
      m.customers ?? 0,
      p.customers ?? 0,
      d.customersPct ?? 0
    ),
    "",
    `🆕 Новые клиенты: <b>${m.newCustomers ?? 0}</b> (${m.newCustomersPercent ?? 0}%)`,
    `🔁 Повторные: <b>${m.repeatCustomers ?? 0}</b> (${m.repeatCustomersPercent ?? 0}%)`,
    `❌ Отмены: <b>${m.cancellations ?? 0}</b> (${m.cancellationsPercent ?? 0}%)`,
    crmLinkLine(),
  ].filter(Boolean);

  return lines.join("\n");
}

function formatAnalyticsMessage(data) {
  const statsBlock = formatStatsMessage(data);
  const products = Array.isArray(data.topProducts)
    ? data.topProducts
    : [];
  const locations = Array.isArray(data.topLocations)
    ? data.topLocations
    : [];

  const productLines =
    products.length
      ? products
          .map(
            (row, i) =>
              `${i + 1}. ${escapeHtml(row.title)} — <b>${row.sold}</b> шт. (${row.revenue} zł)`
          )
          .join("\n")
      : "— нет продаж за период";

  const locationLines =
    locations.length
      ? locations
          .map(
            (row, i) =>
              `${i + 1}. ${escapeHtml(row.title)} — <b>${row.orders}</b> зак. (${row.revenue} zł)`
          )
          .join("\n")
      : "— нет данных";

  return [
    statsBlock,
    "",
    "<b>🏆 Топ товаров</b>",
    productLines,
    "",
    "<b>📍 Топ точек / способов</b>",
    locationLines,
    "",
    "<i>Подробная аналитика — в веб-CRM.</i>",
    crmLinkLine(),
  ]
    .filter(Boolean)
    .join("\n");
}

async function fetchAnalytics(period) {
  return api(
    `/admin/analytics/summary?period=${encodeURIComponent(period)}`
  );
}

async function sendStats(ctx, period = "today") {
  const wait = await ctx.reply("⏳ Считаю статистику…");
  try {
    const data = await fetchAnalytics(period);
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      wait.message_id,
      undefined,
      formatStatsMessage(data),
      {
        parse_mode: "HTML",
        ...periodPickerKeyboard("stats", ctx),
      }
    );
  } catch (e) {
    console.error("admin stats error:", e);
    await ctx.telegram
      .editMessageText(
        ctx.chat.id,
        wait.message_id,
        undefined,
        `❌ Не удалось загрузить статистику: ${escapeHtml(e?.message || e)}`,
        { parse_mode: "HTML" }
      )
      .catch(() => {});
  }
}

async function sendAnalytics(ctx, period = "today") {
  const wait = await ctx.reply("⏳ Готовлю аналитику…");
  try {
    const data = await fetchAnalytics(period);
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      wait.message_id,
      undefined,
      formatAnalyticsMessage(data),
      {
        parse_mode: "HTML",
        ...periodPickerKeyboard("analytics", ctx),
      }
    );
  } catch (e) {
    console.error("admin analytics error:", e);
    await ctx.telegram
      .editMessageText(
        ctx.chat.id,
        wait.message_id,
        undefined,
        `❌ Не удалось загрузить аналитику: ${escapeHtml(e?.message || e)}`,
        { parse_mode: "HTML" }
      )
      .catch(() => {});
  }
}

export function registerAdminPanelHandlers(botInstance) {
  const b = botInstance || bot;

  b.command("admin", async (ctx) => {
    if (!isAdmin(ctx)) return;
    clearState(ctx.chat.id);
    return ctx.reply(
      [
        "<b>👨‍💻 Админ-панель</b>",
        "",
        "Здесь — рассылки, статистика и аналитика магазина.",
        "Операционные задачи (товары, остатки) — в основном меню.",
        CRM_WEB_URL
          ? `\n🌐 CRM: ${CRM_WEB_URL}`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
      {
        parse_mode: "HTML",
        ...adminPanelMenu(),
      }
    );
  });

  b.hears("👨‍💻 Админ-панель", async (ctx) => {
    if (!isAdmin(ctx)) return;
    clearState(ctx.chat.id);
    return ctx.reply(
      [
        "<b>👨‍💻 Админ-панель</b>",
        "",
        "Рассылка, статистика и аналитика магазина.",
        CRM_WEB_URL ? `🌐 <a href="${escapeHtml(CRM_WEB_URL)}">Веб-CRM</a>` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      { parse_mode: "HTML", ...adminPanelMenu() }
    );
  });

  b.hears("🏠 Операционное меню", async (ctx) => {
    if (!isAdmin(ctx)) return;
    clearState(ctx.chat.id);
    return ctx.reply("Главное меню", mainMenu(ctx));
  });

  b.hears("📊 Статистика", async (ctx) => {
    if (!isAdmin(ctx)) return;
    return sendStats(ctx, "today");
  });

  b.hears("📈 Аналитика", async (ctx) => {
    if (!isAdmin(ctx)) return;
    return sendAnalytics(ctx, "today");
  });

  b.hears("🔄 Обновить данные", async (ctx) => {
    if (!isAdmin(ctx)) return;
    return sendAnalytics(ctx, "today");
  });

  b.action("admin_panel", async (ctx) => {
    if (!isAdmin(ctx)) {
      return ctx.answerCbQuery("Нет доступа");
    }
    await ctx.answerCbQuery();
    clearState(ctx.chat.id);
    try {
      await ctx.editMessageReplyMarkup(undefined);
    } catch {}
    return ctx.reply("👨‍💻 Админ-панель", adminPanelMenu());
  });

  for (const [prefix, handler] of [
    ["admin_stats", sendStats],
    ["admin_analytics", sendAnalytics],
  ]) {
    b.action(new RegExp(`^${prefix}:(today|week|month)$`), async (ctx) => {
      if (!isAdmin(ctx)) {
        return ctx.answerCbQuery("Нет доступа");
      }
      await ctx.answerCbQuery();
      const period = String(ctx.match?.[1] || "today");
      return handler(ctx, period);
    });
  }

  b.hears("📣 Рассылка", async (ctx) => {
    if (!isAdmin(ctx)) return;
    const intro = [
      "<b>📣 РАССЫЛКА</b>",
      "",
      "Создайте сообщение для клиентов бота: текст, фото, кнопка в мини-приложение.",
      "Можно выбрать аудиторию: все, сегмент или один username.",
      "",
      "Нажмите кнопку ниже, чтобы начать.",
    ].join("\n");

    return ctx.reply(intro, {
      parse_mode: "HTML",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("📨 Открыть рассылки", "broadcast_start")],
        [Markup.button.callback("⬅️ В админ-панель", "admin_panel")],
      ]),
    });
  });
}

registerAdminPanelHandlers(bot);
