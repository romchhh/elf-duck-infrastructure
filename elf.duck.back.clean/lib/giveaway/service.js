import mongoose from "mongoose";
import Order from "../../models/Order.js";
import User from "../../models/User.js";
import { getCompletedOrderMatch } from "../crm/sales.js";
import {
  getActiveGiveawayMonthKey,
  isGiveawayParticipationWindow,
  msUntilNextGiveawayMonth,
  resolveGiveawayUiPhase,
} from "./schedule.js";
import { prizeAmountForPlace, GIVEAWAY_RULES_PL, GIVEAWAY_RULES_RU } from "./config.js";
import { isBlikOrderPayment } from "./payment.js";
import { recalcUserCashbackBalanceFromLedger } from "../cashback/manualAdmin.js";

export const GIVEAWAY_MONTHS = "crm_giveaway_months";
export const GIVEAWAY_PARTICIPANTS = "crm_giveaway_participants";
export const GIVEAWAY_ENTRIES = "crm_giveaway_entries";
export const GIVEAWAY_WINNERS = "crm_giveaway_winners";

function monthsCol() {
  return mongoose.connection.collection(GIVEAWAY_MONTHS);
}

function participantsCol() {
  return mongoose.connection.collection(GIVEAWAY_PARTICIPANTS);
}

function entriesCol() {
  return mongoose.connection.collection(GIVEAWAY_ENTRIES);
}

function winnersCol() {
  return mongoose.connection.collection(GIVEAWAY_WINNERS);
}

export async function ensureGiveawayIndexes() {
  await monthsCol().createIndex({ monthKey: 1 }, { unique: true });
  await participantsCol().createIndex(
    { monthKey: 1, telegramId: 1 },
    { unique: true }
  );
  await entriesCol().createIndex({ orderId: 1 }, { unique: true });
  await entriesCol().createIndex({ monthKey: 1, telegramId: 1 });
  await entriesCol().createIndex({ monthKey: 1, createdAt: 1 });
  await winnersCol().createIndex({ monthKey: 1, place: 1 }, { unique: true });
  await winnersCol().createIndex({ monthKey: 1, telegramId: 1 });
}

export async function ensureGiveawayMonth(monthKey = getActiveGiveawayMonthKey()) {
  const key = String(monthKey || "").trim();
  if (!key) throw new Error("INVALID_MONTH_KEY");

  const now = new Date();
  const existing = await monthsCol().findOne({ monthKey: key });
  if (existing) return existing;

  const doc = {
    monthKey: key,
    status: "open",
    createdAt: now,
    updatedAt: now,
    drawnAt: null,
    creditedAt: null,
    notifiedAt: null,
    drawnBy: null,
  };

  try {
    await monthsCol().insertOne(doc);
    return doc;
  } catch (error) {
    if (error?.code === 11000) {
      return monthsCol().findOne({ monthKey: key });
    }
    throw error;
  }
}

async function countParticipants(monthKey) {
  return participantsCol().countDocuments({ monthKey });
}

async function countEntries(monthKey) {
  return entriesCol().countDocuments({ monthKey });
}

async function countUserEntries(monthKey, telegramId) {
  return entriesCol().countDocuments({
    monthKey,
    telegramId: String(telegramId || "").trim(),
  });
}

async function isParticipant(monthKey, telegramId) {
  const row = await participantsCol().findOne({
    monthKey,
    telegramId: String(telegramId || "").trim(),
  });
  return Boolean(row);
}

function orderCompletedInMonth(order, monthKey) {
  const at = order?.completedAt || order?.shippedAt || order?.paidAt;
  if (!at) return false;
  const d = new Date(at);
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
  });
  const key = fmt.format(d).slice(0, 7);
  return key === monthKey;
}

