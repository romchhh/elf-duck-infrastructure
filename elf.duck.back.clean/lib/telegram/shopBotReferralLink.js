const usernamesByIndex = [];

function parseEnvUsernames() {
  return String(
    process.env.TELEGRAM_BOT_USERNAMES ||
      process.env.TELEGRAM_BOT_USERNAME ||
      process.env.TELEGRAM_PRIMARY_SHOP_BOT_USERNAME ||
      "elfduck_store_bot"
  )
    .split(/[,;\n]+/)
    .map((row) => String(row || "").replace(/^@/, "").trim())
    .filter(Boolean);
}

function primaryUsernameFromEnv() {
  return String(
    process.env.TELEGRAM_PRIMARY_SHOP_BOT_USERNAME ||
      process.env.TELEGRAM_BOT_USERNAME ||
      "elfduck_store_bot"
  )
    .replace(/^@/, "")
    .trim() || "elfduck_store_bot";
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

  const fromEnv = parseEnvUsernames();
  if (Number.isFinite(idx) && idx >= 0 && fromEnv[idx]) {
    return fromEnv[idx];
  }

  return fromEnv[0] || primaryUsernameFromEnv();
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
