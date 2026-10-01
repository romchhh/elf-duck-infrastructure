import { Input } from "telegraf";
import { ADMIN_IDS, SUPER_ADMIN_IDS } from "./config.js";
import {
  isAdmin,
  accessDeniedReply,
  setAdminBotUsername,
  getAdminBotUsername,
} from "./auth.js";
import { clearState } from "./state.js";
import { initBot, bot } from "./bot/single.js";
import { mainMenu, registerMainMenuHandlers } from "./handlers/menu.js";
import { loadBroadcastTemplates } from "./handlers/broadcastTemplates.js";

const HANDLER_MODULES = [
  "./handlers/wizardState.js",
  "./handlers/cashback.js",
  "./handlers/categoryProductDefs.js",
  "./handlers/flavorFlow.js",
  "./handlers/productFlow.js",
  "./handlers/pickupFlow.js",
  "./handlers/commands.js",
  "./handlers/pickupCrud.js",
  "./handlers/productActions.js",
  "./handlers/flavorActions.js",
  "./handlers/categoryEdit.js",
  "./handlers/categoryWizard.js",
  "./handlers/promoAndBroadcast.js",
  "./handlers/adminPanel.js",
  "./handlers/mediaHandlers.js",
];

export async function launchAdminBot() {
  initBot();

  // Reply-keyboard menu emulates callback_query; fake ids break answerCbQuery().
  bot.use(async (ctx, next) => {
    if (ctx.update?.__fromReplyKeyboard) {
      ctx.answerCbQuery = async () => undefined;
    }
    return next();
  });

  registerMainMenuHandlers(bot);

  for (const mod of HANDLER_MODULES) {
    await import(mod);
  }

  await loadBroadcastTemplates();

  try {
    const me = await bot.telegram.getMe();
    setAdminBotUsername(me?.username);
    console.log(
      `✅ Admin bot @${getAdminBotUsername() || "?"} | ADMIN_IDS=${ADMIN_IDS.length} | SUPER_ADMIN_IDS=${SUPER_ADMIN_IDS.length}`
    );

    await bot.telegram.setMyCommands([
      { command: "menu", description: "Операционное меню" },
      { command: "admin", description: "Админ-панель (статистика, рассылка)" },
      { command: "start", description: "Запустить бота" },
      { command: "id", description: "Показать ваш Telegram ID" },
    ]);

    await bot.telegram.setChatMenuButton({
      menuButton: { type: "commands" },
    });

    console.log("✅ Telegram menu button configured");
  } catch (menuError) {
    console.error("Telegram menu button setup error:", menuError);
  }

  bot.command("menu", async (ctx) => {
    if (!isAdmin(ctx)) {
      return ctx.reply(accessDeniedReply(ctx), { parse_mode: "Markdown" });
    }
    clearState(ctx.chat.id);
    return ctx.reply("Главное меню", mainMenu(ctx));
  });

  await bot
    .launch()
    .then(() => console.log("✅ Admin bot launched (long polling)"))
    .catch((launchError) => {
      console.error(
        "❌ Admin bot failed to launch. Проверьте ADMIN_BOT_TOKEN в .env:",
        launchError?.response?.description || launchError?.message || launchError
      );
      process.exit(1);
    });

  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
}
