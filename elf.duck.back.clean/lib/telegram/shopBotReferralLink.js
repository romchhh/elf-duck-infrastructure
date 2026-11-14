import { getTelegramBotEntries, getTelegramBotTokens } from "./botTokens.js";

const usernamesByIndex = [];

function splitUsernameList(raw) {
  return String(raw || "")
    .split(/[,;\n]+/)
    .map((row) => String(row || "").replace(/^@/, "").trim())
    .filter(Boolean);
}

/** Кома-список, якщо заданий. Інакше username береться з пари TOKEN / USERNAME. */
export function getExplicitBotUsernamesFromEnv() {
  const raw = process.env.TELEGRAM_BOT_USERNAMES;
  if (!String(raw || "").trim()) return null;
  return splitUsernameList(raw);
}

function parseEnvUsernames() {
  const explicit = getExplicitBotUsernamesFromEnv();
  if (explicit?.length) return explicit;

  return splitUsernameList(
    process.env.TELEGRAM_BOT_USERNAME ||
      process.env.TELEGRAM_PRIMARY_SHOP_BOT_USERNAME ||
      "elfduck_store_bot"
  );
}

function primaryUsernameFromEnv() {
  const fromEnv = String(process.env.TELEGRAM_PRIMARY_SHOP_BOT_USERNAME || "")
    .replace(/^@/, "")
    .trim()
    .toLowerCase();

  if (!fromEnv || fromEnv === "elfduck_shop_bot") {
    return "elfduck_store_bot";
  }

  return fromEnv;
}

/** Заповнити кеш username до getMe: USERNAME поруч із TOKEN, або TELEGRAM_BOT_USERNAMES. */
export function seedShopBotUsernamesFromEnv() {
  const explicit = getExplicitBotUsernamesFromEnv();
  getTelegramBotEntries().forEach((entry, index) => {
    const name = explicit?.[index] || entry.username;
    if (name) setShopBotUsername(index, name);
  });
}

export function setShopBotUsername(index, username) {
  const idx = Number(index);
  if (!Number.isFinite(idx) || idx < 0) return;
  const safe = String(username || "").replace(/^@/, "").trim();
  if (!safe) return;
  usernamesByIndex[idx] = safe;
}

export function getShopBotUsername(index = 0) {
  const idx = Number(index);
  const fromCache =
    Number.isFinite(idx) && idx >= 0 ? usernamesByIndex[idx] : "";
  if (fromCache) return fromCache;

  const explicit = getExplicitBotUsernamesFromEnv();
  if (explicit && Number.isFinite(idx) && idx >= 0 && explicit[idx]) {
    return explicit[idx];
  }

  const paired = getTelegramBotEntries()[idx]?.username;
  if (paired) return paired;

  const tokenCount = getTelegramBotTokens().length;
  const fromEnv = parseEnvUsernames();
  if (tokenCount === 1 && idx === 0) {
    return fromEnv[0] || primaryUsernameFromEnv();
  }

  if (tokenCount === 1 && Number.isFinite(idx) && idx >= 0 && fromEnv[idx]) {
    return fromEnv[idx];
  }

  return "";
}

/**
 * Invite link that opens the bot chat with /start payload.
 * Using ?start= (not ?startapp=) so the invitee must Start the bot —
 * referral is attached in bot.start, and they get the welcome message.
 * Завжди primary @elfduck_store_bot.
 */
export function buildReferralMiniAppDeepLink(refCode, _shopBotIndex = 0) {
  const code = String(refCode || "").replace(/^ref_/, "").trim();
  if (!code) return "";

  const username = primaryUsernameFromEnv();
  const startParam = `ref_${code}`;
  return `https://t.me/${username}?start=${encodeURIComponent(startParam)}`;
}

export function attachReferralInviteToStatus(referralStatus, shopBotIndex) {
  const code = String(referralStatus?.code || "").trim();
  const username = primaryUsernameFromEnv();
  let idx = Number(shopBotIndex);
  if (!Number.isFinite(idx) || idx < 0) idx = 0;

  return {
    ...referralStatus,
    shopBotIndex: idx,
    shopBotUsername: username,
    inviteDeepLink: buildReferralMiniAppDeepLink(code, idx),
  };
}
