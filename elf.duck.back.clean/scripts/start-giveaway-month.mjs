/**
 * Офіційний старт розіграшу місяця (startedAt + догонка квитків учасників).
 *
 *   node scripts/start-giveaway-month.mjs
 *   node scripts/start-giveaway-month.mjs --month 2026-11
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import {
  ensureGiveawayIndexes,
  ensureGiveawayMonth,
  getActiveGiveawayMonthKey,
  startGiveawayMonth,
} from "../lib/giveaway/service.js";

const root = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(root, "../../.env") });
dotenv.config({ path: path.resolve(root, "../.env") });

function parseMonth(argv) {
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--month" && argv[i + 1]) {
      return String(argv[++i]).trim();
    }
  }
  return "";
}

async function main() {
  const uri = String(process.env.MONGODB_URI || "").trim();
  if (!uri) {
    console.error("MONGODB_URI is not set");
    process.exit(1);
  }

  const monthKey = parseMonth(process.argv.slice(2)) || getActiveGiveawayMonthKey();

  await mongoose.connect(uri);
  await ensureGiveawayIndexes();
  await ensureGiveawayMonth(monthKey);
  const state = await startGiveawayMonth(monthKey);

  console.log(
    JSON.stringify(
      {
        ok: true,
        monthKey,
        startedAt: state?.month?.startedAt || null,
        status: state?.month?.status,
        phase: state?.phase,
        participationOpen: state?.phase === "active",
      },
      null,
      2
    )
  );
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
