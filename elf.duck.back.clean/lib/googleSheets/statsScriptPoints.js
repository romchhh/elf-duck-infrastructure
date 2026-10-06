/**
 * Ключі для resync дня (без дублікатів однієї таблиці wola / delivery-2).
 * wola-inpost — віртуальна точка: замовлення wola pickup + delivery-2 InPost.
 */
export const DAILY_STATS_RESYNC_POINT_KEYS = [
  "praga",
  "r-dmie-cie",
  "mokot-w",
  "delivery",
  "wola-inpost",
];

export const ASSORTMENT_RETRY_POINT_KEYS = [
  "praga",
  "r-dmie-cie",
  "mokot-w",
  "delivery",
  "wola",
  "delivery-2",
];

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function findPickupPointByKey(PickupPoint, pointKey) {
  const key = String(pointKey || "")
    .trim()
    .toLowerCase()
    .replace(/,+$/, "");
  if (!key) return null;

  return PickupPoint.findOne({
    key: new RegExp(`^${escapeRegex(key)}`, "i"),
  }).lean();
}

/** Метадані для sendDailyPointStatsToGoogleSheetsApi (Mongo point або virtual). */
export async function resolveStatsScriptPointMeta(PickupPoint, pointKey) {
  const key = String(pointKey || "")
    .trim()
    .toLowerCase()
    .replace(/,+$/, "");

  if (key === "wola-inpost") {
    return { key: "wola-inpost", title: "Wola + InPost", virtual: true };
  }

  const point = await findPickupPointByKey(PickupPoint, key);
  if (!point) return null;

  return { ...point, virtual: false };
}

export async function loadStatsDayOrders({
  Order,
  PickupPoint,
  pointKey,
  dayKey,
  ordersSince,
  projection,
  buildStatsOrdersMongoFilter,
  orderBelongsToStatsDay,
  getOrderPointMatch,
}) {
  const key = String(pointKey || "")
    .trim()
    .toLowerCase()
    .replace(/,+$/, "");

  if (key === "wola-inpost") {
    const wola = await findPickupPointByKey(PickupPoint, "wola");
    const inpost = await findPickupPointByKey(PickupPoint, "delivery-2");

    if (!wola || !inpost) {
      throw new Error("WOLA_OR_DELIVERY_2_POINT_MISSING_IN_MONGO");
    }

    const [wolaOrders, inpostOrders] = await Promise.all([
      Order.find(
        buildStatsOrdersMongoFilter(getOrderPointMatch(wola), ordersSince),
        projection
      ).lean(),
      Order.find(
        buildStatsOrdersMongoFilter(getOrderPointMatch(inpost), ordersSince),
        projection
      ).lean(),
    ]);

    const combinedById = new Map();
    for (const order of [...wolaOrders, ...inpostOrders]) {
      combinedById.set(String(order._id), order);
    }

    return Array.from(combinedById.values()).filter((order) =>
      orderBelongsToStatsDay(order, dayKey)
    );
  }

  const point = await findPickupPointByKey(PickupPoint, key);
  if (!point) return null;

  const orders = await Order.find(
    buildStatsOrdersMongoFilter(getOrderPointMatch(point), ordersSince),
    projection
  ).lean();

  return orders.filter((order) => orderBelongsToStatsDay(order, dayKey));
}