export async function listQualifyingOrdersForUser(monthKey, telegramId) {
  const tg = String(telegramId || "").trim();
  if (!tg) return [];

  const orders = await Order.find({
    userTelegramId: tg,
    ...getCompletedOrderMatch(),
  })
    .select({
      _id: 1,
      userTelegramId: 1,
      payment: 1,
      completedAt: 1,
      shippedAt: 1,
      paidAt: 1,
    })
    .lean();

  return orders.filter(
    (order) =>
      !isBlikOrderPayment(order) &&
      orderCompletedInMonth(order, monthKey) &&
      isGiveawayParticipationWindow(
        new Date(order.completedAt || order.shippedAt || order.paidAt)
      )
  );
}

export async function syncGiveawayEntriesForUser(monthKey, telegramId) {
  const tg = String(telegramId || "").trim();
  if (!tg) return { added: 0 };

  if (!(await isParticipant(monthKey, tg))) return { added: 0 };

  const orders = await listQualifyingOrdersForUser(monthKey, tg);
  let added = 0;

  for (const order of orders) {
    const orderId = String(order._id);
    try {
      await entriesCol().insertOne({
        monthKey,
        telegramId: tg,
        orderId,
        createdAt: new Date(
          order.completedAt || order.shippedAt || order.paidAt || Date.now()
        ),
      });
      added += 1;
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }
  }

  return { added };
}

export async function joinGiveaway(monthKey, telegramId) {
  const tg = String(telegramId || "").trim();
  if (!tg) throw new Error("TELEGRAM_ID_REQUIRED");

  if (!isGiveawayParticipationWindow()) {
    throw new Error("GIVEAWAY_CLOSED");
  }

  const month = await ensureGiveawayMonth(monthKey);
  if (String(month.status || "") !== "open") {
    throw new Error("GIVEAWAY_NOT_OPEN");
  }

  const now = new Date();
  try {
    await participantsCol().insertOne({
      monthKey,
      telegramId: tg,
      joinedAt: now,
    });
  } catch (error) {
    if (error?.code !== 11000) throw error;
  }

  await syncGiveawayEntriesForUser(monthKey, tg);
  return getGiveawayPublicState({ telegramId: tg, monthKey });
}

export async function tryAddGiveawayEntryForOrder(order) {
  if (!order || isBlikOrderPayment(order)) return { added: false };

  const tg = String(order.userTelegramId || "").trim();
  if (!tg) return { added: false };

  const monthKey = getActiveGiveawayMonthKey(
    new Date(order.completedAt || order.shippedAt || Date.now())
  );

  if (!isGiveawayParticipationWindow()) return { added: false };
  if (!orderCompletedInMonth(order, monthKey)) return { added: false };

  const month = await ensureGiveawayMonth(monthKey);
  if (String(month.status || "") !== "open") return { added: false };

  if (!(await isParticipant(monthKey, tg))) return { added: false };

  try {
    await entriesCol().insertOne({
      monthKey,
      telegramId: tg,
      orderId: String(order._id),
      createdAt: new Date(),
    });
    return { added: true };
  } catch (error) {
    if (error?.code === 11000) return { added: false };
    throw error;
  }
}

export async function listWinners(monthKey) {
  const rows = await winnersCol()
    .find({ monthKey })
    .sort({ place: 1 })
    .toArray();

  if (!rows.length) return [];

  const tgIds = [...new Set(rows.map((r) => r.telegramId))];
  const users = await User.find({ telegramId: { $in: tgIds } })
    .select({ telegramId: 1, username: 1, firstName: 1 })
    .lean();
  const userMap = new Map(users.map((u) => [String(u.telegramId), u]));

  return rows.map((row) => {
    const user = userMap.get(String(row.telegramId)) || {};
    return {
      place: row.place,
      amountZl: row.amountZl,
      telegramId: row.telegramId,
      username: user.username || "",
      firstName: user.firstName || "",
      creditedAt: row.creditedAt || null,
      notifiedAt: row.notifiedAt || null,
    };
  });
}

