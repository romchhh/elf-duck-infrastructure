import User from "../../models/User.js";
import { normalizeAppLanguage } from "../crm/userLanguage.js";

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Мова клієнта для TG: pl | ru (default ru). */
export async function getClientAppLanguage(
  telegramId,
  fallbackLanguageCode = ""
) {
  const id = String(telegramId || "").trim();
  const fallback = normalizeAppLanguage(fallbackLanguageCode);
  if (!id) return fallback || "ru";
  try {
    const user = await User.findOne({ telegramId: id })
      .select({ language: 1 })
      .lean();
    return (
      normalizeAppLanguage(user?.language) ||
      fallback ||
      "ru"
    );
  } catch {
    return fallback || "ru";
  }
}

export function pickClientCopy(lang, ru, pl) {
  return lang === "pl" ? pl : ru;
}

export function contactManagerButtonText(lang) {
  return pickClientCopy(
    lang,
    "💬 Связаться с менеджером",
    "💬 Skontaktuj się z menedżerem"
  );
}

export function payOrderButtonText(lang) {
  return pickClientCopy(lang, "💳 Перейти к оплате", "💳 Przejdź do płatności");
}

export function openCartButtonText(lang) {
  return pickClientCopy(lang, "🛒 Открыть корзину", "🛒 Otwórz koszyk");
}

/** Базовий URL мініапп без trailing slash. */
export function getClientWebAppBaseUrl() {
  return String(process.env.WEBAPP_URL || process.env.APP_URL || "")
    .trim()
    .replace(/\/+$/, "");
}

/**
 * Deep-link у мініапп: сторінка замовлень з авто-відкриттям оплати.
 * Fallback — /cart, якщо немає orderId.
 */
export function buildClientPayOrderWebAppUrl(orderId = "") {
  const base = getClientWebAppBaseUrl();
  if (!base) return "";
  const id = String(orderId || "").trim();
  if (id) {
    return `${base}/orders?payOrderId=${encodeURIComponent(id)}`;
  }
  return `${base}/cart`;
}

export function buildClientCartWebAppUrl() {
  const base = getClientWebAppBaseUrl();
  return base ? `${base}/cart` : "";
}

/** Inline web_app кнопка «Перейти к оплате». */
export function buildPayOrderWebAppKeyboard(lang, orderId) {
  const url = buildClientPayOrderWebAppUrl(orderId);
  if (!url) return undefined;
  return {
    inline_keyboard: [
      [
        {
          text: payOrderButtonText(lang),
          web_app: { url },
        },
      ],
    ],
  };
}

export function trackParcelButtonText(lang) {
  return pickClientCopy(lang, "📦 Отследить посылку", "📦 Śledź przesyłkę");
}

/** «Заказ почти готов» — потрібна оплата. */
export function buildAlmostReadyClientMessage({
  lang = "ru",
  orderNo = "",
  amountText = "",
}) {
  const no = escapeHtml(orderNo);
  const amount = amountText;
  if (lang === "pl") {
    return [
      `🛒 <b>ZAMÓWIENIE PRAWIE GOTOWE!</b>`,
      ``,
      `🔢 <b>Numer zamówienia:</b> #${no}`,
      `💰 <b>Kwota:</b> ${amount}`,
      ``,
      `⚠️ <b>Został ostatni krok!</b>`,
      ``,
      `Twoje zamówienie nie zostało jeszcze przekazane menedżerowi. Aby menedżer otrzymał zamówienie i zaczął je przygotowywać, wybierz sposób płatności.`,
      ``,
      `☑ Potem zamówienie trafi do menedżera do weryfikacji.`,
      ``,
      `Nie zapomnij wybrać płatności — bez tego menedżer nie otrzyma Twojego zamówienia!`,
    ].join("\n");
  }
  return [
    `🛒 <b>ЗАКАЗ ПОЧТИ ГОТОВ!</b>`,
    ``,
    `🔢 <b>Номер заказа:</b> #${no}`,
    `💰 <b>Сумма:</b> ${amount}`,
    ``,
    `⚠️ <b>Остался последний шаг!</b>`,
    ``,
    `Ваш заказ пока не передан менеджеру. Чтобы менеджер получил заказ и начал его готовить, необходимо выбрать способ оплаты.`,
    ``,
    `☑ После этого заказ будет отправлен менеджеру на проверку.`,
    ``,
    `Не забудьте выбрать способ оплаты — без этого менеджер не получит ваш заказ!`,
  ].join("\n");
}

