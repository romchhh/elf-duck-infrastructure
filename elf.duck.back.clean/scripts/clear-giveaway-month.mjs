/**
 * Повністю очищає розіграш місяця (учасники, записи, переможці, старт).
 *
 *   node scripts/clear-giveaway-month.mjs --month 2026-11
 *   node scripts/clear-giveaway-month.mjs --month 2026-11 --start
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import {
  clearGiveawayMonth,
  ensureGiveawayIndexes,
  getActiveGiveawayMonthKey,
} from "../lib/giveaway/service.js";

const root = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(root, "../../.env") });
dotenv.config({ path: path.resolve(root, "../.env") });

function parseArgs(argv) {
  let monthKey = "";
  let startAfter = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--month" && argv[i + 1]) {
      monthKey = String(argv[++i]).trim();
    } else if (arg === "--start") {
      startAfter = true;
    }
  }

  return { monthKey, startAfter };
}

async function main() {
  const uri = String(process.env.MONGODB_URI || "").trim();
  if (!uri) {
    console.error("MONGODB_URI is not set");
    process.exit(1);
  }

  const { monthKey, startAfter } = parseArgs(process.argv.slice(2));
  const key = monthKey || getActiveGiveawayMonthKey();

  await mongoose.connect(uri);
  await ensureGiveawayIndexes();

  const result = await clearGiveawayMonth(key, { startAfter });
  console.log(JSON.stringify(result, null, 2));
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
