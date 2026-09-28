import Order from "../models/Order.js";
import User from "../models/User.js";

function escapeCsvCell(value) {
  const raw = value == null ? "" : String(value);
  if (/[",\n\r]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

function formatIsoDate(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
}

const CSV_HEADERS = [
  "telegramId",
  "username",
  "firstName",
  "lastName",
  "cashbackBalanceZl",
  "shopBotIndex",
  "shopBotKnown",
  "referralCode",
  "referralUsedCode",
  "invitedByTelegramId",
  "completedOrdersCount",
  "completedOrdersTotalZl",
  "createdAt",
  "updatedAt",
];

async function loadCompletedOrderStatsByTelegramId() {
  const rows = await Order.aggregate([
    {
      $match: {
        status: { $in: ["completed", "done"] },
        userTelegramId: { $exists: true, $ne: "" },
      },
    },
    {
      $group: {
        _id: "$userTelegramId",
        completedOrdersCount: { $sum: 1 },
        completedOrdersTotalZl: {
          $sum: { $ifNull: ["$totalZl", 0] },
        },
      },
    },
  ]);

  const map = new Map();
  for (const row of rows) {
    const telegramId = String(row?._id || "").trim();
    if (!telegramId) continue;
    map.set(telegramId, {
      completedOrdersCount: Number(row.completedOrdersCount || 0),
      completedOrdersTotalZl: Number(row.completedOrdersTotalZl || 0),
    });
  }
  return map;
}

export async function buildUsersExportRows() {
  const orderStats = await loadCompletedOrderStatsByTelegramId();

  const users = await User.find(
    {},
    {
      telegramId: 1,
      username: 1,
      firstName: 1,
      lastName: 1,
      cashbackBalance: 1,
      shopBotIndex: 1,
      shopBotKnown: 1,
      referral: 1,
      createdAt: 1,
      updatedAt: 1,
    }
  )
    .sort({ createdAt: 1 })
    .lean();

  return users.map((user) => {
    const telegramId = String(user?.telegramId || "").trim();
    const stats = orderStats.get(telegramId) || {
      completedOrdersCount: 0,
      completedOrdersTotalZl: 0,
    };

    return {
      telegramId,
      username: String(user?.username || ""),
      firstName: String(user?.firstName || ""),
      lastName: String(user?.lastName || ""),
      cashbackBalanceZl: Number(user?.cashbackBalance || 0),
      shopBotIndex: Number(user?.shopBotIndex || 0),
      shopBotKnown: Boolean(user?.shopBotKnown),
      referralCode: String(user?.referral?.code || ""),
      referralUsedCode: String(user?.referral?.usedCode || ""),
      invitedByTelegramId: String(user?.referral?.invitedByTelegramId || ""),
      completedOrdersCount: stats.completedOrdersCount,
      completedOrdersTotalZl: stats.completedOrdersTotalZl,
      createdAt: formatIsoDate(user?.createdAt),
      updatedAt: formatIsoDate(user?.updatedAt),
    };
  });
}

export function usersExportRowsToCsv(rows) {
  const lines = [CSV_HEADERS.join(",")];

  for (const row of rows) {
    lines.push(
      CSV_HEADERS.map((key) => escapeCsvCell(row[key])).join(",")
    );
  }

  return `\uFEFF${lines.join("\n")}\n`;
}

export function usersExportFilename() {
  const now = new Date();
  const stamp = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0"),
  ].join("-");
  return `elfduck-users-${stamp}.csv`;
}

export function sendUsersExportCsvResponse(res, rows) {
  const csv = usersExportRowsToCsv(rows);
  const filename = usersExportFilename();

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${filename}"`
  );
  res.send(csv);
}
