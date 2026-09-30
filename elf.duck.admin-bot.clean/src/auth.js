import { ADMIN_IDS, SUPER_ADMIN_IDS } from "./config.js";

let adminBotUsername = "";

export function setAdminBotUsername(username) {
  adminBotUsername = String(username || "").trim();
}

export function getAdminBotUsername() {
  return adminBotUsername;
}

export const isAdmin = (ctx) => {
  const id = String(ctx.from?.id || "").trim();
  if (!id) return false;
  return ADMIN_IDS.includes(id) || SUPER_ADMIN_IDS.includes(id);
};

export const isSuperAdmin = (ctx) =>
  SUPER_ADMIN_IDS.includes(String(ctx.from?.id || "").trim());

export function accessDeniedReply(ctx) {
  const userId = String(ctx.from?.id || "—");
  const botHint = adminBotUsername
    ? `@${adminBotUsername}`
    : "бот с токеном ADMIN_BOT_TOKEN";

  return [
    "⛔️ Нет доступа к admin-панели.",
    "",
    `Ваш Telegram ID: \`${userId}\``,
    "",
    "Если ID верный — добавьте его в `ADMIN_IDS` (или `SUPER_ADMIN_IDS`) в `.env` на сервере и выполните:",
    "`docker compose up -d admin-bot`",
    "",
    `Убедитесь, что пишете в **admin-бот** (${botHint}), а не в бот магазина.`,
  ].join("\n");
}
