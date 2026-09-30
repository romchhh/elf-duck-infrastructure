/**
 * Mirrors backend SYNCED_PICKUP_POINT_KEY_GROUPS (chunk04.js).
 * Linked points share one virtual warehouse for availability checks.
 */
const SYNCED_PICKUP_POINT_KEY_GROUPS = [new Set(["wola", "delivery-2"])];

export function normalizePickupPointKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/,+$/, "");
}

export function getSyncedPickupPointKeysByKey(pointKey) {
  const safeKey = normalizePickupPointKey(pointKey);
  if (!safeKey) return [];

  for (const group of SYNCED_PICKUP_POINT_KEY_GROUPS) {
    if (group.has(safeKey)) {
      return Array.from(group.values());
    }
  }

  return [safeKey];
}

export function getLinkedPickupPointIds(pickupPoints, contextId) {
  const ctx = String(contextId || "").trim();
  if (!ctx) return [];

  const list = Array.isArray(pickupPoints) ? pickupPoints : [];
  const point = list.find((p) => String(p?._id || "") === ctx);
  if (!point) return [ctx];

  const syncedKeys = getSyncedPickupPointKeysByKey(point.key);
  const ids = list
    .filter((p) => syncedKeys.includes(normalizePickupPointKey(p?.key)))
    .map((p) => String(p?._id || "").trim())
    .filter(Boolean);

  return ids.length ? Array.from(new Set(ids)) : [ctx];
}

/** Same aggregation as API cart/orders: min(total), max(reserved) across linked rows. */
export function getAggregatedStockForFlavor(flavor, contextId, pickupPoints) {
  const linkedIds = getLinkedPickupPointIds(pickupPoints, contextId);
  if (!linkedIds.length) {
    return { total: 0, reserved: 0, available: 0 };
  }

  const stockRows = (flavor?.stockByPickupPoint || []).filter((s) =>
    linkedIds.includes(String(s?.pickupPointId || ""))
  );

  if (!stockRows.length) {
    return { total: 0, reserved: 0, available: 0 };
  }

  const total = Math.min(...stockRows.map((row) => Number(row?.totalQty || 0)));
  const reserved = Math.max(...stockRows.map((row) => Number(row?.reservedQty || 0)));
  const available = Math.max(0, total - reserved);

  return { total, reserved, available };
}
