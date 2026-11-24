import Order from "../../models/Order.js";
import PickupPoint from "../../models/PickupPoint.js";
import User from "../../models/User.js";
import CustomerReview from "../../models/CustomerReview.js";
import { getCompletedOrderMatch } from "../crm/sales.js";
import { normalizeAppLanguage } from "../crm/userLanguage.js";
import { getActiveGiveawayMonthKey } from "../giveaway/schedule.js";
import {
  getClientDeliveryBots,
  getShopBotByIndex,
} from "../telegram/clientBotDelivery.js";
import { getPrimaryShopBotIndex } from "../telegram/shopBotPrimary.js";
import {
  DEFAULT_COMPLAINTS_CHAT_ID,
  resolveOrderLocationForNotify,
} from "./complaintsTelegram.js";

export const GIVEAWAY_REVIEW_SOURCE = "giveaway_promo";
const MIN_DETAILS_CHARS = 3;
const RATING_KEYS = ["great", "good", "bad"];

const RATING_LABELS = {
  ru: {
    great: "Всё супер, понравилось!",
    good: "В целом хорошо, но есть что улучшить",
    bad: "Не понравилось",
  },
  pl: {
    great: "Wszystko super, podobało mi się!",
    good: "Ogólnie dobrze, ale jest co poprawić",
    bad: "Nie podobało mi się",
  },
};

