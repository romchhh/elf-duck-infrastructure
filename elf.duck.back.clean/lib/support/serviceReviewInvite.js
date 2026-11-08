import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import Order from "../../models/Order.js";
import PickupPoint from "../../models/PickupPoint.js";
import User from "../../models/User.js";
import CustomerReview from "../../models/CustomerReview.js";
import { getCompletedOrderMatch } from "../crm/sales.js";
import { normalizeAppLanguage } from "../crm/userLanguage.js";
import { getWebAppBaseUrl } from "../crm/pushMessageFormat.js";
import {
  sendClientTelegramPhoto,
  getClientDeliveryBots,
  getShopBotByIndex,
} from "../telegram/clientBotDelivery.js";
import { getPrimaryShopBotIndex } from "../telegram/shopBotPrimary.js";
import { recalcUserCashbackBalanceFromLedger } from "../cashback/manualAdmin.js";
import { DEFAULT_COMPLAINTS_CHAT_ID } from "./complaintsTelegram.js";

export const SERVICE_REVIEW_INVITES_COLLECTION = "service_review_invites";
const REWARD_ZL = 15;
const MIN_DELAY_MS = 5 * 60 * 1000;
const MAX_DELAY_MS = 10 * 60 * 1000;
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

const INVITE_CAPTION = {
  ru:
    "Кажется, ты кое-что забыл 👀\n\n" +
    "Нам важно получить от тебя обратную связь и понять, как ты оцениваешь качество нашей работы 💬\n\n" +
    "Будем благодарны за твой отзыв — после его отправки мы автоматически начислим 15 zł на твой баланс в боте 💸",
  pl:
    "Wygląda na to, że o czymś zapomniałeś/aś 👀\n\n" +
    "Zależy nam na Twojej opinii i na tym, jak oceniasz jakość naszej pracy 💬\n\n" +
    "Będziemy wdzięczni za opinię — po jej wysłaniu automatycznie dodamy 15 zł na Twój bilans w bocie 💸",
};

const BUTTON_LABEL = {
  ru: "ОЦЕНИ НАШУ РАБОТУ",
  pl: "OCEŃ NASZĄ PRACĘ",
};

let indexesEnsured = false;

function invitesCollection() {
  return mongoose.connection.collection(SERVICE_REVIEW_INVITES_COLLECTION);
}

function assetDir() {
  return path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../assets/service-review"
  );
}

function promoImagePath(language) {
  const lang = language === "pl" ? "pl" : "ru";
  return path.join(assetDir(), lang === "pl" ? "promo-pl.png" : "promo-ru.png");
}

function randomRunAt() {
  const span = Math.max(0, MAX_DELAY_MS - MIN_DELAY_MS);
  const offset = MIN_DELAY_MS + Math.floor(Math.random() * (span + 1));
  return new Date(Date.now() + offset);
}

