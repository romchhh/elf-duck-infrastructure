export function getTelegramBotTokens() {
  const seen = new Set();
  const tokens = [];
  const add = (raw) => {
    const token = String(raw || "").trim();
    if (!token || seen.has(token)) return;
    seen.add(token);
    tokens.push(token);
  };

  add(process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN);
  add(process.env.TELEGRAM_BOT_TOKEN_2);
  String(process.env.TELEGRAM_BOT_TOKENS || "")
    .split(/[,;\n]+/)
    .forEach(add);

  return tokens;
}

/** Окремий тестовий бот для /testbotadmin (не додається до основного polling-списку). */
export function getTestBotToken() {
  return String(
    process.env.TELEGRAM_TEST_BOT_TOKEN || process.env.TEST_BOT_TOKEN || ""
  ).trim();
}