/** Наличные: менеджер нажал «Ожидаю». */
export function buildCashAwaitingClientMessage({
  lang = "ru",
  arrivalTime = "",
  pointAddress = "",
  remainingToPayZl = 0,
}) {
  const time = escapeHtml(arrivalTime);
  const place = escapeHtml(pointAddress);
  const pay = Number(remainingToPayZl || 0).toFixed(2);
  if (lang === "pl") {
    return [
      "✅ <b>TWOJE ZAMÓWIENIE JEST W TRAKCIE ZBIERANIA!</b>",
      "",
      `Oczekujemy Cię o <b>${time}</b>.`,
      `Do zapłaty: <b>${pay} PLN</b>.`,
      `Lokalizacja: <b>${place}</b>.`,
    ].join("\n");
  }
  return [
    "✅ <b>ВАШ ЗАКАЗ В ПРОЦЕССЕ СБОРА!</b>",
    "",
    `Ожидаем вас в <b>${time}</b>.`,
    `К оплате: <b>${pay} PLN</b>.`,
    `Локация: <b>${place}</b>.`,
  ].join("\n");
}

/** BLIK / crypto / UA card: оплата підтверджена. */
export function buildPaymentConfirmedClientMessage({
  lang = "ru",
  arrivalTime = "",
  pointAddress = "",
}) {
  const time = escapeHtml(arrivalTime);
  const place = escapeHtml(pointAddress);
  if (lang === "pl") {
    return [
      "✅ <b>PŁATNOŚĆ POTWIERDZONA!</b>",
      "",
      "Twoje zamówienie jest w trakcie zbierania.",
      `Oczekujemy Cię o <b>${time}</b>.`,
      `Lokalizacja: <b>${place}</b>.`,
    ].join("\n");
  }
  return [
    "✅ <b>ОПЛАТА ПОДТВЕРЖДЕНА!</b>",
    "",
    "Ваш заказ в процессе сбора.",
    `Ожидаем вас в <b>${time}</b>.`,
    `Локация: <b>${place}</b>.`,
  ].join("\n");
}

export function buildCourierAcceptedClientMessage({
  lang = "ru",
  deliveryWindow = "",
}) {
  const window = escapeHtml(deliveryWindow);
  if (lang === "pl") {
    return [
      "✅ <b>Twoje zamówienie zostało przyjęte!</b>",
      "",
      "Zbieramy Twoje zamówienie.",
      `Oczekuj kuriera w przedziale <b>${window}</b>.`,
    ].join("\n");
  }
  return [
    "✅ <b>Ваш заказ принят!</b>",
    "",
    "Мы в процессе сбора вашего заказа.",
    `Ожидайте курьера в промежутке <b>${window}</b>.`,
  ].join("\n");
}

export function buildCourierSoonClientMessage({ lang = "ru" }) {
  if (lang === "pl") {
    return [
      "🚗 <b>Kurier wyjechał i będzie za 15 minut!</b>",
      "",
      "Szukaj szarej Hondy z numerami WB 084CY.",
      "",
      "Wyjdź naprzeciw — kurier może czekać maksymalnie 5 minut. W razie spóźnienia kurier może odjechać, a ponowna dostawa jest płatna w podwójnej wysokości.",
    ].join("\n");
  }
  return [
    "🚗 <b>Курьер выехал и будет через 15 минут!</b>",
    "",
    "Ищите серую Honda с номерами WB 084CY.",
    "",
    "Пожалуйста, выйдите навстречу — курьер может ожидать не более 5 минут. В случае опоздания курьер вправе уехать, а повторная доставка оплачивается в двойном размере.",
  ].join("\n");
}

export function buildCourierArrivedClientMessage({
  lang = "ru",
  orderNo = "",
  managerContact = "",
}) {
  const no = escapeHtml(orderNo);
  const contact = escapeHtml(managerContact || "—");
  if (orderNo) {
    if (lang === "pl") {
      return [
        `🚚 <b>KURIER DOTARŁ POD ADRES</b>`,
        ``,
        `Kurier dotarł po zamówienie <b>#${no}</b>.`,
        ``,
        `📲 <b>Kontakt z menedżerem:</b> ${contact}`,
      ].join("\n");
    }
    return [
      `🚚 <b>КУРЬЕР ПРИБЫЛ НА АДРЕС</b>`,
      ``,
      `Курьер прибыл по заказу <b>#${no}</b>.`,
      ``,
      `📲 <b>Связь с менеджером:</b> ${contact}`,
    ].join("\n");
  }
  if (lang === "pl") {
    return [
      "📍 <b>Kurier jest na miejscu!</b>",
      "",
      "Jeśli nie widzisz kuriera — skontaktuj się z menedżerem.",
    ].join("\n");
  }
  return [
    "📍 <b>Курьер на месте!</b>",
    "",
    "Если не видите курьера — свяжитесь с менеджером.",
  ].join("\n");
}

