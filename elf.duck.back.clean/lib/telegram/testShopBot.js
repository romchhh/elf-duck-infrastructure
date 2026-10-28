import { Telegraf, Markup } from "telegraf";
import User from "../../models/User.js";
import { normalizeAppLanguage } from "../crm/userLanguage.js";
import {
  botStartErrorText,
  buildBotStartCaption,
  visitShopButtonText,
} from "./clientOrderMessages.js";

const WEBAPP_URL = String(process.env.WEBAPP_URL || process.env.APP_URL || "").trim();

function isTestBotAdmin(telegramId) {
  const id = String(telegramId || "").trim();
  if (!id) return false;

  const pools = [process.env.SUPER_ADMIN_IDS, process.env.ADMIN_IDS];
  for (const pool of pools) {
    for (const part of String(pool || "").split(",")) {
      if (String(part).trim() === id) return true;
    }
  }
  return false;
}

export function buildTestMiniAppUrl(refCode = "") {
  const base = WEBAPP_URL.replace(/\/$/, "");
  if (!base) return "";

  let openLink = `${base}/test`;
  try {
    const url = new URL(openLink);
    const code = String(refCode || "").trim();
    if (code) url.searchParams.set("ref", code);
    return url.toString();
  } catch {
    const params = new URLSearchParams();
    const code = String(refCode || "").trim();
    if (code) params.set("ref", code);
    return params.toString() ? `${openLink}?${params.toString()}` : openLink;
  }
}

async function openTestMiniApp(ctx) {
  const tgId = String(ctx.from?.id || "").trim();
  if (!tgId) {
    await ctx.reply("Не удалось определить Telegram ID.");
    return;
  }

  if (!WEBAPP_URL) {
    await ctx.reply("WEBAPP_URL не настроен на сервере.");
    return;
  }

  let me = await User.findOne({ telegramId: tgId }).lean();
  const startLang =
    normalizeAppLanguage(me?.language) ||
    normalizeAppLanguage(ctx.from?.language_code) ||
    "ru";

  const refCode = String(me?.referral?.code || "").trim();
  const openLink = buildTestMiniAppUrl(refCode);
  if (!openLink) {
    await ctx.reply("Не удалось собрать ссылку на тестовую миниапп.");
    return;
  }

  const caption = buildBotStartCaption({
    lang: startLang,
    hasReferralBonus: Boolean(String(me?.referral?.usedCode || "").trim()),
  });

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.webApp(
        visitShopButtonText(startLang),
        openLink
      ),
    ],
  ]);

  await ctx.reply(
    `${caption}\n\n🧪 Тестовая версия магазина (/test). Основной бот и клиенты не затронуты.`,
    keyboard
  );
}

/**
 * Окремий polling-бот для розіграшів: команда /testbotadmin → мініапп на /test.
 * Не входить у userBots, щоб не дублювати сповіщення по замовленнях.
 */
export function launchTestShopBot(token) {
  const trimmed = String(token || "").trim();
  if (!trimmed) return null;

  const testBot = new Telegraf(trimmed);

  testBot.command("testbotadmin", async (ctx) => {
    try {
      if (!isTestBotAdmin(ctx.from?.id)) {
        await ctx.reply("Команда только для администраторов CRM.");
        return;
      }
      await openTestMiniApp(ctx);
    } catch (error) {
      console.error("[test-bot] testbotadmin error:", error);
      const errLang =
        normalizeAppLanguage(ctx.from?.language_code) || "ru";
      await ctx.reply(botStartErrorText(errLang)).catch(() => {});
    }
  });

  testBot
    .launch()
    .then(async () => {
      const me = await testBot.telegram.getMe();
      console.log(
        `✅ Test shop bot launched @${me.username} (/testbotadmin → /test)`
      );
    })
    .catch((error) => {
      console.error("❌ test bot launch error:", error);
    });

  process.once("SIGINT", () => testBot.stop("SIGINT"));
  process.once("SIGTERM", () => testBot.stop("SIGTERM"));

  return testBot;
}
