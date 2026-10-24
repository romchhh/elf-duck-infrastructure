/** Нормалізація мови мініапу: pl | ru | "". */
export function normalizeAppLanguage(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (!raw) return "";
  if (raw === "pl" || raw.startsWith("pl")) return "pl";
  // Як у фронті i18n: en → pl
  if (raw.startsWith("en")) return "pl";
  if (
    raw === "ru" ||
    raw.startsWith("ru") ||
    raw.startsWith("uk") ||
    raw.startsWith("be")
  ) {
    return "ru";
  }
  return "";
}

export function emptyLanguageStats() {
  return { pl: 0, ru: 0, unknown: 0 };
}

export function bumpLanguageStat(stats, language) {
  const key =
    language === "pl" || language === "ru" ? language : "unknown";
  stats[key] = Number(stats[key] || 0) + 1;
  return stats;
}

export function languageStatsFromUsers(users = []) {
  const stats = emptyLanguageStats();
  for (const user of users) {
    bumpLanguageStat(stats, normalizeAppLanguage(user?.language));
  }
  return stats;
}

/** Агрегація по Mongo match (швидкий шлях для Push / CRM). */
export async function aggregateLanguageStats(UserModel, match = {}) {
  const rows = await UserModel.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          $let: {
            vars: {
              lang: {
                $toLower: {
                  $trim: {
                    input: { $ifNull: ["$language", ""] },
                  },
                },
              },
            },
            in: {
              $cond: [
                {
                  $or: [
                    { $eq: ["$$lang", "pl"] },
                    { $eq: ["$$lang", "en"] },
                  ],
                },
                "pl",
                {
                  $cond: [
                    {
                      $or: [
                        { $eq: ["$$lang", "ru"] },
                        { $eq: ["$$lang", "uk"] },
                        { $eq: ["$$lang", "be"] },
                      ],
                    },
                    "ru",
                    "unknown",
                  ],
                },
              ],
            },
          },
        },
        count: { $sum: 1 },
      },
    },
  ]);

  const stats = emptyLanguageStats();
  for (const row of rows) {
    const key =
      row?._id === "pl" || row?._id === "ru" ? row._id : "unknown";
    stats[key] += Number(row?.count || 0);
  }
  return stats;
}
