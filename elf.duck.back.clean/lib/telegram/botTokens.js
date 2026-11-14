function cleanUsername(raw) {
  return String(raw || "").replace(/^@/, "").trim();
}

/**
 * Порядок слотів = порядок інстансів бота.
 * TELEGRAM_BOT_TOKEN + TELEGRAM_BOT_USERNAME — основний (@elfduck_store_bot).
 * TELEGRAM_BOT_TOKEN_1 + TELEGRAM_BOT_USERNAME_1 — старий (@elfduck_shop_bot).
 * TOKEN_2 / TOKEN_3 — запасні слоти.
 */
export function getTelegramBotEntries() {
  const seen = new Set();
  const entries = [];
  const add = (tokenRaw, usernameRaw) => {
    const token = String(tokenRaw || "").trim();
    if (!token || seen.has(token)) return;
    seen.add(token);
    entries.push({
      token,
      username: cleanUsername(usernameRaw),
    });
  };

  add(
    process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN,
    process.env.TELEGRAM_BOT_USERNAME ||
      process.env.TELEGRAM_PRIMARY_SHOP_BOT_USERNAME
  );
  add(process.env.TELEGRAM_BOT_TOKEN_1, process.env.TELEGRAM_BOT_USERNAME_1);
  add(process.env.TELEGRAM_BOT_TOKEN_2, process.env.TELEGRAM_BOT_USERNAME_2);
  add(process.env.TELEGRAM_BOT_TOKEN_3, process.env.TELEGRAM_BOT_USERNAME_3);

  String(process.env.TELEGRAM_BOT_TOKENS || "")
    .split(/[,;\n]+/)
    .forEach((token) => add(token, ""));

  return entries;
}

export function getTelegramBotTokens() {
  return getTelegramBotEntries().map((entry) => entry.token);
}