export async function getGiveawayPublicState({
  telegramId = "",
  monthKey = getActiveGiveawayMonthKey(),
} = {}) {
  const month = await ensureGiveawayMonth(monthKey);
  const tg = String(telegramId || "").trim();
  const phase = resolveGiveawayUiPhase(month);
  const participated = tg ? await isParticipant(monthKey, tg) : false;
  const myEntries = tg ? await countUserEntries(monthKey, tg) : 0;

  const showWinners =
    phase === "results" ||
    month.status === "drawn" ||
    month.status === "credited" ||
    month.status === "notified";

  const [participantsCount, entriesCount, winners] = await Promise.all([
    countParticipants(monthKey),
    countEntries(monthKey),
    showWinners ? listWinners(monthKey) : Promise.resolve([]),
  ]);

  const userLang =
    tg &&
    (await User.findOne({ telegramId: tg }).select({ language: 1 }).lean())
      ?.language;

  const rules =
    String(userLang || "").toLowerCase() === "pl"
      ? GIVEAWAY_RULES_PL
      : GIVEAWAY_RULES_RU;

  return {
    monthKey,
    phase,
    status: month.status,
    participationOpen: isGiveawayParticipationWindow(),
    participated,
    myEntries,
    participantsCount,
    entriesCount,
    winners,
    countdownMs: msUntilNextGiveawayMonth(),
    rulesRu: GIVEAWAY_RULES_RU,
    rulesPl: GIVEAWAY_RULES_PL,
    rules,
    drawnAt: month.drawnAt || null,
    creditedAt: month.creditedAt || null,
    notifiedAt: month.notifiedAt || null,
  };
}

