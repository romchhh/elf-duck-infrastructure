import { getActiveUserBots } from "../server/botRegistry.js";
import { getShopBotUsername } from "./shopBotReferralLink.js";

/**
 * Видалити повідомлення в групі — пробуємо кожен shop-бот (store + legacy).
 * Telegram дозволяє видалити лише тому боту, який надіслав повідомлення.
 */
export async function deleteGroupMessageWithAllShopBots(chatId, messageId) {
  const cid = String(chatId || "").trim();
  const mid = Number(messageId);
  if (!cid || !Number.isFinite(mid) || mid <= 0) {
    return { deleted: false, attempts: [], reason: "INVALID_REF" };
  }

  const bots = getActiveUserBots();
  if (!bots.length) {
    return { deleted: false, attempts: [], reason: "NO_BOTS" };
  }

  const attempts = [];
  let deletedBy = null;

  for (let botIndex = 0; botIndex < bots.length; botIndex += 1) {
    const tgBot = bots[botIndex];
    const username = String(getShopBotUsername(botIndex) || `bot_${botIndex}`)
      .replace(/^@/, "")
      .trim();

    try {
      await tgBot.telegram.deleteMessage(cid, mid);
      attempts.push({
        botIndex,
        bot: `@${username}`,
        ok: true,
      });
      if (!deletedBy) {
        deletedBy = `@${username}`;
      }
    } catch (error) {
      attempts.push({
        botIndex,
        bot: `@${username}`,
        ok: false,
        error: String(
          error?.response?.description || error?.message || error || "DELETE_FAILED"
        ),
      });
    }
  }

  return {
    deleted: Boolean(deletedBy),
    deletedBy,
    attempts,
    chatId: cid,
    messageId: mid,
  };
}

export function collectManagerTelegramMessageRefs(order) {
  const refs = [];
  const push = (chatId, messageId) => {
    const cid = String(chatId || "").trim();
    const mid = Number(String(messageId || "").trim());
    if (!cid || !Number.isFinite(mid) || mid <= 0) return;
    const key = `${cid}:${mid}`;
    if (refs.some((r) => r.key === key)) return;
    refs.push({ key, chatId: cid, messageId: mid });
  };

  push(order?.payment?.managerMessageChatId, order?.payment?.managerMessageId);
  push(order?.managerMessageChatId, order?.managerMessageId);

  return refs;
}

export async function deleteOrderManagerTelegramCards(order) {
  const refs = collectManagerTelegramMessageRefs(order);
  const outcomes = [];

  for (const ref of refs) {
    outcomes.push(await deleteGroupMessageWithAllShopBots(ref.chatId, ref.messageId));
  }

  return {
    refs: refs.length,
    outcomes,
    anyDeleted: outcomes.some((o) => o.deleted),
  };
}
