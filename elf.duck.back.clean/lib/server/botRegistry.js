import { getPrimaryShopBotIndex } from "../telegram/shopBotPrimary.js";

/** @type {import("telegraf").Telegraf | null} */
export let bot = null;

/** @type {import("telegraf").Telegraf[]} */
export let userBots = [];

function pickPrimaryBotInstance(instances) {
  const list = Array.isArray(instances) ? instances : [];
  if (!list.length) return null;
  const idx = getPrimaryShopBotIndex();
  return list[idx] || list[0] || null;
}

export function setUserBots(instances) {
  userBots = Array.isArray(instances) ? instances : [];
  bot = pickPrimaryBotInstance(userBots);
}

/** Після getMe / оновлення username-кешу — переприв’язати `bot` до @elfduck_store_bot. */
export function refreshPrimaryShopBot() {
  bot = pickPrimaryBotInstance(userBots);
}

export function getActiveUserBots() {
  if (userBots.length) return userBots;
  return bot ? [bot] : [];
}
