/**
 * Тестові учасники розіграшу без реальних замовлень.
 *
 *   node scripts/seed-giveaway-test-participants.mjs
 *   node scripts/seed-giveaway-test-participants.mjs --entries 2
 *   node scripts/seed-giveaway-test-participants.mjs --ids 585621771,7119952932
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import {
  ensureGiveawayIndexes,
  getActiveGiveawayMonthKey,
  seedGiveawayTestParticipants,
} from "../lib/giveaway/service.js";

const DEFAULT_IDS = ["585621771", "7119952932"];

const root = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(root, "../../.env") });
dotenv.config({ path: path.resolve(root, "../.env") });

function parseArgs(argv) {
  let entriesPerUser = 1;
  let monthKey = "";
  let ids = [...DEFAULT_IDS];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--entries" && argv[i + 1]) {
      entriesPerUser = Number(argv[++i]) || 1;
    } else if (arg === "--month" && argv[i + 1]) {
      monthKey = String(argv[++i]).trim();
    } else if ((arg === "--ids" || arg === "--id") && argv[i + 1]) {
      ids = String(argv[++i])
        .split(/[,;\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }

  return { entriesPerUser, monthKey, ids };
}

async function main() {
  const uri = String(process.env.MONGODB_URI || "").trim();
  if (!uri) {
    console.error("MONGODB_URI is not set");
    process.exit(1);
  }

  const { entriesPerUser, monthKey, ids } = parseArgs(process.argv.slice(2));
  const key = monthKey || getActiveGiveawayMonthKey();

  await mongoose.connect(uri);
  await ensureGiveawayIndexes();

  const result = await seedGiveawayTestParticipants(key, ids, {
    entriesPerUser,
  });

  console.log(JSON.stringify(result, null, 2));
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
