/**
 * Smoke: поточний місяць розіграшу + bannerVisible + startGiveawayMonth idempotent.
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import {
  ensureGiveawayIndexes,
  getActiveGiveawayMonthKey,
  getGiveawayPublicState,
  isGiveawayMonthLive,
  startGiveawayMonth,
  ensureGiveawayMonth,
} from "../lib/giveaway/service.js";

const root = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(root, "../../.env") });
dotenv.config({ path: path.resolve(root, "../.env") });

import assert from "node:assert/strict";

async function main() {
  const uri = String(process.env.MONGODB_URI || "").trim();
  if (!uri) {
    console.error("MONGODB_URI is not set — skip DB smoke");
    process.exit(0);
  }

  await mongoose.connect(uri);
  await ensureGiveawayIndexes();

  const monthKey = getActiveGiveawayMonthKey();
  assert.match(monthKey, /^\d{4}-\d{2}$/);

  await ensureGiveawayMonth(monthKey);
  const before = await getGiveawayPublicState({ telegramId: "", monthKey });
  assert.equal(typeof before.bannerVisible, "boolean");
  assert.equal(typeof before.participationOpen, "boolean");

  if (String(before.status) === "open") {
    assert.ok(
      before.bannerVisible === true ||
        before.phase === "awaiting_draw" ||
        before.participationOpen,
      "open current month should show banner or be in draw window"
    );
  }

  const month = await ensureGiveawayMonth(monthKey);
  assert.equal(isGiveawayMonthLive(month), before.participationOpen);

  await startGiveawayMonth(monthKey);
  await startGiveawayMonth(monthKey);
  const after = await getGiveawayPublicState({ telegramId: "", monthKey });
  assert.equal(after.participationOpen, before.participationOpen);

  console.log(
    JSON.stringify(
      {
        ok: true,
        monthKey,
        phase: after.phase,
        bannerVisible: after.bannerVisible,
        participationOpen: after.participationOpen,
        startedAtSet: Boolean(
          (await ensureGiveawayMonth(monthKey))?.startedAt
        ),
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
