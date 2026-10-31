/**
 * Promo activation limits:
 * - maxActivations: total uses across all clients (0 = unlimited)
 * - maxActivationsPerUser: uses per client (0 = unlimited, default 1)
 * Expiry (expiresAt) is independent of these limits.
 * - min order total to apply a promo on an order: PROMO_MIN_ORDER_TOTAL_ZL (default 100)
 */

/** Мінімальна сума замовлення (zł), щоб застосувати промокод. */
export const PROMO_MIN_ORDER_TOTAL_ZL = Math.max(
  0,
  Number(process.env.PROMO_MIN_ORDER_TOTAL_ZL || 100) || 100
);

export function getPromoMinOrderTotalZl() {
  return PROMO_MIN_ORDER_TOTAL_ZL;
}

/** Чи можна застосувати промокод до замовлення з таким totalZl. */
export function isOrderTotalEligibleForPromo(orderTotalZl) {
  const total = Number(orderTotalZl || 0);
  if (!Number.isFinite(total)) return false;
  return total + 1e-9 >= getPromoMinOrderTotalZl();
}

export function normalizePromoCodeValue(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 32);
}

export function getPromoMaxActivations(promo) {
  return Math.max(0, Number(promo?.maxActivations || 0));
}

/** Default 1 = one use per client (legacy behaviour). 0 = unlimited per client. */
export function getPromoMaxActivationsPerUser(promo) {
  if (
    promo?.maxActivationsPerUser === undefined ||
    promo?.maxActivationsPerUser === null ||
    promo?.maxActivationsPerUser === ""
  ) {
    return 1;
  }
  return Math.max(0, Number(promo.maxActivationsPerUser || 0));
}

export function countUserPromoActivations(user, promo, telegramId, code) {
  const safeCode = normalizePromoCodeValue(code);
  const safeTelegramId = String(telegramId || "");

  const fromUser = Array.isArray(user?.promoCodeActivations)
    ? user.promoCodeActivations.filter(
        (row) => normalizePromoCodeValue(row?.code) === safeCode
      ).length
    : 0;

  const fromPromo = Array.isArray(promo?.activations)
    ? promo.activations.filter(
        (row) => String(row?.telegramId || "") === safeTelegramId
      ).length
    : 0;

  return Math.max(fromUser, fromPromo);
}

export function isPromoGlobalLimitReached(promo) {
  const max = getPromoMaxActivations(promo);
  if (max <= 0) return false;
  return Number(promo?.activationsCount || 0) >= max;
}

export function isPromoPerUserLimitReached(user, promo, telegramId, code) {
  const maxPerUser = getPromoMaxActivationsPerUser(promo);
  if (maxPerUser <= 0) return false;
  return (
    countUserPromoActivations(user, promo, telegramId, code) >= maxPerUser
  );
}
