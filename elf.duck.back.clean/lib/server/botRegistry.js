/** @type {import("telegraf").Telegraf | null} */
export let bot = null;

/** @type {import("telegraf").Telegraf[]} */
export let userBots = [];

export function setUserBots(instances) {
  userBots = Array.isArray(instances) ? instances : [];
  bot = userBots[0] || null;
}

export function getActiveUserBots() {
  if (userBots.length) return userBots;
  return bot ? [bot] : [];
}
