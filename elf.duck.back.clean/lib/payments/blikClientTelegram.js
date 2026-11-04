import {
  BLIK_CASH_PREFERENCE_PL,
  BLIK_CASH_PREFERENCE_RU,
  BLIK_GIVEAWAY_NOTICE_PL,
  BLIK_GIVEAWAY_NOTICE_RU,
  getBlikRecipientFirstName,
  resolveZabkaMapsUrl,
  shouldHideBlikTransferHint,
} from "./blikCheckoutHints.js";
import { getBlikPreferCashBannerUrl } from "./blikPreferCashBannerMedia.js";
import PickupPoint from "../../models/PickupPoint.js";
import { getClientAppLanguage, pickClientCopy } from "../telegram/clientOrderMessages.js";
import { sendViaUserShopBot } from "../telegram/clientBotDelivery.js";

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function resolveOrderPaymentPoint(order) {
  if (!order) return null;

  if (order.deliveryType === "pickup" && order.pickupPointId) {
    return PickupPoint.findById(order.pickupPointId).lean();
  }

  if (order.deliveryType === "delivery") {
    const deliveryKey =
      order.deliveryMethod === "inpost" ? "delivery-2" : "delivery";
    return PickupPoint.findOne({
      key: { $in: [deliveryKey, `${deliveryKey},`] },
    }).lean();
  }

  return null;
}

function getOrderPayablePlnZl(order = {}) {
  const payment = order?.payment || {};
  if (payment.cashbackFullyPaid === true) return 0;

  const remaining = Number(payment.cashbackRemainingToPayZl || 0);
  if (remaining > 0) return Number(remaining.toFixed(2));

  const totalZl = Number(order?.totalZl || 0);
  const promoZl = Math.max(0, Number(payment.promoDiscountZl || 0));
  return Number(Math.max(0, totalZl - promoZl).toFixed(2));
}

function resolveBlikDetailsValue(order, point) {
  const methods = Array.isArray(point?.paymentConfig?.methods)
    ? point.paymentConfig.methods
    : [];
  const blik = methods.find(
    (m) =>
      m &&
      m.isActive !== false &&
      String(m.key || "").trim().toLowerCase() === "blik"
  );
  return String(blik?.detailsValue || "").trim();
}

export function buildBlikPaymentClientCaption({
  lang = "ru",
  order = {},
  point = null,
  detailsValue = "",
}) {
  const isPl = lang === "pl";
  const orderNo = escapeHtml(order?.orderNo || "—");
  const payable = getOrderPayablePlnZl(order).toFixed(2);
  const requisites = escapeHtml(detailsValue || "—");
  const hideTransferHint = shouldHideBlikTransferHint(order, point);
  const imie = escapeHtml(getBlikRecipientFirstName(order, point));

  const lines = [
    isPl ? "📱 <b>PŁATNOŚĆ BLIK</b>" : "📱 <b>ОПЛАТА BLIK</b>",
    "",
    isPl
      ? `Zamówienie <b>#${orderNo}</b>`
      : `Заказ <b>#${orderNo}</b>`,
    isPl
      ? `Do zapłaty: <b>${payable} zł</b>`
      : `К оплате: <b>${payable} zł</b>`,
    "",
    isPl ? `<b>Dane do przelewu:</b>` : `<b>Реквизиты:</b>`,
    `<code>${requisites}</code>`,
  ];

  if (!hideTransferHint) {
    lines.push(
      "",
      isPl ? "⚠️ <b>Ważne przy przelewie BLIK</b>" : "⚠️ <b>Важно при переводе BLIK</b>",
      isPl
        ? `W polu <b>Tytuł</b>: <b>zwrot</b>`
        : `В поле <b>Tytuł</b>: <b>zwrot</b>`,
      isPl
        ? `W polu <b>Imię</b>: <b>${imie}</b>`
        : `В поле <b>Imię</b>: <b>${imie}</b>`
    );
  }

  lines.push(
    "",
    escapeHtml(isPl ? BLIK_CASH_PREFERENCE_PL : BLIK_CASH_PREFERENCE_RU),
    "",
    escapeHtml(isPl ? BLIK_GIVEAWAY_NOTICE_PL : BLIK_GIVEAWAY_NOTICE_RU),
    "",
    isPl
      ? "Jeśli nie otrzymamy płatności w ciągu 10 minut po potwierdzeniu — zamówienie zostanie anulowane."
      : "Если мы не получим оплату в течение 10 минут после подтверждения — заказ будет отменён."
  );

  return lines.join("\n");
}

/**
 * Після payment-check (BLIK): банер «краще готівка» + реквізити та підказки в primary shop-бот.
 */
export async function sendClientBlikPaymentInstructions(order) {
  if (!order?.userTelegramId) return { ok: false, reason: "NO_TELEGRAM_ID" };

  const method = String(order?.payment?.method || "").trim().toLowerCase();
  if (method !== "blik") return { ok: false, reason: "NOT_BLIK" };

  const telegramId = String(order.userTelegramId).trim();
  const lang = await getClientAppLanguage(telegramId);
  const point = await resolveOrderPaymentPoint(order);
  const detailsValue = resolveBlikDetailsValue(order, point);
  const caption = buildBlikPaymentClientCaption({
    lang,
    order,
    point,
    detailsValue,
  });

  const bannerUrl = getBlikPreferCashBannerUrl(lang);
  const zabkaUrl = resolveZabkaMapsUrl(point?.key, point?.address);

  const replyMarkup = {
    inline_keyboard: [
      [
        {
          text: pickClientCopy(
            lang,
            "📍 Ближайшая Żabka на Google Maps",
            "📍 Najbliższa Żabka w Google Maps"
          ),
          url: zabkaUrl,
        },
      ],
    ],
  };

  const preferredBotIndex = Number(order?.shopBotIndex);

  await sendViaUserShopBot(
    telegramId,
    async (clientBot) => {
      return clientBot.telegram.sendPhoto(telegramId, { url: bannerUrl }, {
        caption,
        parse_mode: "HTML",
        reply_markup: replyMarkup,
      });
    },
    {
      preferredBotIndex: Number.isFinite(preferredBotIndex)
        ? preferredBotIndex
        : undefined,
    }
  );

  return { ok: true };
}