export function buildInpostPaymentConfirmedClientMessage({
  lang = "ru",
  orderNo = "",
}) {
  const no = escapeHtml(orderNo || "—");
  if (lang === "pl") {
    return [
      "✅ <b>MENEDŻER POTWIERDZIŁ TWOJĄ TRANSAKCJĘ!</b>",
      "",
      `Zamówienie <b>#${no}</b> jest opłacone.`,
      "",
      "Już zbieramy Twoje zamówienie i wyślemy je do końca dnia roboczego.",
      "",
      "Oczekuj kolejnych wiadomości.",
    ].join("\n");
  }
  return [
    "✅ <b>МЕНЕДЖЕР ПОДТВЕРДИЛ ВАШУ ТРАНЗАКЦИЮ!</b>",
    "",
    `Заказ <b>#${no}</b> оплачен.`,
    "",
    "Мы уже собираем ваш заказ и отправим его до конца рабочего дня.",
    "",
    "Ожидайте дальнейших сообщений.",
  ].join("\n");
}

export function buildInpostShippedClientMessage({
  lang = "ru",
  orderNo = "",
  trackingNumber = "",
  lockerAddress = "",
}) {
  const no = escapeHtml(orderNo || "—");
  const track = escapeHtml(trackingNumber);
  const lines =
    lang === "pl"
      ? [
          "📦 <b>TWOJE ZAMÓWIENIE ZOSTAŁO WYSŁANE!</b>",
          "",
          `Zamówienie <b>#${no}</b> przekazano do InPost.`,
          "",
          `Numer trackingowy: <code>${track}</code>`,
        ]
      : [
          "📦 <b>ВАШ ЗАКАЗ ОТПРАВЛЕН!</b>",
          "",
          `Заказ <b>#${no}</b> передан в InPost.`,
          "",
          `Трекинг-номер: <code>${track}</code>`,
        ];

  if (lockerAddress) {
    lines.push("");
    lines.push(
      lang === "pl"
        ? `Paczkomat: <b>${escapeHtml(lockerAddress)}</b>`
        : `Пачкомат: <b>${escapeHtml(lockerAddress)}</b>`
    );
  }

  lines.push("");
  lines.push(lang === "pl" ? "Dziękujemy za zakup ❤️" : "Спасибо за покупку ❤️");
  return lines.join("\n");
}

export function fallbackArrivalTime(lang) {
  return pickClientCopy(lang, "указанное время", "wskazany czas");
}

export function fallbackPickupPoint(lang) {
  return pickClientCopy(
    lang,
    "указанная точка самовывоза",
    "wskazany punkt odbioru"
  );
}

export function fallbackDeliveryWindow(lang) {
  return pickClientCopy(
    lang,
    "указанный промежуток времени",
    "wskazany przedział czasu"
  );
}

/** Нагадування вибрати оплату (5 / 9 хв). */
export function buildUnpaidPaymentReminderClientMessage({
  lang = "ru",
  orderNo = "",
  urgent = false,
}) {
  const no = escapeHtml(orderNo || "—");
  if (lang === "pl") {
    return urgent
      ? [
          "⚠️ <b>OSTATNI KROK</b>",
          "",
          `Zamówienie <b>#${no}</b> nie zostało jeszcze przekazane menedżerowi.`,
          "",
          "Wybierz sposób płatności w ciągu około 1 minuty, inaczej zamówienie zostanie anulowane.",
        ].join("\n")
      : [
          "⏳ <b>ZOSTAŁ OSTATNI KROK</b>",
          "",
          `Zamówienie <b>#${no}</b> utworzono, ale menedżer jeszcze go nie otrzymał.`,
          "",
          "Wybierz sposób płatności, aby zamówienie trafiło do menedżera.",
        ].join("\n");
  }
  return urgent
    ? [
        "⚠️ <b>ПОСЛЕДНИЙ ШАГ</b>",
        "",
        `Заказ <b>#${no}</b> ещё не передан менеджеру.`,
        "",
        "Выберите способ оплаты примерно в течение 1 минуты, иначе заказ будет аннулирован.",
      ].join("\n")
    : [
        "⏳ <b>ОСТАЛСЯ ПОСЛЕДНИЙ ШАГ</b>",
        "",
        `Заказ <b>#${no}</b> создан, но менеджер его ещё не получил.`,
        "",
        "Выберите способ оплаты, чтобы заказ ушёл менеджеру.",
      ].join("\n");
}

export function formatCashbackExpireDateLocalized(date, lang = "ru") {
  const d = new Date(date);
  if (!Number.isFinite(d.getTime())) return "—";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const sep = lang === "pl" ? " o " : " в ";
  return `${day}.${month}.${year}${sep}${hours}:${minutes}`;
}

