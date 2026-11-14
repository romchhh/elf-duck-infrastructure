/**
 * Нарахований кешбек за замовлення.
 * BLIK дає кешбек лише на InPost. Готівка, крипта, карта — як раніше, на всіх доставках.
 */
export function isOrderEligibleForEarnedCashback(order) {
  const method = String(order?.payment?.method || "")
    .trim()
    .toLowerCase();
  if (method !== "blik") return true;

  const deliveryType = String(order?.deliveryType || "")
    .trim()
    .toLowerCase();
  const deliveryMethod = String(order?.deliveryMethod || "")
    .trim()
    .toLowerCase();

  return deliveryType === "delivery" && deliveryMethod === "inpost";
}