function complaintsChatId() {
  const fromEnv = String(process.env.COMPLAINTS_TELEGRAM_CHAT_ID || "").trim();
  return fromEnv || DEFAULT_COMPLAINTS_CHAT_ID;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function resolveUserLanguage(user) {
  return normalizeAppLanguage(user?.language) || "ru";
}

export function ratingLabelForGiveawayReview(language, rating) {
  const lang = language === "pl" ? "pl" : "ru";
  return String(RATING_LABELS[lang]?.[rating] || RATING_LABELS.ru[rating] || "");
}

export function validateGiveawayReviewInput({ rating, details = "" } = {}) {
  const ratingKey = String(rating || "").trim().toLowerCase();
  if (!RATING_KEYS.includes(ratingKey)) {
    return { ok: false, reason: "INVALID_RATING" };
  }
  const body = String(details || "").trim();
  if (ratingKey !== "great" && body.length < MIN_DETAILS_CHARS) {
    return { ok: false, reason: "DETAILS_TOO_SHORT" };
  }
  return { ok: true, ratingKey, body };
}

async function findLatestCompletedOrder(telegramId) {
  return Order.findOne({
    userTelegramId: String(telegramId || "").trim(),
    ...getCompletedOrderMatch(),
  })
    .sort({ completedAt: -1, shippedAt: -1, createdAt: -1 })
    .lean();
}

async function notifyGiveawayReviewChat({
  telegramId,
  user,
  order,
  pickupPoint,
  ratingLabel,
  details,
  monthKey,
}) {
  const bots = getClientDeliveryBots();
  const bot =
    getShopBotByIndex(getPrimaryShopBotIndex()) || bots[0] || null;
  if (!bot?.telegram) {
    return { ok: false, reason: "BOT_UNAVAILABLE" };
  }

  const userLabel = [
    user?.firstName,
    user?.lastName,
    user?.username ? `@${user.username}` : "",
    `ID ${telegramId}`,
  ]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" · ");

  const { pointTitle, pointAddress, deliveryLabel } =
    resolveOrderLocationForNotify(order, pickupPoint);

  const lines = [
    "<b>⭐ Отзыв с розыгрыша</b>",
    "",
    `<b>Месяц:</b> ${escapeHtml(monthKey)}`,
    `<b>Клиент:</b> ${escapeHtml(userLabel)}`,
    order
      ? `<b>Последний заказ:</b> #${escapeHtml(order.orderNo || order._id)}`
      : null,
    `<b>Точка:</b> ${escapeHtml(pointTitle)}`,
    `<b>Адрес:</b> ${escapeHtml(pointAddress)}`,
    `<b>Доставка:</b> ${escapeHtml(deliveryLabel)}`,
    `<b>Оценка:</b> ${escapeHtml(ratingLabel)}`,
    "",
    "<b>Комментарий:</b>",
    escapeHtml(details || "—"),
  ].filter(Boolean);

  try {
    await bot.telegram.sendMessage(complaintsChatId(), lines.join("\n"), {
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
    return { ok: true, telegramSent: true };
  } catch (error) {
    console.error("notifyGiveawayReviewChat error:", error);
    return {
      ok: false,
      reason: "TELEGRAM_SEND_FAILED",
      detail: String(error?.message || "").slice(0, 200),
    };
  }
}

/**
 * Відгук після участі в розіграші → CRM (customer_reviews) + група відгуків.
 * Один раз на telegramId + monthKey.
 */
export async function submitGiveawayPromoReview({
  telegramId,
  rating,
  details = "",
  monthKey = "",
} = {}) {
  const id = String(telegramId || "").trim();
  if (!id || id.startsWith("guest_")) {
    return { ok: false, reason: "NO_TELEGRAM" };
  }

  const validated = validateGiveawayReviewInput({ rating, details });
  if (!validated.ok) return validated;

  const key =
    String(monthKey || "").trim() || getActiveGiveawayMonthKey() || "";
  if (!/^\d{4}-\d{2}$/.test(key)) {
    return { ok: false, reason: "MONTH_KEY_REQUIRED" };
  }

  const existing = await CustomerReview.findOne({
    telegramId: id,
    source: GIVEAWAY_REVIEW_SOURCE,
    orderNo: `giveaway:${key}`,
  })
    .select({ _id: 1 })
    .lean();
  if (existing) {
    return { ok: false, reason: "ALREADY_SUBMITTED", reviewId: String(existing._id) };
  }

  const user = await User.findOne({ telegramId: id });
  if (!user) {
    return { ok: false, reason: "USER_NOT_FOUND" };
  }

  const language = resolveUserLanguage(user);
  const ratingLabel = ratingLabelForGiveawayReview(
    language,
    validated.ratingKey
  );
  const reviewText =
    validated.ratingKey === "great" && !validated.body
      ? ratingLabel
      : `${ratingLabel}\n\n${validated.body}`.trim();

  const order = await findLatestCompletedOrder(id);
  let pickupPoint = null;
  const pointId = String(order?.pickupPointId || "").trim();
  if (pointId) {
    pickupPoint = await PickupPoint.findById(pointId).lean();
  }

  const {
    pointTitle,
    pointAddress,
    deliveryLabel,
  } = resolveOrderLocationForNotify(order, pickupPoint);

  let reviewDoc = null;
  try {
    reviewDoc = await CustomerReview.create({
      telegramId: id,
      username: String(user.username || ""),
      firstName: String(user.firstName || ""),
      lastName: String(user.lastName || ""),
      text: reviewText,
      orderId: order?._id || null,
      orderNo: `giveaway:${key}`,
      pickupPointId: pickupPoint?._id || null,
      pointTitle: pointTitle === "—" ? "" : pointTitle,
      pointAddress: pointAddress === "—" ? "" : pointAddress,
      deliveryLabel,
      source: GIVEAWAY_REVIEW_SOURCE,
      rating: validated.ratingKey,
      ratingLabel,
      imageUrls: [],
      imageCount: 0,
      telegramSent: false,
    });
  } catch (error) {
    if (String(error?.code) === "11000") {
      return { ok: false, reason: "ALREADY_SUBMITTED" };
    }
    console.error("submitGiveawayPromoReview persist error:", error);
    return { ok: false, reason: "PERSIST_FAILED" };
  }

  const telegramResult = await notifyGiveawayReviewChat({
    telegramId: id,
    user,
    order,
    pickupPoint,
    ratingLabel,
    details: validated.body || (validated.ratingKey === "great" ? "—" : validated.body),
    monthKey: key,
  });

  if (reviewDoc?._id) {
    await CustomerReview.updateOne(
      { _id: reviewDoc._id },
      {
        $set: {
          telegramSent: Boolean(telegramResult?.telegramSent),
          telegramError: String(telegramResult?.detail || ""),
        },
      }
    ).catch(() => {});
  }

  return {
    ok: true,
    reviewId: reviewDoc?._id ? String(reviewDoc._id) : "",
    telegramSent: Boolean(telegramResult?.telegramSent),
    monthKey: key,
  };
}
