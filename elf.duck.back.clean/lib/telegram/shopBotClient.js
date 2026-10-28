export {
  getActiveUserBots,
  getShopBotByIndex,
  resolveShopBotIndexForTelegramId,
  resolveShopBotIndexFromToken,
  isUserChatUnavailableTelegramError,
  sendViaUserShopBot,
  getShopBotSendOptions,
  sendClientTelegramMessage,
  sendClientTelegramPhoto,
} from "./clientBotDelivery.js";

/** Legacy export — use clientBotDelivery.js directly. */
export function createShopBotClient() {
  throw new Error("createShopBotClient is deprecated; use clientBotDelivery.js");
}
