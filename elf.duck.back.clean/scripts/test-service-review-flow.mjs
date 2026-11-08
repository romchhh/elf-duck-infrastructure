import assert from "node:assert/strict";
import fs from "node:fs";
import {
  buildServiceReviewTelegramPayload,
  getServiceReviewDelayBoundsMs,
  SERVICE_REVIEW_INVITES_COLLECTION,
} from "../lib/support/serviceReviewInvite.js";
import { getCompletedOrderMatch } from "../lib/crm/sales.js";

console.log("=== service review static checks ===");

const ru = buildServiceReviewTelegramPayload("ru");
const pl = buildServiceReviewTelegramPayload("pl");

assert.equal(ru.imageExists, true, "promo-ru.png missing");
assert.equal(pl.imageExists, true, "promo-pl.png missing");
assert.match(ru.caption, /15 zł/i);
assert.match(pl.caption, /15 zł/i);
assert.equal(ru.buttonText, "ОЦЕНИ НАШУ РАБОТУ");
assert.equal(pl.buttonText, "OCEŃ NASZĄ PRACĘ");

const webapp = String(process.env.WEBAPP_URL || process.env.APP_URL || "").trim();
if (webapp) {
  assert.ok(ru.reviewUrl.endsWith("/service-review"), "review webapp path");
  assert.equal(
    ru.reply_markup?.inline_keyboard?.[0]?.[0]?.web_app?.url,
    ru.reviewUrl
  );
} else {
  console.warn("skip WEBAPP_URL check (env not set)");
}

const bounds = getServiceReviewDelayBoundsMs();
assert.equal(bounds.min, 5 * 60 * 1000);
assert.equal(bounds.max, 10 * 60 * 1000);

const match = getCompletedOrderMatch();
assert.ok(match.$or?.length >= 2, "completed order match");

const chunk07 = fs.readFileSync(
  new URL("../lib/server/helpers/chunk07.js", import.meta.url),
  "utf8"
);
const chunk03 = fs.readFileSync(
  new URL("../lib/server/helpers/chunk03.js", import.meta.url),
  "utf8"
);
const intervals = fs.readFileSync(
  new URL("../lib/server/intervals.js", import.meta.url),
  "utf8"
);

assert.match(chunk07, /maybeScheduleFirstOrderServiceReview/);
assert.match(chunk03, /maybeScheduleFirstOrderServiceReview/);
assert.match(intervals, /processDueServiceReviewInvites/);

console.log("static wiring: ok");

const mongoUri = String(process.env.MONGODB_URI || "").trim();
if (!mongoUri) {
  console.log("Mongo skipped (MONGODB_URI not set)");
  console.log("All service review checks passed (static only).");
  process.exit(0);
}

const mongoose = (await import("mongoose")).default;

await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 8000 });

try {
  const db = mongoose.connection.db;
  const indexes = await db
    .collection(SERVICE_REVIEW_INVITES_COLLECTION)
    .indexes()
    .catch(() => []);

  const hasTelegramUnique = indexes.some(
    (idx) => idx.name === "service_review_telegram_unique"
  );
  if (indexes.length > 1 && !hasTelegramUnique) {
    console.warn(
      "warn: service_review_invites exists but unique telegram index not yet created (will appear after first API tick)"
    );
  }

  const scheduled = await db
    .collection(SERVICE_REVIEW_INVITES_COLLECTION)
    .countDocuments({ status: "scheduled" });
  const sent = await db
    .collection(SERVICE_REVIEW_INVITES_COLLECTION)
    .countDocuments({ status: "sent" });
  const completed = await db
    .collection(SERVICE_REVIEW_INVITES_COLLECTION)
    .countDocuments({ status: "completed" });

  console.log(
    `Mongo invites: scheduled=${scheduled} sent=${sent} completed=${completed}`
  );

  const pastDue = await db
    .collection(SERVICE_REVIEW_INVITES_COLLECTION)
    .countDocuments({
      status: "scheduled",
      runAt: { $lte: new Date() },
    });
  if (pastDue > 0) {
    console.warn(
      `warn: ${pastDue} invite(s) past runAt still scheduled — interval should send within 30s after API restart`
    );
  }
} finally {
  await mongoose.disconnect();
}

console.log("All service review checks passed.");
