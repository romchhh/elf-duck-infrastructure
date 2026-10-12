/**
 * Самовывоз (Mokotów-style):
 *  - кінець зміни: нагадування X/Y закрито;
 *  - коли Y/Y — рання відправка «СТАТИСТИКА ДНЯ» в Telegram (і Google Sheets, як у cron).
 */
import Order from "../models/Order.js";
import PickupPoint from "../models/PickupPoint.js";
import { bot } from "./botRegistry.js";
import {
  claimDailyStatsDispatch,
  isDailyStatsDispatchRecorded,
  releaseDailyStatsDispatch,
} from "./dailyStatsDedupe.js";
import { addDays, getWarsawParts, warsawLocalToUtc } from "../crm/datetime.js";
import {
  buildStatsOrdersMongoFilter,
  orderBelongsToStatsDay,
  STATS_ORDERS_LOOKBACK_MS,
  STATS_ORDER_LIST_PROJECTION,
} from "./helpers/orderStatsDay.js";
import {
  getOrderPointMatch,
  getWarsawDayKey,
  getWarsawTimeMinutes,
  parseWarsawTimeToMinutes,
} from "./helpers/chunk08.js";

const DONE_STATUSES = new Set(["completed", "done"]);
const SKIP_SHIFT_STATUSES = new Set(["canceled", "annulled"]);

function normalizePointKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/,+$/, "");
}

function getWarsawCalendarDayBounds(dateLike = new Date()) {
  const parts = getWarsawParts(dateLike);
  const start = warsawLocalToUtc({
    year: parts.year,
    month: parts.month,
    day: parts.day,
  });
  const end = addDays(start, 1);
  const dayKey = getWarsawDayKey(dateLike);
  return { start, end, dayKey };
}

/** Кінець зміни на точці (графік «до»), не час відправки статистики. */
export function getPointShiftEndTime(point, dateLike = new Date()) {
  const todayKey = getWarsawDayKey(dateLike);
  const rawSchedule =
    point?.scheduleByDate?.[todayKey] ||
    point?.scheduleByDate?.get?.(todayKey) ||
    null;

  if (rawSchedule?.isOpen === false) {
    return null;
  }

  const raw = String(
    rawSchedule?.to ||
      rawSchedule?.openTo ||
      rawSchedule?.periods?.[0]?.to ||
      rawSchedule?.periods?.[0]?.openTo ||
      "20:00"
  ).trim();

  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(raw) ? raw : "20:00";
}

export async function countPickupShiftOrders(point, dayKey, dateLike = new Date()) {
  const bounds =
    dayKey === getWarsawDayKey(dateLike)
      ? getWarsawCalendarDayBounds(dateLike)
      : (() => {
          const [y, m, d] = dayKey.split("-").map(Number);
          const start = warsawLocalToUtc({ year: y, month: m, day: d });
          return { start, end: addDays(start, 1), dayKey };
        })();

  const orders = await Order.find(
    {
      deliveryType: "pickup",
      pickupPointId: point._id,
      createdAt: { $gte: bounds.start, $lt: bounds.end },
      status: { $nin: Array.from(SKIP_SHIFT_STATUSES) },
    },
    { status: 1 }
  ).lean();

  const total = orders.length;
  const done = orders.filter((o) =>
    DONE_STATUSES.has(String(o?.status || "").trim().toLowerCase())
  ).length;

  return { total, done, pending: Math.max(0, total - done), dayKey: bounds.dayKey };
}

async function loadStatsDayOrders(point, dayKey) {
  const anchor = new Date(`${dayKey}T12:00:00.000Z`);
  const ordersSince = new Date(anchor.getTime() - STATS_ORDERS_LOOKBACK_MS);

  const orders = await Order.find(
    buildStatsOrdersMongoFilter(getOrderPointMatch(point), ordersSince),
    STATS_ORDER_LIST_PROJECTION
  ).lean();

  return orders.filter((order) => orderBelongsToStatsDay(order, dayKey));
}