export async function getGiveawayAdminState(monthKey = getActiveGiveawayMonthKey()) {
  const month = await ensureGiveawayMonth(monthKey);
  const [participantsCount, entriesCount, winners] = await Promise.all([
    countParticipants(monthKey),
    countEntries(monthKey),
    listWinners(monthKey),
  ]);

  return {
    month,
    phase: resolveGiveawayUiPhase(month),
    participantsCount,
    entriesCount,
    winners,
    prizePreview: winners.length
      ? winners.reduce((s, w) => s + Number(w.amountZl || 0), 0)
      : 0,
  };
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export async function runGiveawayDraw(monthKey, adminMeta = {}) {
  const month = await monthsCol().findOne({ monthKey });
  if (!month) throw new Error("MONTH_NOT_FOUND");
  if (month.status !== "open") throw new Error("ALREADY_DRAWN");

  const entries = await entriesCol().find({ monthKey }).toArray();
  if (!entries.length) throw new Error("NO_ENTRIES");

  shuffleInPlace(entries);
  const picked = [];
  const usedUsers = new Set();

  for (const entry of entries) {
    const tg = String(entry.telegramId || "").trim();
    if (!tg || usedUsers.has(tg)) continue;
    picked.push(entry);
    usedUsers.add(tg);
    if (picked.length >= 25) break;
  }

  if (!picked.length) throw new Error("NO_UNIQUE_WINNERS");

  const now = new Date();
  const winnerDocs = picked.map((entry, index) => ({
    monthKey,
    place: index + 1,
    telegramId: String(entry.telegramId),
    orderId: String(entry.orderId || ""),
    entryId: String(entry._id),
    amountZl: prizeAmountForPlace(index + 1),
    createdAt: now,
    creditedAt: null,
    notifiedAt: null,
  }));

  await winnersCol().insertMany(winnerDocs);
  await monthsCol().updateOne(
    { monthKey },
    {
      $set: {
        status: "drawn",
        drawnAt: now,
        updatedAt: now,
        drawnBy: String(adminMeta?.adminId || adminMeta?.username || "crm"),
      },
    }
  );

  return getGiveawayAdminState(monthKey);
}

function addDays(dateLike, days) {
  const base = new Date(dateLike);
  base.setDate(base.getDate() + Number(days || 0));
  return base;
}

export async function creditGiveawayWinners(monthKey) {
  const month = await monthsCol().findOne({ monthKey });
  if (!month) throw new Error("MONTH_NOT_FOUND");
  if (
    month.status !== "drawn" &&
    month.status !== "credited"
  ) {
    throw new Error("DRAW_REQUIRED_FIRST");
  }

  const winners = await winnersCol().find({ monthKey }).sort({ place: 1 }).toArray();
  if (!winners.length) throw new Error("NO_WINNERS");

  let credited = 0;
  const now = new Date();

  for (const row of winners) {
    if (row.creditedAt) continue;

    const amount = Number(row.amountZl || 0);
    if (!(amount > 0)) continue;

    const user = await User.findOne({ telegramId: String(row.telegramId) });
    if (!user) continue;

    user.cashbackLedger = Array.isArray(user.cashbackLedger)
      ? user.cashbackLedger
      : [];

    user.cashbackLedger.push({
      source: "giveaway_prize",
      amountZl: amount,
      remainingZl: amount,
      earnedAt: now,
      expiresAt: addDays(now, 40),
      orderId: null,
      giveawayMonthKey: monthKey,
      giveawayPlace: row.place,
      warnedAt: null,
      expiredAt: null,
    });

    recalcUserCashbackBalanceFromLedger(user);
    await user.save();

    await winnersCol().updateOne({ _id: row._id }, { $set: { creditedAt: now } });
    credited += 1;
  }

  await monthsCol().updateOne(
    { monthKey },
    { $set: { status: "credited", creditedAt: now, updatedAt: now } }
  );

  return { credited, total: winners.length };
}

export async function notifyGiveawayWinners(monthKey) {
  const { bot } = await import("../server/botRegistry.js");
  if (!bot?.telegram) throw new Error("BOT_UNAVAILABLE");

  const month = await monthsCol().findOne({ monthKey });
  if (!month) throw new Error("MONTH_NOT_FOUND");
  if (
    month.status !== "credited" &&
    month.status !== "notified"
  ) {
    throw new Error("CREDIT_REQUIRED_FIRST");
  }

  const winners = await winnersCol().find({ monthKey }).sort({ place: 1 }).toArray();
  const users = await User.find({
    telegramId: { $in: winners.map((w) => String(w.telegramId)) },
  })
    .select({ telegramId: 1, language: 1 })
    .lean();
  const langMap = new Map(users.map((u) => [String(u.telegramId), u.language]));

  let sent = 0;
  const now = new Date();

  for (const row of winners) {
    if (row.notifiedAt) continue;
    const tg = String(row.telegramId || "").trim();
    if (!tg) continue;

    const lang =
      String(langMap.get(tg) || "ru").toLowerCase() === "pl" ? "pl" : "ru";
    const template =
      lang === "pl"
        ? "Gratulacje! Wygrałeś w rubryce „ElfDuck rozdaje 2 000 zł”. Twoja wygrana {amount} zł została już dodana do salda cashbacku."
        : "Поздравляем! Вы победили в нашей новой рубрике „ElfDuck раздаёт 2 000 zł“. Ваш выигрыш в размере {amount} zł уже начислен на баланс.";

    const text = template.replace("{amount}", String(row.amountZl));

    try {
      await bot.telegram.sendMessage(tg, text);
      await winnersCol().updateOne(
        { _id: row._id },
        { $set: { notifiedAt: now } }
      );
      sent += 1;
    } catch (error) {
      console.error("[GIVEAWAY][NOTIFY]", tg, error?.message || error);
    }
  }

  await monthsCol().updateOne(
    { monthKey },
    { $set: { status: "notified", notifiedAt: now, updatedAt: now } }
  );

  return { sent, total: winners.length };
}

export async function listGiveawayMonths(limit = 12) {
  return monthsCol().find({}).sort({ monthKey: -1 }).limit(limit).toArray();
}
