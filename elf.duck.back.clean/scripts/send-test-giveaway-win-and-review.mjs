/**
 * Тестове повідомлення про виграш у розіграші + запрошення лишити відгук
 * (сторінка /giveaway-review без бонусу +15 zł).
 *
 *   node scripts/send-test-giveaway-win-and-review.mjs --to 7119952932
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { Telegraf } from "telegraf";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(backendRoot, "..");
dotenv.config({ path: path.join(repoRoot, ".env") });
dotenv.config({ path: path.join(backendRoot, ".env") });

import mongoose from "mongoose";
import User from "../models/User.js";
import { setUserBots, refreshPrimaryShopBot } from "../lib/server/botRegistry.js";
import { getTelegramBotTokens } from "../lib/telegram/botTokens.js";
import { setShopBotUsername } from "../lib/telegram/shopBotReferralLink.js";
import {
  sendClientTelegramMessage,
  sendClientTelegramPhoto,
} from "../lib/telegram/clientBotDelivery.js";
import {
  getWebAppBaseUrl,
  pushMarkdownToHtml,
} from "../lib/crm/pushMessageFormat.js";
import {
  GIVEAWAY_WINNER_MESSAGE_PL,
  GIVEAWAY_WINNER_MESSAGE_RU,
} from "../lib/giveaway/config.js";
import { getDefaultGiveawayWinnerBannerUrl } from "../lib/giveaway/winnerBannerMedia.js";
import { buildGiveawayReviewWebAppUrl } from "../lib/support/giveawayReview.js";

const args = process.argv.slice(2);
function arg(name, fallback = "") {
  const i = args.indexOf(name);
  return i >= 0 ? String(args[i + 1] || "").trim() : fallback;
}

const telegramId = arg("--to", "7119952932");
const amountZl = Number(arg("--amount", "150") || 150);

if (!telegramId) {
  console.error("Usage: node scripts/send-test-giveaway-win-and-review.mjs --to <telegramId>");
  process.exit(1);
}

if (!process.env.MONGODB_URI) {
  console.error("MONGODB_URI missing");
  process.exit(1);
}

const tokens = getTelegramBotTokens();
if (!tokens.length) {
  console.error("TELEGRAM_BOT_TOKEN missing");
  process.exit(1);
}

const botInstances = tokens.map((token) => new Telegraf(token));
setUserBots(botInstances);
refreshPrimaryShopBot();

await Promise.all(
  botInstances.map(async (instance, botIndex) => {
    try {
      const me = await instance.telegram.getMe();
      setShopBotUsername(botIndex, me?.username || "");
      console.log(`bot[${botIndex}]=@${me?.username || "?"}`);
    } catch (error) {
      console.warn(`bot[${botIndex}] getMe failed:`, error?.message || error);
    }
  })
);

await mongoose.connect(process.env.MONGODB_URI);

const user = await User.findOne({ telegramId: String(telegramId) })
  .select({ telegramId: 1, language: 1, username: 1, firstName: 1 })
  .lean();

const lang =
  String(user?.language || "").toLowerCase() === "pl" ? "pl" : "ru";
const template =
  lang === "pl" ? GIVEAWAY_WINNER_MESSAGE_PL : GIVEAWAY_WINNER_MESSAGE_RU;
const html = pushMarkdownToHtml(
  String(template).replaceAll("{amount}", String(amountZl))
);
const photoUrl = getDefaultGiveawayWinnerBannerUrl(lang);
const reviewUrl = buildGiveawayReviewWebAppUrl();

console.log({
  telegramId,
  username: user?.username || "",
  language: lang,
  amountZl,
  photoUrl,
  reviewUrl,
  webApp: getWebAppBaseUrl() || "",
});

const winPrefix =
  lang === "pl"
    ? "<b>🧪 TEST · Wygrana w losowaniu</b>\n\n"
    : "<b>🧪 TEST · Выигрыш в розыгрыше</b>\n\n";

try {
  if (photoUrl) {
    const caption = `${winPrefix}${html}`.slice(0, 1000);
    await sendClientTelegramPhoto(telegramId, { url: photoUrl }, {
      caption,
      parse_mode: "HTML",
    });
  } else {
    await sendClientTelegramMessage(telegramId, `${winPrefix}${html}`, {
      parse_mode: "HTML",
    });
  }
  console.log("winner message: ok");
} catch (error) {
  console.error(
    "winner message failed:",
    error?.response?.description || error?.message || error
  );
  process.exitCode = 1;
}

const reviewText =
  lang === "pl"
    ? "<b>🧪 TEST · Opinia o losowaniu</b>\n\n" +
      "Zostaw krótką ocenę serwisu Elf Duck.\n" +
      "Bez bonusów — tylko szczera opinia. Trafi do CRM i naszej grupy."
    : "<b>🧪 TEST · Отзыв о розыгрыше</b>\n\n" +
      "Оставь короткую оценку сервиса Elf Duck.\n" +
      "Без бонусов — просто честный отзыв. Попадёт в CRM и нашу группу.";

try {
  await sendClientTelegramMessage(telegramId, reviewText, {
    parse_mode: "HTML",
    ...(reviewUrl
      ? {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text:
                    lang === "pl" ? "OCEŃ SERWIS" : "ОЦЕНИТЬ СЕРВИС",
                  web_app: { url: reviewUrl },
                },
              ],
            ],
          },
        }
      : {}),
  });
  console.log("review invite: ok", { reviewUrl });
} catch (error) {
  console.error(
    "review invite failed:",
    error?.response?.description || error?.message || error
  );
  process.exitCode = 1;
}

await mongoose.disconnect();
console.log("done");
