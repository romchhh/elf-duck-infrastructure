/** Stats day helpers — no imports from chunk*.js (avoid circular deps). */

export const STATS_ORDERS_LOOKBACK_MS = 10 * 24 * 60 * 60 * 1000;

export function getWarsawDayKey(dateLike = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(dateLike));

  const year = parts.find((p) => p.type === "year")?.value || "0000";
  const month = parts.find((p) => p.type === "month")?.value || "00";
  const day = parts.find((p) => p.type === "day")?.value || "00";

  return `${year}-${month}-${day}`;
}

export function getOrderStatsFulfillmentKind(order) {
  const deliveryType = String(order?.deliveryType || "")
    .trim()
    .toLowerCase();
  const deliveryMethod = String(order?.deliveryMethod || "")
    .trim()
    .toLowerCase();

  if (deliveryType === "delivery" && deliveryMethod === "courier") {
    return "courier";
  }
  if (deliveryType === "delivery" && deliveryMethod === "inpost") {
    return "inpost";
  }
  if (deliveryType === "pickup") {
    return "pickup";
  }
  return "other";
}

/**
 * День у «СТАТИСТИКА ДНЯ» / Google tiers:
 * - pickup: «виконано» (completed/done)
 * - courier: «🚚 Заказ доставлен» (deliveredAt)
 * - inpost: «📦 отправлен» (shipped + shippedAt)
 */
export function shouldCountOrderInDailyStats(order) {
  if (!order) return false;

  const status = String(order?.status || "").trim().toLowerCase();
  if (["canceled", "annulled"].includes(status)) return false;

  const kind = getOrderStatsFulfillmentKind(order);

  if (kind === "inpost") {
    return status === "shipped" && Boolean(order?.shippedAt);
  }

  if (kind === "courier") {
    return Boolean(order?.deliveredAt);
  }

  if (kind === "pickup") {
    return ["completed", "done"].includes(status);
  }

  return ["completed", "done", "shipped"].includes(status);
}

export function getOrderStatsDayAnchor(order) {
  if (!order) return null;

  const kind = getOrderStatsFulfillmentKind(order);

  if (kind === "inpost") {
    return order.shippedAt || null;
  }

  if (kind === "courier") {
    return order.deliveredAt || null;
  }

  return order.completedAt || order.stockCommittedAt || order.createdAt || null;
}

export function getOrderStatsDayKey(order) {
  const anchor = getOrderStatsDayAnchor(order);
  if (!anchor) return "";
  return getWarsawDayKey(anchor);
}

export function orderBelongsToStatsDay(order, dayKey) {
  if (!dayKey) return false;
  if (!shouldCountOrderInDailyStats(order)) return false;
  return getOrderStatsDayKey(order) === dayKey;
}

function pickupStatsTimeOr(since) {
  return {
    $or: [
      { completedAt: { $gte: since } },
      { stockCommittedAt: { $gte: since } },
      {
        completedAt: null,
        stockCommittedAt: null,
        createdAt: { $gte: since },
      },
    ],
  };
}

export function buildStatsOrdersMongoFilter(match, sinceDate) {
  const since =
    sinceDate instanceof Date
      ? sinceDate
      : new Date(Date.now() - STATS_ORDERS_LOOKBACK_MS);

  const base = { ...match };

  const deliveryType = String(base.deliveryType || "").trim().toLowerCase();
  const deliveryMethod = String(base.deliveryMethod || "").trim().toLowerCase();

  if (deliveryType === "delivery" && deliveryMethod === "courier") {
    const { deliveryType: _dt, deliveryMethod: _dm, ...rest } = base;
    return {
      ...rest,
      deliveryType: "delivery",
      deliveryMethod: "courier",
      deliveredAt: { $gte: since },
      status: { $nin: ["canceled", "annulled"] },
    };
  }

  if (deliveryType === "delivery" && deliveryMethod === "inpost") {
    const { deliveryType: _dt, deliveryMethod: _dm, ...rest } = base;
    return {
      ...rest,
      deliveryType: "delivery",
      deliveryMethod: "inpost",
      status: "shipped",
      shippedAt: { $gte: since },
    };
  }

  if (base.pickupPointId) {
    return {
      ...base,
      status: { $in: ["completed", "done"] },
      ...pickupStatsTimeOr(since),
    };
  }

  return {
    ...base,
    $or: [
      {
        deliveryType: "pickup",
        status: { $in: ["completed", "done"] },
        ...pickupStatsTimeOr(since),
      },
      {
        deliveryType: "delivery",
        deliveryMethod: "courier",
        deliveredAt: { $gte: since },
        status: { $nin: ["canceled", "annulled"] },
      },
      {
        deliveryType: "delivery",
        deliveryMethod: "inpost",
        status: "shipped",
        shippedAt: { $gte: since },
      },
    ],
  };
}

export const STATS_ORDER_LIST_PROJECTION = {
  userTelegramId: 1,
  orderNo: 1,
  totalZl: 1,
  status: 1,
  payment: 1,
  items: 1,
  cashbackZl: 1,
  createdAt: 1,
  completedAt: 1,
  deliveredAt: 1,
  shippedAt: 1,
  stockCommittedAt: 1,
  deliveryType: 1,
  deliveryMethod: 1,
  deliveryFeeZl: 1,
  inpostDeliveryFeeZl: 1,
  inpostDeliverySubsidyZl: 1,
};