export async function trySendDailyStatsForPointEarly(point, dayKey, { reason = "" } = {}) {
  const pointKey = normalizePointKey(point?.key);
  const telegramDedupeKey = `${String(point?._id || "")}:${dayKey}`;
  const sheetsDedupeKey = `${String(point?._id || "")}:${dayKey}:google_sheets`;

  if (await isDailyStatsDispatchRecorded(telegramDedupeKey)) {
    return { ok: true, skipped: true, reason: "TELEGRAM_ALREADY_SENT" };
  }

  const dayOrders = await loadStatsDayOrders(point, dayKey);
  if (!dayOrders.length) {
    return { ok: false, reason: "NO_DAY_ORDERS" };
  }

  const { sendDailyPointStats, sendDailyPointStatsToGoogleSheet } = await import(
    "./helpers/chunk10.js"
  );

  const claimedTelegram = await claimDailyStatsDispatch(telegramDedupeKey, {
    kind: "telegram_early",
    dayKey,
    pointKey,
  });

  let telegramResult = { ok: true, skipped: true };
  if (claimedTelegram) {
    telegramResult = await sendDailyPointStats(point, dayOrders, dayKey, {
      productBasePriceMap: new Map(),
      referredFirstOrderUsers: new Set(),
      userDisplayMap: new Map(),
    });

    if (!telegramResult?.ok) {
      await releaseDailyStatsDispatch(telegramDedupeKey);
    }
  }

  const sharedSkip = new Set(["wola", "delivery-2"]);
  let sheetsResult = { ok: true, skipped: true };

  if (!sharedSkip.has(pointKey) && !(await isDailyStatsDispatchRecorded(sheetsDedupeKey))) {
    const claimedSheets = await claimDailyStatsDispatch(sheetsDedupeKey, {
      kind: "google_sheets_early",
      dayKey,
      pointKey,
    });

    if (claimedSheets) {
      sheetsResult = await sendDailyPointStatsToGoogleSheet(point, dayOrders, dayKey);
      if (!sheetsResult?.ok) {
        await releaseDailyStatsDispatch(sheetsDedupeKey);
      }
    }
  }

  return {
    ok: Boolean(telegramResult?.ok !== false),
    telegramResult,
    sheetsResult,
    dayOrders: dayOrders.length,
    reason,
  };
}

export async function onPickupOrderCompletedByManager(order) {
  if (String(order?.deliveryType || "").trim().toLowerCase() !== "pickup") {
    return { ok: false, reason: "NOT_PICKUP" };
  }

  const point = order?.pickupPointId
    ? await PickupPoint.findById(order.pickupPointId).lean()
    : null;

  if (!point) {
    return { ok: false, reason: "NO_POINT" };
  }

  const { total, done, dayKey } = await countPickupShiftOrders(point);
  if (total === 0 || done < total) {
    return { ok: true, skipped: true, total, done };
  }

  return await trySendDailyStatsForPointEarly(point, dayKey, {
    reason: "all_shift_orders_completed",
  });
}

async function sendShiftCloseReminder(point, { total, done, dayKey }) {
  const chatId = String(point?.notificationChatId || "").trim();
  if (!chatId || !bot?.telegram) {
    return { ok: false, reason: "NO_CHAT" };
  }

  const title = String(point?.title || point?.address || point?.key || "Точка").trim();

  const text = [
    `📋 <b>Завершение смены — ${title}</b>`,
    ``,
    `<b>${done}/${total}</b> заказов завершены.`,
    done < total
      ? `Для полного завершения дня закройте все завязки.`
      : `Все заказы закрыты — статистика дня отправляется в группу.`,
  ].join("\n");

  await bot.telegram.sendMessage(chatId, text, {
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });

  return { ok: true };
}

export async function processPickupShiftCloseReminders(now = new Date()) {
  const dayKey = getWarsawDayKey(now);
  const nowMinutes = getWarsawTimeMinutes(now);

  const points = await PickupPoint.find(
    {
      isActive: { $ne: false },
      notificationChatId: { $exists: true, $ne: "" },
    },
    {
      key: 1,
      title: 1,
      address: 1,
      notificationChatId: 1,
      statsChatId: 1,
      scheduleByDate: 1,
    }
  ).lean();

  for (const point of points) {
    const pointKey = normalizePointKey(point?.key);
    if (pointKey === "delivery" || pointKey === "delivery-2") {
      continue;
    }

    const shiftEnd = getPointShiftEndTime(point, now);
    if (!shiftEnd) continue;

    const endMinutes = parseWarsawTimeToMinutes(shiftEnd);
    if (endMinutes === null) continue;

    if (nowMinutes < endMinutes || nowMinutes >= endMinutes + 30) {
      continue;
    }

    const reminderKey = `shift_close_reminder:${String(point._id)}:${dayKey}`;
    if (await isDailyStatsDispatchRecorded(reminderKey)) {
      continue;
    }

    const counts = await countPickupShiftOrders(point, dayKey, now);
    if (counts.total === 0) {
      continue;
    }

    const claimed = await claimDailyStatsDispatch(reminderKey, {
      kind: "shift_close_reminder",
      dayKey,
      pointKey,
    });

    if (!claimed) continue;

    try {
      await sendShiftCloseReminder(point, counts);

      if (counts.done >= counts.total) {
        await trySendDailyStatsForPointEarly(point, dayKey, {
          reason: "shift_end_all_closed",
        });
      }
    } catch (e) {
      await releaseDailyStatsDispatch(reminderKey);
      console.error("[shiftClose] reminder failed:", pointKey, e?.message || e);
    }
  }
}
