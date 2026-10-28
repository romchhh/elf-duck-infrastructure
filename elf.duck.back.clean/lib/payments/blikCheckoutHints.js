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
  "Обратите внимание: при оплате через BLIK кэшбэк за заказ не начисляется, а заказ не участвует в ежемесячном розыгрыше 2 000 zł.";

export const BLIK_GIVEAWAY_NOTICE_PL =
  "Uwaga: przy płatności BLIK nie naliczamy cashbacku, a zamówienie nie bierze udziału w comiesięcznym konkursie 2 000 zł.";

export const BLIK_CASH_PREFERENCE_RU = `Будем вам очень благодарны, если вы выберете оплату наличными 🙏

💡 Наличные можно снять в магазине Żabka рядом с точкой самовывоза.`;

export const BLIK_CASH_PREFERENCE_PL = `Będziemy bardzo wdzięczni, jeśli wybierzesz płatność gotówką 🙏

💡 Gotówkę możesz wypłacić w sklepie Żabka obok punktu odbioru.`;
