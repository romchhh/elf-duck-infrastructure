import Order from "../../models/Order.js";
import PickupPoint from "../../models/PickupPoint.js";
import User from "../../models/User.js";
import {
  getClientDeliveryBots,
  getShopBotByIndex,
} from "../telegram/clientBotDelivery.js";
import { getPrimaryShopBotIndex } from "../telegram/shopBotPrimary.js";

export const DEFAULT_COMPLAINTS_CHAT_ID = "-1003968794671";

const MAX_TEXT_LEN = 4000;
const MAX_IMAGES = 5;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function complaintsChatId() {
  const fromEnv = String(process.env.COMPLAINTS_TELEGRAM_CHAT_ID || "").trim();
  return fromEnv || DEFAULT_COMPLAINTS_CHAT_ID;
}

function parseDataUrlImage(dataUrl) {
  const match = String(dataUrl || "")
    .trim()
    .match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/i);

  if (!match) return null;

  const contentType = match[1].toLowerCase();
  if (!ALLOWED_IMAGE_TYPES.has(contentType)) return null;

  const buffer = Buffer.from(match[2].replace(/\s+/g, ""), "base64");
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) return null;

  const ext =
    contentType === "image/png"
      ? "png"
      : contentType === "image/webp"
        ? "webp"
        : "jpg";

  return { buffer, contentType, filename: `complaint.${ext}` };
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function deliveryKindLabel(order, pickupPoint) {
  const deliveryType = String(order?.deliveryType || "").trim().toLowerCase();
  const deliveryMethod = String(order?.deliveryMethod || "").trim().toLowerCase();
  const pointKey = String(pickupPoint?.key || "")
    .trim()
    .toLowerCase()
    .replace(/,+$/, "");

  if (
    deliveryType === "delivery" ||
    deliveryMethod === "courier" ||
    pointKey === "delivery"
  ) {
    return "Доставка — курьер";
  }

  if (deliveryMethod === "inpost" || pointKey === "delivery-2") {
    return "Доставка — InPost";
  }

  return "Самовывоз";
}

export async function submitCustomerComplaint({
  telegramId,
  text,
  images = [],
  orderId = "",
  pickupPointId = "",
  source = "",
}) {
  const id = String(telegramId || "").trim();
  const body = String(text || "").trim();

  if (!id || id.startsWith("guest_")) {
    return { ok: false, reason: "NO_TELEGRAM" };
  }

  if (body.length < 3) {
    return { ok: false, reason: "TEXT_TOO_SHORT" };
  }

  if (body.length > MAX_TEXT_LEN) {
    return { ok: false, reason: "TEXT_TOO_LONG" };
  }

  const imageList = Array.isArray(images) ? images.slice(0, MAX_IMAGES) : [];
  const parsedImages = [];

  for (const raw of imageList) {
    const parsed = parseDataUrlImage(raw);
    if (!parsed) {
      return { ok: false, reason: "INVALID_IMAGE" };
    }
    parsedImages.push(parsed);
  }

  let order = null;
  const orderIdStr = String(orderId || "").trim();
  if (orderIdStr) {
    order = await Order.findOne({ _id: orderIdStr, userTelegramId: id }).lean();
    if (!order) {
      return { ok: false, reason: "ORDER_NOT_FOUND" };
    }
  }

  let pickupPoint = null;
  const pointId =
    String(pickupPointId || "").trim() ||
    String(order?.pickupPointId || "").trim();

  if (pointId) {
    pickupPoint = await PickupPoint.findById(pointId).lean();
  }

  const user = await User.findOne({ telegramId: id })
    .select({ username: 1, firstName: 1, lastName: 1 })
    .lean();

  const userLabel = [
    user?.firstName,
    user?.lastName,
    user?.username ? `@${user.username}` : "",
    `ID ${id}`,
  ]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" · ");

  const pointTitle =
    String(pickupPoint?.title || order?.pickupPointTitle || "").trim() ||
    "—";
  const pointAddress =
    String(pickupPoint?.address || order?.pickupPointAddress || "").trim() ||
    "—";
  const deliveryLabel = order
    ? deliveryKindLabel(order, pickupPoint)
    : deliveryKindLabel({}, pickupPoint);

  const lines = [
    "<b>Жалоба от клиента</b>",
    "",
    `<b>Клиент:</b> ${escapeHtml(userLabel)}`,
    order
      ? `<b>Заказ:</b> #${escapeHtml(order.orderNo || order._id)}`
      : null,
    `<b>Точка:</b> ${escapeHtml(pointTitle)}`,
    `<b>Адрес:</b> ${escapeHtml(pointAddress)}`,
    `<b>Доставка:</b> ${escapeHtml(deliveryLabel)}`,
    source ? `<b>Источник:</b> ${escapeHtml(source)}` : null,
    "",
    `<b>Текст:</b>`,
    escapeHtml(body),
  ].filter(Boolean);

  const messageHtml = lines.join("\n");

  const bots = getClientDeliveryBots();
  const bot =
    getShopBotByIndex(getPrimaryShopBotIndex()) || bots[0] || null;

  if (!bot?.telegram) {
    return { ok: false, reason: "BOT_UNAVAILABLE" };
  }

  const chatId = complaintsChatId();

  try {
    await bot.telegram.sendMessage(chatId, messageHtml, {
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });

    if (parsedImages.length === 1) {
      await bot.telegram.sendPhoto(
        chatId,
        { source: parsedImages[0].buffer, filename: parsedImages[0].filename },
        { caption: "Скрин к жалобе" }
      );
    } else if (parsedImages.length > 1) {
      await bot.telegram.sendMediaGroup(
        chatId,
        parsedImages.map((img, index) => ({
          type: "photo",
          media: { source: img.buffer, filename: img.filename },
          ...(index === 0
            ? {
                caption: `Скрины к жалобе (${parsedImages.length})`,
              }
            : {}),
        }))
      );
    }

    return { ok: true };
  } catch (error) {
    console.error("submitCustomerComplaint telegram error:", error);
    return {
      ok: false,
      reason: "TELEGRAM_SEND_FAILED",
      detail: String(error?.response?.description || error?.message || ""),
    };
  }
}
