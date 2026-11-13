/** Посилання на Żabka біля точок самовивозу (Google Maps). */
const ZABKA_MAPS_BY_POINT_KEY = {
  praga:
    "https://www.google.com/maps/search/?api=1&query=%C5%BBabka+Warszawa+Praga",
  "r-dmie-cie":
    "https://www.google.com/maps/search/?api=1&query=%C5%BBabka+Warszawa+%C5%9Ar%C3%B3dmie%C5%9Bcie",
  "mokot-w":
    "https://www.google.com/maps/search/?api=1&query=%C5%BBabka+Warszawa+Mokot%C3%B3w",
  wola: "https://www.google.com/maps/search/?api=1&query=%C5%BBabka+Warszawa+Wola",
  delivery:
    "https://www.google.com/maps/search/?api=1&query=%C5%BBabka+Warszawa",
};

export function resolveZabkaMapsUrl(pointKey = "", address = "") {
  const key = String(pointKey || "")
    .trim()
    .toLowerCase()
    .replace(/,+$/, "");

  if (ZABKA_MAPS_BY_POINT_KEY[key]) {
    return ZABKA_MAPS_BY_POINT_KEY[key];
  }

  const addr = String(address || "").trim();
  if (addr) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      `Żabka ${addr}`
    )}`;
  }

  return "https://www.google.com/maps/search/?api=1&query=%C5%BBabka+Warszawa";
}

export const BLIK_GIVEAWAY_NOTICE_RU =
  "Обратите внимание: при оплате через BLIK заказ не участвует в ежемесячном розыгрыше 2 000 zł.";

export const BLIK_GIVEAWAY_NOTICE_PL =
  "Uwaga: przy płatności BLIK zamówienie nie bierze udziału w comiesięcznym konkursie 2 000 zł.";

export const BLIK_CASH_PREFERENCE_RU = `Будем вам очень благодарны, если вы выберете оплату наличными 🙏

💡 Наличные можно снять в магазине Żabka рядом с точкой самовывоза.`;

export const BLIK_CASH_PREFERENCE_PL = `Będziemy bardzo wdzięczni, jeśli wybierzesz płatność gotówką 🙏

💡 Gotówkę możesz wypłacić w sklepie Żabka obok punktu odbioru.`;

/** Реквізити BLIK показуємо лише для InPost; самовивіз / курʼєр — без номера рахунку. */
export function shouldShowBlikRequisites(order = {}, point = null) {
  const deliveryType = String(
    order?.checkoutDeliveryType || order?.deliveryType || ""
  )
    .trim()
    .toLowerCase();
  const deliveryMethod = String(order?.deliveryMethod || "")
    .trim()
    .toLowerCase();
  if (deliveryType === "delivery" && deliveryMethod === "inpost") return true;

  const pointKey = String(point?.key || order?.pickupPointKey || "")
    .trim()
    .toLowerCase()
    .replace(/,+$/, "");
  if (pointKey === "delivery-2" || pointKey.includes("inpost")) return true;

  return false;
}

/**
 * Підказка Tytuł/Imię для BLIK.
 * Зараз реквізити лише InPost, тож підказку ховаємо скрізь (як раніше для delivery).
 */
export function shouldHideBlikTransferHint(order = {}, point = null) {
  if (!shouldShowBlikRequisites(order, point)) return true;

  const pointKey = String(point?.key || order?.pickupPointKey || "")
    .trim()
    .toLowerCase()
    .replace(/,+$/, "");
  if (pointKey.includes("wola")) return true;

  const deliveryType = String(order?.deliveryType || "").trim().toLowerCase();
  const deliveryMethod = String(order?.deliveryMethod || "").trim().toLowerCase();
  if (deliveryType === "delivery" || deliveryMethod === "courier" || deliveryMethod === "inpost") {
    return true;
  }

  if (pointKey === "delivery" || pointKey === "delivery-2" || pointKey.startsWith("delivery")) {
    return true;
  }

  return false;
}

export function getBlikRecipientFirstName(order = {}, point = null) {
  const pointKey = String(point?.key || order?.pickupPointKey || "")
    .trim()
    .toLowerCase();
  if (pointKey.includes("mokot")) return "Vitalii";
  return "Dmytro";
}
