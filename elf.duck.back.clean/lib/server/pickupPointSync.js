/** Linked pickup points (wola ↔ delivery-2). Без chunk*.js — для скриптів і API. */
import mongoose from "mongoose";
import PickupPoint from "../../models/PickupPoint.js";

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

export async function getSyncedPickupPointIdsByAnyPoint(input) {
  const raw = String(input || "").trim();
  if (!raw) return [];

  const byId = mongoose.isValidObjectId(raw)
    ? await PickupPoint.findById(raw, { _id: 1, key: 1 }).lean()
    : null;

  const point =
    byId ||
    (await PickupPoint.findOne(
      { key: { $in: [raw, `${raw},`, normalizePickupPointKey(raw)] } },
      { _id: 1, key: 1 }
    ).lean());

  if (!point?._id) return [];

  const syncedKeys = getSyncedPickupPointKeysByKey(point.key || raw);

  const syncedPoints = await PickupPoint.find(
    { key: { $in: syncedKeys.flatMap((key) => [key, `${key},`]) } },
    { _id: 1, key: 1 }
  ).lean();

  const ids = syncedPoints
    .map((row) => String(row?._id || "").trim())
    .filter(Boolean);

  return ids.length ? Array.from(new Set(ids)) : [String(point._id)];
}
