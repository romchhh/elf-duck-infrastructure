import DailyStatsDispatch from "../../models/DailyStatsDispatch.js";

function normalizeDedupeKey(dedupeKey) {
  return String(dedupeKey || "").trim();
}

export async function isDailyStatsDispatchRecorded(dedupeKey) {
  const key = normalizeDedupeKey(dedupeKey);
  if (!key) {
    return true;
  }

  const doc = await DailyStatsDispatch.findOne({ dedupeKey: key })
    .select("_id")
    .lean();

  return Boolean(doc);
}

/**
 * Атомарно «займає» слот відправки (унікальний dedupeKey у Mongo).
 * Повертає false, якщо за цей день/точку вже відправляли (в т.ч. після рестарту API).
 */
export async function claimDailyStatsDispatch(dedupeKey, meta = {}) {
  const key = normalizeDedupeKey(dedupeKey);
  if (!key) {
    return false;
  }

  try {
    await DailyStatsDispatch.create({
      dedupeKey: key,
      kind: String(meta.kind || "telegram"),
      dayKey: String(meta.dayKey || ""),
      pointKey: String(meta.pointKey || ""),
      sentAt: new Date(),
    });
    return true;
  } catch (error) {
    if (error?.code === 11000) {
      return false;
    }
    throw error;
  }
}

export async function releaseDailyStatsDispatch(dedupeKey) {
  const key = normalizeDedupeKey(dedupeKey);
  if (!key) {
    return;
  }

  await DailyStatsDispatch.deleteOne({ dedupeKey: key });
}