export function buildBotStartCaption({ lang = "ru", hasReferralBonus = false }) {
  if (lang === "pl") {
    return hasReferralBonus
      ? "Witamy w ELF DUCK SHOP!\n\n🎁 Masz 10% zniżki na pierwsze zamówienie (od 65 zł). Kliknij przycisk poniżej 👇"
      : "Witamy w ELF DUCK SHOP!";
  }
  return hasReferralBonus
    ? "Добро пожаловать в ELF DUCK SHOP!\n\n🎁 У тебя 10% скидки на первый заказ (от 65 zł). Жми кнопку ниже 👇"
    : "Добро пожаловать в ELF DUCK SHOP!";
}

export function visitShopButtonText(lang) {
  return pickClientCopy(lang, "💨 Посетить магазин 🛍️", "💨 Odwiedź sklep 🛍️");
}

export function botStartErrorText(lang) {
  return pickClientCopy(
    lang,
    "Произошла ошибка при открытии магазина. Попробуйте ещё раз.",
    "Wystąpił błąd podczas otwierania sklepu. Spróbuj ponownie."
  );
}

export function buildManagerRelayToClientMessage({
  lang = "ru",
  orderNo = "",
  messageText = "",
}) {
  const no = escapeHtml(orderNo || "—");
  const body = escapeHtml(messageText);
  if (lang === "pl") {
    return [
      "💬 <b>Wiadomość od menedżera</b>",
      "",
      `Zamówienie: <b>#${no}</b>`,
      "",
      body,
    ].join("\n");
  }
  return [
    "💬 <b>Сообщение от менеджера</b>",
    "",
    `Заказ: <b>#${no}</b>`,
    "",
    body,
  ].join("\n");
}

export function buildReferralBonusReadyClientMessage({
  lang = "ru",
  referralLabel = "",
}) {
  const label = escapeHtml(referralLabel || (lang === "pl" ? "znajomy" : "друг"));
  if (lang === "pl") {
    return [
      "🎁 <b>Bonus za polecenie jest gotowy!</b>",
      "",
      `Twój polecony <b>${label}</b> złożył zamówienie.`,
      "",
      "Odbierz bonus za polecenie w panelu — <b>25 zł</b> na saldo.",
    ].join("\n");
  }
  return [
    "🎁 <b>Реферальный бонус готов!</b>",
    "",
    `Ваш реферал <b>${label}</b> совершил покупку.`,
    "",
    "Заберите бонус за реферала в кабинете — <b>25 zł</b> на баланс.",
  ].join("\n");
}

export function claimReferralBonusButtonText(lang) {
  return pickClientCopy(
    lang,
    "Забрать бонус в кабинете",
    "Odbierz bonus w panelu"
  );
}

export function buildCashbackExpiringSoonClientMessage({
  lang = "ru",
  firstAmount = "0.00",
  firstExpireText = "",
  firstDays = 0,
  nextRowsText = "",
}) {
  if (lang === "pl") {
    return [
      `💰 <b>CASHBACK WKRÓTCE WYGAŚNIE</b>`,
      ``,
      `Twój cashback <b>${firstAmount} zł</b> wygaśnie:`,
      `<b>${firstExpireText}</b>`,
      `(za <b>${firstDays}</b> dni)`,
      ``,
      `Zdąż wykorzystać!`,
      nextRowsText,
    ].join("\n");
  }
  return [
    `💰 <b>КЭШБЕК СКОРО СГОРИТ</b>`,
    ``,
    `Твой кэшбек <b>${firstAmount} zł</b> сгорит:`,
    `<b>${firstExpireText}</b>`,
    `(через <b>${firstDays}</b> дн.)`,
    ``,
    `Успей использовать!`,
    nextRowsText,
  ].join("\n");
}

export function buildCashbackExpiredClientMessage({
  lang = "ru",
  expiredSum = "0.00",
  expiredRowsText = "",
  activeBalance = "0.00",
  activeRowsText = "",
}) {
  if (lang === "pl") {
    return [
      `🔥 <b>CZĘŚĆ CASHBACKU WYGASŁA</b>`,
      ``,
      `Wygasło: <b>${expiredSum} zł</b>`,
      expiredRowsText,
      ``,
      `Aktualne aktywne saldo: <b>${activeBalance} zł</b>`,
      activeRowsText,
    ].join("\n");
  }
  return [
    `🔥 <b>ЧАСТЬ КЭШБЕКА СГОРЕЛА</b>`,
    ``,
    `Сгорело: <b>${expiredSum} zł</b>`,
    expiredRowsText,
    ``,
    `Текущий активный остаток: <b>${activeBalance} zł</b>`,
    activeRowsText,
  ].join("\n");
}

export function contactButtonText(lang) {
  return pickClientCopy(lang, "Связаться", "Skontaktuj się");
}
