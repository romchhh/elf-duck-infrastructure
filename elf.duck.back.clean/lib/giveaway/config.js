export const GIVEAWAY_PRIZE_TOTAL_ZL = 2000;
export const GIVEAWAY_WINNER_COUNT = 25;

export function prizeAmountForPlace(place) {
  const p = Number(place || 0);
  if (p >= 1 && p <= 5) return 150;
  if (p >= 6 && p <= 10) return 100;
  if (p >= 11 && p <= 25) return 50;
  return 0;
}

export const GIVEAWAY_RULES_RU = `ElfDuck раздаёт 2 000 zł — ежемесячный розыгрыш.

• Период: с 1-го по 25-е число каждого месяца.
• 25-го объявляются 25 победителей (случайный выбор среди записей).
• Одна оплаченная покупка = одна запись (сумма не важна).
• Заказы, оплаченные через BLIK, не участвуют.
• Призы: 1–5 места — 150 zł, 6–10 — 100 zł, 11–25 — 50 zł.
• Выигрыш начисляется на баланс кэшбека.`;

export const GIVEAWAY_RULES_PL = `ElfDuck rozdaje 2 000 zł — comiesięczny konkurs.

• Okres: od 1. do 25. dnia każdego miesiąca.
• 25. ogłaszamy 25 zwycięzców (losowanie wśród zgłoszeń).
• Jedno opłacone zamówienie = jedno zgłoszenie.
• Zamówienia opłacone BLIK-iem nie biorą udziału.
• Nagrody: miejsca 1–5 — 150 zł, 6–10 — 100 zł, 11–25 — 50 zł.
• Wygrana trafia na saldo cashbacku.`;

export const GIVEAWAY_WINNER_MESSAGE_RU =
  "Поздравляем! Вы победили в нашей новой рубрике „ElfDuck раздаёт 2 000 zł“. Ваш выигрыш в размере {amount} zł уже начислен на баланс.";

export const GIVEAWAY_WINNER_MESSAGE_PL =
  "Gratulacje! Wygrałeś w rubryce „ElfDuck rozdaje 2 000 zł”. Twoja wygrana {amount} zł została już dodana do salda cashbacku.";
