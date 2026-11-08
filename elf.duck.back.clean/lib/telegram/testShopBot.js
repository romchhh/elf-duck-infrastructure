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

/** /testreview — те саме повідомлення «Оцініть сервіс», що після 1-го замовлення */
export async function handleServiceReviewTestCommand(ctx) {
  if (!isGiveawayTestAdmin(ctx.from?.id)) {
    await ctx.reply(
      "Команда только для администраторов (ADMIN_IDS / SUPER_ADMIN_IDS)."
    );
    return;
  }

  const tgId = String(ctx.from?.id || "").trim();
  if (!tgId) {
    await ctx.reply("Не удалось определить Telegram ID.");
    return;
  }

  const { triggerServiceReviewTestInvite } = await import(
    "../support/serviceReviewInvite.js"
  );

  const result = await triggerServiceReviewTestInvite(tgId);
  if (!result.ok) {
    const reason = String(result.reason || "ERROR");
    const hint =
      reason === "WEBAPP_URL_MISSING"
        ? "\n\nПроверь WEBAPP_URL / APP_URL на сервере."
        : reason.startsWith("SERVICE_REVIEW_IMAGE_MISSING")
          ? "\n\nНет promo-ru.png / promo-pl.png в assets/service-review."
          : "";
    await ctx.reply(`Не удалось отправить тест: ${reason}${hint}`);
    return;
  }

  const lang =
    normalizeAppLanguage(ctx.from?.language_code) || "ru";
  const extra =
    lang === "pl"
      ? "\n\nOtwórz przycisk na zdjęciu powyżej lub miniap /service-review."
      : "\n\nОткрой кнопку на фото выше или миниап /service-review.";

  await ctx.reply(
    `✅ Тест отзыва после 1-го заказа отправлен.${extra}\n\n` +
      (result.orderId
        ? `Привязка к заказу: ${result.orderId}`
        : "Завершённых заказов нет — точка будет пустой (для UI достаточно).")
  );
}

export async function handleServiceReviewTestCommandSafe(ctx) {
  try {
    await handleServiceReviewTestCommand(ctx);
  } catch (error) {
    console.error("[bot] testreview command error:", error);
    await ctx
      .reply("Ошибка /testreview. Смотри логи API.")
      .catch(() => {});
  }
}
