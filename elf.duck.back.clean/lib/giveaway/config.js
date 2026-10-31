export const GIVEAWAY_PRIZE_TOTAL_ZL = 2000;
export const GIVEAWAY_WINNER_COUNT = 25;

/** Дефолтні тири призів (як у класичному розіграші 2 000 zł). */
export const DEFAULT_GIVEAWAY_PRIZE_TIERS = [
  { fromPlace: 1, toPlace: 5, amountZl: 150 },
  { fromPlace: 6, toPlace: 10, amountZl: 100 },
  { fromPlace: 11, toPlace: 25, amountZl: 50 },
];

export function getDefaultGiveawaySettings() {
  return {
    winnerCount: GIVEAWAY_WINNER_COUNT,
    prizeTiers: DEFAULT_GIVEAWAY_PRIZE_TIERS.map((row) => ({ ...row })),
    rulesRu: "",
    rulesPl: "",
  };
}

/**
 * Нормалізує settings місяця.
 * prizeTiers: [{ fromPlace, toPlace, amountZl }]
 */
export function normalizeGiveawaySettings(raw = {}) {
  const defaults = getDefaultGiveawaySettings();
  let winnerCount = Math.round(Number(raw?.winnerCount ?? defaults.winnerCount));
  if (!Number.isFinite(winnerCount) || winnerCount < 1) winnerCount = 1;
  winnerCount = Math.min(200, winnerCount);

  let tiers = Array.isArray(raw?.prizeTiers) ? raw.prizeTiers : null;
  if (!tiers?.length && Array.isArray(raw?.prizesByPlace) && raw.prizesByPlace.length) {
    tiers = raw.prizesByPlace.map((amount, index) => ({
      fromPlace: index + 1,
      toPlace: index + 1,
      amountZl: Number(amount || 0),
    }));
  }
  if (!tiers?.length) {
    tiers = defaults.prizeTiers.map((row) => ({ ...row }));
  }

  const prizeTiers = [];
  for (const row of tiers) {
    let fromPlace = Math.round(Number(row?.fromPlace || 0));
    let toPlace = Math.round(Number(row?.toPlace || fromPlace));
    let amountZl = Number(row?.amountZl || 0);
    if (!Number.isFinite(fromPlace) || fromPlace < 1) continue;
    if (!Number.isFinite(toPlace) || toPlace < fromPlace) toPlace = fromPlace;
    if (!Number.isFinite(amountZl) || amountZl < 0) amountZl = 0;
    fromPlace = Math.min(winnerCount, fromPlace);
    toPlace = Math.min(winnerCount, toPlace);
    prizeTiers.push({
      fromPlace,
      toPlace,
      amountZl: Number(amountZl.toFixed(2)),
    });
  }

  if (!prizeTiers.length) {
    prizeTiers.push({ fromPlace: 1, toPlace: winnerCount, amountZl: 0 });
  }

  prizeTiers.sort((a, b) => a.fromPlace - b.fromPlace);

  return {
    winnerCount,
    prizeTiers,
    rulesRu: String(raw?.rulesRu ?? "").trim(),
    rulesPl: String(raw?.rulesPl ?? "").trim(),
  };
}

export function resolveGiveawaySettings(monthOrSettings) {
  const raw =
    monthOrSettings?.settings && typeof monthOrSettings.settings === "object"
      ? monthOrSettings.settings
      : monthOrSettings;
  return normalizeGiveawaySettings(raw || {});
}

export function prizeAmountForPlace(place, settings = null) {
  const p = Number(place || 0);
  if (!(p >= 1)) return 0;

  if (settings) {
    const cfg = resolveGiveawaySettings(settings);
    for (const tier of cfg.prizeTiers) {
      if (p >= tier.fromPlace && p <= tier.toPlace) {
        return Number(tier.amountZl || 0);
      }
    }
    return 0;
  }

  if (p >= 1 && p <= 5) return 150;
  if (p >= 6 && p <= 10) return 100;
  if (p >= 11 && p <= 25) return 50;
  return 0;
}

export function sumPrizePoolZl(settings = null) {
  const cfg = resolveGiveawaySettings(settings || getDefaultGiveawaySettings());
  let total = 0;
  for (let place = 1; place <= cfg.winnerCount; place += 1) {
    total += prizeAmountForPlace(place, cfg);
  }
  return Number(total.toFixed(2));
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
