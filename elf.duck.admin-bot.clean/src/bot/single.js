import { Telegraf } from "telegraf";
import { BOT_TOKEN } from "../config.js";

/** @type {import("telegraf").Telegraf | null} */
export let bot = null;

export function initBot() {
  if (bot) return bot;

  bot = new Telegraf(BOT_TOKEN);

  bot.use(async (ctx, next) => {
    if (ctx?.update?.__fromReplyKeyboard === true) {
      ctx.answerCbQuery = async () => true;
    }
    return next();
  });

  return bot;
}
