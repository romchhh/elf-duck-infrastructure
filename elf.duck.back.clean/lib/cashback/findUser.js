import User from "../../models/User.js";

const escapeRegex = (raw) =>
  String(raw || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function normalizeCashbackUsername(raw) {
  return String(raw || "")
    .trim()
    .replace(/^@+/, "");
}

/**
 * Пошук клієнта для кэшбэку: telegramId або @username без урахування регістру.
 */
export async function findCashbackUserByQuery(rawQuery, projection = null) {
  const raw = normalizeCashbackUsername(rawQuery);
  if (!raw) return null;

  const findOne = (filter) =>
    projection ? User.findOne(filter, projection) : User.findOne(filter);

  if (/^\d{5,}$/.test(raw)) {
    const byId = await findOne({ telegramId: String(raw) });
    if (byId) return byId;
  }

  return findOne({
    username: {
      $regex: `^${escapeRegex(raw)}$`,
      $options: "i",
    },
  });
}
