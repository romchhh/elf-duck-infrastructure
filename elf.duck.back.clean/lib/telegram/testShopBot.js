import { Markup } from "telegraf";
import User from "../../models/User.js";
import { normalizeAppLanguage } from "../crm/userLanguage.js";
import {
  botStartErrorText,
  buildBotStartCaption,
  visitShopButtonText,
} from "./clientOrderMessages.js";

const WEBAPP_URL = String(process.env.WEBAPP_URL || process.env.APP_URL || "").trim();

export function isGiveawayTestAdmin(telegramId) {
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

export async function replyGiveawayTestMiniApp(ctx) {
  const tgId = String(ctx.from?.id || "").trim();
  if (!tgId) {
    await ctx.reply("Не удалось определить Telegram ID.");
    return;
  }

  if (!WEBAPP_URL) {
    await ctx.reply("WEBAPP_URL не настроен на сервере.");
    return;
  }

  const me = await User.findOne({ telegramId: tgId }).lean();
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
    `${caption}\n\n🧪 Тестовая миниапп (розыгрыш): /test — только для админов, клиенты видят обычный магазин через /start.`,
    keyboard
  );
}

/** /testbotadmin и /test в основном боте магазина */
export async function handleGiveawayTestAdminCommand(ctx) {
  if (!isGiveawayTestAdmin(ctx.from?.id)) {
    await ctx.reply("Команда только для администраторов CRM (ADMIN_IDS / SUPER_ADMIN_IDS).");
    return;
  }
  await replyGiveawayTestMiniApp(ctx);
}

export async function handleGiveawayTestAdminCommandSafe(ctx) {
  try {
    await handleGiveawayTestAdminCommand(ctx);
  } catch (error) {
    console.error("[bot] giveaway test command error:", error);
    const errLang =
      normalizeAppLanguage(ctx.from?.language_code) || "ru";
    await ctx.reply(botStartErrorText(errLang)).catch(() => {});
  }
}
