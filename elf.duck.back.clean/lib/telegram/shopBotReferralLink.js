const usernamesByIndex = [];

function parseEnvUsernames() {
  return String(
    process.env.TELEGRAM_BOT_USERNAMES ||
      process.env.TELEGRAM_BOT_USERNAME ||
      "elfduck_shop_bot"
  )
    .split(/[,;\n]+/)
    .map((row) => String(row || "").replace(/^@/, "").trim())
    .filter(Boolean);
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
    Number.isFinite(idx) && idx >= 0
      ? usernamesByIndex[idx]
      : "";
  if (fromCache) return fromCache;

  const fromEnv = parseEnvUsernames();
  if (Number.isFinite(idx) && idx >= 0 && fromEnv[idx]) {
    return fromEnv[idx];
  }

  return fromEnv[0] || "elfduck_shop_bot";
}

export function buildReferralMiniAppDeepLink(refCode, shopBotIndex = 0) {
  const code = String(refCode || "").replace(/^ref_/, "").trim();
  if (!code) return "";

  const username = getShopBotUsername(shopBotIndex);
  const startParam = `ref_${code}`;
  return `https://t.me/${username}?startapp=${encodeURIComponent(startParam)}`;
}

export function attachReferralInviteToStatus(referralStatus, shopBotIndex) {
  const code = String(referralStatus?.code || "").trim();
  const idx = Number(shopBotIndex);
  const safeIndex = Number.isFinite(idx) && idx >= 0 ? idx : 0;

  return {
    ...referralStatus,
    shopBotIndex: safeIndex,
    shopBotUsername: getShopBotUsername(safeIndex),
    inviteDeepLink: buildReferralMiniAppDeepLink(code, safeIndex),
  };
}
