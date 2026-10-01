/**
 * Loads every admin-bot handler module (same order as launchAdminBot + side imports).
 * Catches missing exports / bad import paths before deploy.
 *
 * Run from repo root:
 *   node scripts/verify-admin-bot-imports.mjs
 */
import { initBot } from "../elf.duck.admin-bot.clean/src/bot/single.js";

process.env.ADMIN_BOT_TOKEN ||= "verify-dummy";
process.env.API_URL ||= "http://localhost";
process.env.ADMIN_API_TOKEN ||= "verify-dummy";
process.env.ADMIN_IDS ||= "1";
process.env.SUPER_ADMIN_IDS ||= "1";

initBot();

const HANDLER_MODULES = [
  "../elf.duck.admin-bot.clean/src/handlers/wizardState.js",
  "../elf.duck.admin-bot.clean/src/handlers/cashback.js",
  "../elf.duck.admin-bot.clean/src/handlers/categoryProductDefs.js",
  "../elf.duck.admin-bot.clean/src/handlers/flavorFlow.js",
  "../elf.duck.admin-bot.clean/src/handlers/productFlow.js",
  "../elf.duck.admin-bot.clean/src/handlers/pickupFlow.js",
  "../elf.duck.admin-bot.clean/src/handlers/commands.js",
  "../elf.duck.admin-bot.clean/src/handlers/pickupCrud.js",
  "../elf.duck.admin-bot.clean/src/handlers/productActions.js",
  "../elf.duck.admin-bot.clean/src/handlers/flavorActions.js",
  "../elf.duck.admin-bot.clean/src/handlers/categoryEdit.js",
  "../elf.duck.admin-bot.clean/src/handlers/categoryWizard.js",
  "../elf.duck.admin-bot.clean/src/handlers/promoAndBroadcast.js",
  "../elf.duck.admin-bot.clean/src/handlers/adminPanel.js",
  "../elf.duck.admin-bot.clean/src/handlers/mediaHandlers.js",
];

let failed = false;
for (const mod of HANDLER_MODULES) {
  try {
    await import(mod);
    console.log("OK", mod.split("/").pop());
  } catch (e) {
    failed = true;
    console.error("FAIL", mod, e?.message || e);
  }
}

if (failed) process.exit(1);
console.log("All admin-bot handler modules loaded.");