function addDays(dateLike, days) {
  const base = new Date(dateLike);
  base.setDate(base.getDate() + Number(days || 0));
  return base;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function complaintsChatId() {
  const fromEnv = String(process.env.COMPLAINTS_TELEGRAM_CHAT_ID || "").trim();
  return fromEnv || DEFAULT_COMPLAINTS_CHAT_ID;
}

async function ensureServiceReviewIndexes() {
  if (indexesEnsured) return;
  indexesEnsured = true;
  try {
    await invitesCollection().createIndex(
      { telegramId: 1 },
      { unique: true, name: "service_review_telegram_unique" }
    );
    await invitesCollection().createIndex(
      { status: 1, runAt: 1 },
      { name: "service_review_due" }
    );
  } catch (error) {
    console.error("ensureServiceReviewIndexes error:", error);
  }
}

async function countCompletedPurchases(telegramId) {
  return Order.countDocuments({
    userTelegramId: String(telegramId || "").trim(),
    ...getCompletedOrderMatch(),
  });
}

function resolveUserLanguage(user, fallbackCode = "") {
  return (
    normalizeAppLanguage(user?.language) ||
    normalizeAppLanguage(fallbackCode) ||
    "ru"
  );
}

function ratingLabelFor(language, rating) {
  const lang = language === "pl" ? "pl" : "ru";
  return String(RATING_LABELS[lang]?.[rating] || RATING_LABELS.ru[rating] || "");
}

function buildWebAppReviewUrl() {
  const base = getWebAppBaseUrl();
  if (!base) return "";
  return `${base}/service-review`;
}

/** Для автотестів і діагностики (без відправки в Telegram). */
export function buildServiceReviewTelegramPayload(language = "ru") {
  const lang = language === "pl" ? "pl" : "ru";
  const imagePath = promoImagePath(lang);
  const reviewUrl = buildWebAppReviewUrl();
  const caption = INVITE_CAPTION[lang] || INVITE_CAPTION.ru;
  const buttonText = BUTTON_LABEL[lang] || BUTTON_LABEL.ru;

  return {
    language: lang,
    imagePath,
    imageExists: fs.existsSync(imagePath),
    reviewUrl,
    caption,
    buttonText,
    reply_markup: reviewUrl
      ? {
          inline_keyboard: [[{ text: buttonText, web_app: { url: reviewUrl } }]],
        }
      : null,
  };
}

export function getServiceReviewDelayBoundsMs() {
  return { min: MIN_DELAY_MS, max: MAX_DELAY_MS };
}

/**
 * Після першого завершеного замовлення в боті (один раз на користувача).
 */
export async function maybeScheduleFirstOrderServiceReview(order) {
  try {
    await ensureServiceReviewIndexes();

    const telegramId = String(order?.userTelegramId || "").trim();
    if (!telegramId || telegramId.startsWith("guest_")) {
      return { ok: false, reason: "NO_TELEGRAM" };
    }

    const purchases = await countCompletedPurchases(telegramId);
    if (purchases !== 1) {
      return { ok: false, reason: "NOT_FIRST_PURCHASE", purchases };
    }

    const existing = await invitesCollection().findOne({ telegramId });
    if (existing) {
      return { ok: false, reason: "ALREADY_SCHEDULED" };
    }

    const orderId = String(order?._id || "").trim();
    const pickupPointId = String(order?.pickupPointId || "").trim();
    const runAt = randomRunAt();

    try {
      await invitesCollection().insertOne({
        telegramId,
        orderId,
        pickupPointId,
        status: "scheduled",
        runAt,
        sentAt: null,
        completedAt: null,
        rewardGrantedAt: null,
        rating: "",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    } catch (error) {
      if (error?.code === 11000) {
        return { ok: false, reason: "ALREADY_SCHEDULED" };
      }
      throw error;
    }

    return { ok: true, scheduled: true, runAt };
  } catch (error) {
    console.error("maybeScheduleFirstOrderServiceReview error:", error);
    return { ok: false, reason: "ERROR" };
  }
}

export async function sendServiceReviewInviteTelegram(invite, user) {
  const telegramId = String(invite?.telegramId || "").trim();
  const language = resolveUserLanguage(user);
  const payload = buildServiceReviewTelegramPayload(language);

  if (!payload.imageExists) {
    throw new Error(`SERVICE_REVIEW_IMAGE_MISSING:${payload.imagePath}`);
  }

  if (!payload.reviewUrl) {
    throw new Error("WEBAPP_URL_MISSING");
  }

  const extra = {
    caption: payload.caption,
    parse_mode: "HTML",
    reply_markup: payload.reply_markup,
  };

  await sendClientTelegramPhoto(
    telegramId,
    { source: fs.createReadStream(payload.imagePath) },
    extra
  );
}

/**
 * /testreview — адмін скидає invite у «sent» і отримує те саме повідомлення, що після 1-го заказу.
 */
export async function triggerServiceReviewTestInvite(telegramId) {
  try {
    const id = String(telegramId || "").trim();
    if (!id || id.startsWith("guest_")) {
      return { ok: false, reason: "NO_TELEGRAM" };
    }

    if (!getWebAppBaseUrl()) {
      return { ok: false, reason: "WEBAPP_URL_MISSING" };
    }

    await ensureServiceReviewIndexes();

    const lastOrder = await Order.findOne({
      userTelegramId: id,
      ...getCompletedOrderMatch(),
    })
      .sort({ completedAt: -1, shippedAt: -1, updatedAt: -1 })
      .lean();

    const orderId = String(lastOrder?._id || "").trim();
    const pickupPointId = String(lastOrder?.pickupPointId || "").trim();
    const now = new Date();

    await invitesCollection().updateOne(
      { telegramId: id },
      {
        $set: {
          telegramId: id,
          orderId,
          pickupPointId,
          status: "sent",
          sentAt: now,
          runAt: now,
          testMode: true,
          completedAt: null,
          rating: "",
          rewardGrantedAt: null,
          lastError: "",
          updatedAt: now,
        },
        $setOnInsert: {
          createdAt: now,
        },
      },
      { upsert: true }
    );

    const user = await User.findOne({ telegramId: id })
      .select({ language: 1 })
      .lean();

    await sendServiceReviewInviteTelegram({ telegramId: id }, user);

    return {
      ok: true,
      orderId: orderId || null,
      pickupPointId: pickupPointId || null,
    };
  } catch (error) {
    console.error("triggerServiceReviewTestInvite error:", error);
    return {
      ok: false,
      reason: String(error?.message || "ERROR").slice(0, 200),
    };
  }
}

export async function processDueServiceReviewInvites() {
  try {
    await ensureServiceReviewIndexes();

    const now = new Date();
    const due = await invitesCollection()
      .find({ status: "scheduled", runAt: { $lte: now } })
      .sort({ runAt: 1 })
      .limit(25)
      .toArray();

    let sent = 0;

    for (const row of due) {
      const claim = await invitesCollection().findOneAndUpdate(
        {
          _id: row._id,
          status: "scheduled",
        },
        {
          $set: {
            status: "sending",
            updatedAt: new Date(),
          },
        },
        { returnDocument: "after" }
      );

      const invite = claim?.value ?? claim;
      if (!invite?._id) continue;

      const telegramId = String(invite.telegramId || "").trim();
      const user = await User.findOne({ telegramId })
        .select({ language: 1 })
        .lean();

      try {
        await sendServiceReviewInviteTelegram(invite, user);
        await invitesCollection().updateOne(
          { _id: invite._id },
          {
            $set: {
              status: "sent",
              sentAt: new Date(),
              updatedAt: new Date(),
              lastError: "",
            },
          }
        );
        sent += 1;
      } catch (error) {
        const detail = String(
          error?.response?.description || error?.message || ""
        ).slice(0, 300);
        await invitesCollection().updateOne(
          { _id: invite._id },
          {
            $set: {
              status: "scheduled",
              runAt: new Date(Date.now() + 2 * 60 * 1000),
              lastError: detail,
              updatedAt: new Date(),
            },
          }
        );
        console.error("processDueServiceReviewInvites send error:", error);
      }
    }

    return { ok: true, processed: due.length, sent };
  } catch (error) {
    console.error("processDueServiceReviewInvites error:", error);
    return { ok: false, reason: "ERROR" };
  }
}

export async function getServiceReviewContext(telegramId) {
  const id = String(telegramId || "").trim();
  if (!id || id.startsWith("guest_")) {
    return { ok: false, reason: "NO_TELEGRAM" };
  }

  await ensureServiceReviewIndexes();

  const invite = await invitesCollection().findOne({ telegramId: id });
  if (!invite) {
    return {
      ok: true,
      eligible: false,
      reason: "NO_INVITE",
    };
  }

  const user = await User.findOne({ telegramId: id })
    .select({ language: 1 })
    .lean();
  const language = resolveUserLanguage(user);

  const completed = invite.status === "completed";
  const canSubmit = invite.status === "sent";

  let order = null;
  let pickupPoint = null;

  const orderId = String(invite.orderId || "").trim();
  if (orderId) {
    order = await Order.findOne({ _id: orderId, userTelegramId: id }).lean();
  }

  const pointId =
    String(invite.pickupPointId || "").trim() ||
    String(order?.pickupPointId || "").trim();
  if (pointId) {
    pickupPoint = await PickupPoint.findById(pointId).lean();
  }

  const ratings = RATING_KEYS.map((key) => ({
    key,
    label: ratingLabelFor(language, key),
    emoji: key === "great" ? "🤩" : key === "good" ? "🙂" : "😕",
    needsDetails: key !== "great",
  }));

  return {
    ok: true,
    eligible: canSubmit || completed,
    canSubmit,
    completed,
    rewardZl: REWARD_ZL,
    language,
    ratings,
    minDetailsChars: MIN_DETAILS_CHARS,
    orderNo: String(order?.orderNo || ""),
    pointTitle: String(
      pickupPoint?.title || order?.pickupPointTitle || ""
    ).trim(),
    sentAt: invite.sentAt || null,
    completedAt: invite.completedAt || null,
  };
}

async function grantServiceReviewCashback(user, inviteId) {
  if (!user) throw new Error("USER_NOT_FOUND");

  user.cashbackLedger = Array.isArray(user.cashbackLedger) ? user.cashbackLedger : [];

  const already = user.cashbackLedger.some(
    (row) => String(row?.source || "") === "service_review_first_order"
  );
  if (already) {
    recalcUserCashbackBalanceFromLedger(user);
    return {
      granted: false,
      cashbackBalance: Number(user.cashbackBalance || 0),
    };
  }

  const now = new Date();
  user.cashbackLedger.push({
    source: "service_review_first_order",
    sourceInviteId: String(inviteId || ""),
    amountZl: REWARD_ZL,
    remainingZl: REWARD_ZL,
    earnedAt: now,
    expiresAt: addDays(now, 40),
    warnedAt: null,
    expiredAt: null,
    expiredAmountZl: 0,
  });

  recalcUserCashbackBalanceFromLedger(user);
  await user.save();

  return {
    granted: true,
    grantedAmountZl: REWARD_ZL,
    cashbackBalance: Number(user.cashbackBalance || 0),
  };
}

async function notifyComplaintsChat({
  telegramId,
  user,
  order,
  pickupPoint,
  rating,
  ratingLabel,
  details,
  testMode = false,
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

  const pointTitle =
    String(pickupPoint?.title || order?.pickupPointTitle || "").trim() || "—";
  const pointAddress =
    String(pickupPoint?.address || order?.pickupPointAddress || "").trim() ||
    "—";

  const lines = [
    testMode
      ? "<b>🧪 TEST · Оценка после 1-го заказа</b>"
      : "<b>⭐ Оценка после 1-го заказа</b>",
    "",
    `<b>Клиент:</b> ${escapeHtml(userLabel)}`,
    order
      ? `<b>Заказ:</b> #${escapeHtml(order.orderNo || order._id)}`
      : null,
    `<b>Точка:</b> ${escapeHtml(pointTitle)}`,
    `<b>Адрес:</b> ${escapeHtml(pointAddress)}`,
    `<b>Оценка:</b> ${escapeHtml(ratingLabel)}`,
    "",
    `<b>Комментарий:</b>`,
    escapeHtml(details || "—"),
  ].filter(Boolean);

  const chatId = complaintsChatId();

  try {
    await bot.telegram.sendMessage(chatId, lines.join("\n"), {
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
    return { ok: true, telegramSent: true };
  } catch (error) {
    console.error("notifyComplaintsChat service review error:", error);
    return {
      ok: false,
      reason: "TELEGRAM_SEND_FAILED",
      detail: String(error?.message || "").slice(0, 200),
    };
  }
}

export async function submitServiceReview({ telegramId, rating, details = "" }) {
  const id = String(telegramId || "").trim();
  const ratingKey = String(rating || "").trim().toLowerCase();

  if (!id || id.startsWith("guest_")) {
    return { ok: false, reason: "NO_TELEGRAM" };
  }

  if (!RATING_KEYS.includes(ratingKey)) {
    return { ok: false, reason: "INVALID_RATING" };
  }

  await ensureServiceReviewIndexes();

  const claim = await invitesCollection().findOneAndUpdate(
    { telegramId: id, status: "sent" },
    {
      $set: {
        status: "submitting",
        updatedAt: new Date(),
      },
    },
    { returnDocument: "before" }
  );

  const invite = claim?.value ?? claim;
  if (!invite?._id) {
    const existing = await invitesCollection().findOne({ telegramId: id });
    if (existing?.status === "completed") {
      return { ok: false, reason: "ALREADY_COMPLETED" };
    }
    return { ok: false, reason: "NOT_ELIGIBLE" };
  }

  const body = String(details || "").trim();
  if (ratingKey !== "great" && body.length < MIN_DETAILS_CHARS) {
    await invitesCollection().updateOne(
      { _id: invite._id, status: "submitting" },
      { $set: { status: "sent", updatedAt: new Date() } }
    );
    return { ok: false, reason: "DETAILS_TOO_SHORT" };
  }

  const user = await User.findOne({ telegramId: id });
  if (!user) {
    await invitesCollection().updateOne(
      { _id: invite._id },
      { $set: { status: "sent", updatedAt: new Date() } }
    );
    return { ok: false, reason: "USER_NOT_FOUND" };
  }

  const language = resolveUserLanguage(user);
  const ratingLabel = ratingLabelFor(language, ratingKey);

  let order = null;
  const orderId = String(invite.orderId || "").trim();
  if (orderId) {
    order = await Order.findOne({ _id: orderId, userTelegramId: id }).lean();
  }

  let pickupPoint = null;
  const pointId =
    String(invite.pickupPointId || "").trim() ||
    String(order?.pickupPointId || "").trim();
  if (pointId) {
    pickupPoint = await PickupPoint.findById(pointId).lean();
  }

  const pointTitle =
    String(pickupPoint?.title || order?.pickupPointTitle || "").trim() || "";
  const pointAddress =
    String(pickupPoint?.address || order?.pickupPointAddress || "").trim() || "";

  const reviewText =
    ratingKey === "great" && !body
      ? ratingLabel
      : `${ratingLabel}\n\n${body}`.trim();

  let reviewDoc = null;
  try {
    reviewDoc = await CustomerReview.create({
      telegramId: id,
      username: String(user.username || ""),
      firstName: String(user.firstName || ""),
      lastName: String(user.lastName || ""),
      text: reviewText,
      orderId: order?._id || null,
      orderNo: String(order?.orderNo || ""),
      pickupPointId: pickupPoint?._id || null,
      pointTitle,
      pointAddress,
      deliveryLabel: "",
      source: testMode
        ? "first_order_service_review_test"
        : "first_order_service_review",
      rating: ratingKey,
      ratingLabel,
      imageUrls: [],
      imageCount: 0,
      telegramSent: false,
    });
  } catch (persistErr) {
    console.error("submitServiceReview persist error:", persistErr);
  }

  const testMode = Boolean(invite?.testMode);

  const telegramResult = await notifyComplaintsChat({
    telegramId: id,
    user,
    order,
    pickupPoint,
    rating: ratingKey,
    ratingLabel,
    details: body || (ratingKey === "great" ? "—" : body),
    testMode,
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

  const cashback = await grantServiceReviewCashback(user, invite._id);

  await invitesCollection().updateOne(
    { _id: invite._id },
    {
      $set: {
        status: "completed",
        completedAt: new Date(),
        rating: ratingKey,
        rewardGrantedAt: cashback.granted ? new Date() : invite.rewardGrantedAt,
        updatedAt: new Date(),
      },
    }
  );

  return {
    ok: true,
    cashbackBalance: cashback.cashbackBalance,
    grantedAmountZl: cashback.granted ? REWARD_ZL : 0,
    reviewId: reviewDoc?._id ? String(reviewDoc._id) : "",
  };
}
