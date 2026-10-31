import User from "../../models/User.js";

const escapeRegex = (raw) =>
  String(raw || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function normalizeCashbackUsername(raw) {
  let value = String(raw || "").trim();
  value = value.replace(/^https?:\/\/t\.me\//i, "");
  value = value.split(/[/?#]/)[0];
  return value.replace(/^@+/, "").trim();
}

export const CASHBACK_USER_NOT_FOUND_MESSAGE =
  "Клиент не найден. Укажите @username или Telegram ID. Человек должен хотя бы раз открыть магазин в @elfduck_store_bot.";

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

  const exact = await findOne({
    username: {
      $regex: `^${escapeRegex(raw)}$`,
      $options: "i",
    },
  });
  if (exact) return exact;

  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const byFullName = await findOne({
      firstName: {
        $regex: `^${escapeRegex(parts[0])}$`,
        $options: "i",
      },
      lastName: {
        $regex: `^${escapeRegex(parts.slice(1).join(" "))}$`,
        $options: "i",
      },
    });
    if (byFullName) return byFullName;
  }

  let looseQuery = User.find({
    $or: [
      {
        username: {
          $regex: escapeRegex(raw),
          $options: "i",
        },
      },
      {
        firstName: {
          $regex: `^${escapeRegex(raw)}$`,
          $options: "i",
        },
      },
    ],
  }).limit(2);
  if (projection) looseQuery = looseQuery.select(projection);
  const loose = await looseQuery;

  if (loose.length === 1) return loose[0];
  return null;
}
