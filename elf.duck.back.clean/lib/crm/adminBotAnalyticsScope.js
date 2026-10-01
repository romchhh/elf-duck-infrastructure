import PickupPoint from "../../models/PickupPoint.js";
import { isServerSuperAdminTelegramId } from "../server/helpers/chunk13.js";
import { getLocationIdentity } from "./analytics/locations.js";

/**
 * null = весь магазин (супер-админ или админ без привязки к точке).
 * иначе — только заказы выбранных точек / доставки.
 */
export async function resolveManagerAnalyticsScope(telegramId) {
  const id = String(telegramId || "").trim();
  if (!id || isServerSuperAdminTelegramId(id)) {
    return null;
  }

  const points = await PickupPoint.find({
    allowedAdminTelegramIds: id,
  })
    .select({ _id: 1, title: 1, key: 1 })
    .lean();

  if (!points.length) {
    return null;
  }

  const pickupPointIds = [];
  let includeDelivery = false;
  const labels = [];

  for (const p of points) {
    const key = String(p.key || "")
      .trim()
      .replace(/,+$/, "");
    labels.push(String(p.title || p.key || "Точка").trim());
    if (key === "delivery") {
      includeDelivery = true;
    } else {
      pickupPointIds.push(String(p._id));
    }
  }

  return {
    pickupPointIds,
    includeDelivery,
    labels: labels.filter(Boolean),
  };
}

export function orderMatchesAnalyticsScope(order, scope) {
  if (!scope) return true;

  const identity = getLocationIdentity(order);

  if (identity.startsWith("pickup:")) {
    const pid = identity.slice("pickup:".length);
    return scope.pickupPointIds.includes(pid);
  }

  if (
    scope.includeDelivery &&
    (identity === "delivery:courier" || identity === "delivery:inpost")
  ) {
    return true;
  }

  return false;
}

export function filterOrdersForAnalyticsScope(orders, scope) {
  if (!scope) return Array.isArray(orders) ? orders : [];
  return (Array.isArray(orders) ? orders : []).filter((order) =>
    orderMatchesAnalyticsScope(order, scope)
  );
}
