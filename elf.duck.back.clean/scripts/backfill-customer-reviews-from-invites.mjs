/**
 * Відновлює customer_reviews з completed service_review_invites
 * (після бага TDZ testMode, коли create падав, а invite ставав completed).
 *
 *   cd elf.duck.back.clean
 *   node scripts/backfill-customer-reviews-from-invites.mjs --dry-run
 *   node scripts/backfill-customer-reviews-from-invites.mjs
 */
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import mongoose from "mongoose";
import CustomerReview from "../models/CustomerReview.js";
import User from "../models/User.js";
import Order from "../models/Order.js";
import PickupPoint from "../models/PickupPoint.js";
import { describeMongoUri } from "../lib/mongoTarget.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config();
dotenv.config({ path: path.join(scriptDir, "..", "..", ".env") });

const dryRun = process.argv.includes("--dry-run");

const LABELS = {
  ru: { great: "Отлично", good: "Нормально", bad: "Плохо" },
  pl: { great: "Świetnie", good: "W porządku", bad: "Źle" },
};

function ratingLabel(language, rating) {
  const lang = language === "pl" ? "pl" : "ru";
  return LABELS[lang][rating] || rating;
}

async function main() {
  const uri = String(process.env.MONGODB_URI || "").trim();
  if (!uri) {
    console.error("MONGODB_URI is required");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("Mongo:", describeMongoUri(uri));

  const invites = mongoose.connection.db.collection("service_review_invites");
  const completed = await invites
    .find({ status: "completed", rating: { $type: "string", $ne: "" } })
    .sort({ completedAt: -1 })
    .toArray();

  console.log("completed invites with rating:", completed.length);

  let created = 0;
  let skipped = 0;

  try {
    for (const invite of completed) {
      const telegramId = String(invite.telegramId || "").trim();
      const rating = String(invite.rating || "").trim().toLowerCase();
      if (!telegramId || !rating) {
        skipped += 1;
        continue;
      }

      const existing = await CustomerReview.findOne({
        telegramId,
        source: {
          $in: [
            "first_order_service_review",
            "first_order_service_review_test",
          ],
        },
        ...(invite.orderId
          ? { orderId: invite.orderId }
          : { rating, createdAt: invite.completedAt || invite.updatedAt }),
      }).lean();

      if (existing) {
        skipped += 1;
        continue;
      }

      const user = await User.findOne({ telegramId }).lean();
      const language = String(invite.language || user?.language || "ru")
        .trim()
        .toLowerCase();
      const label = ratingLabel(language, rating);

      let order = null;
      if (invite.orderId) {
        order = await Order.findById(invite.orderId).lean();
      }

      let pickupPoint = null;
      const pointId =
        String(invite.pickupPointId || "").trim() ||
        String(order?.pickupPointId || "").trim();
      if (pointId) {
        pickupPoint = await PickupPoint.findById(pointId).lean();
      }

      const doc = {
        telegramId,
        username: String(user?.username || ""),
        firstName: String(user?.firstName || ""),
        lastName: String(user?.lastName || ""),
        text: label,
        orderId: order?._id || invite.orderId || null,
        orderNo: String(order?.orderNo || ""),
        pickupPointId: pickupPoint?._id || null,
        pointTitle: String(
          pickupPoint?.title || order?.pickupPointTitle || ""
        ).trim(),
        pointAddress: String(
          pickupPoint?.address || order?.pickupPointAddress || ""
        ).trim(),
        deliveryLabel: "",
        source: invite.testMode
          ? "first_order_service_review_test"
          : "first_order_service_review",
        rating,
        ratingLabel: label,
        imageUrls: [],
        imageCount: 0,
        telegramSent: false,
        createdAt: invite.completedAt || invite.updatedAt || new Date(),
        updatedAt: invite.completedAt || invite.updatedAt || new Date(),
      };

      console.log(
        `${dryRun ? "[dry-run] " : ""}create`,
        telegramId,
        rating,
        doc.orderNo || "(no order)"
      );

      if (!dryRun) {
        await CustomerReview.collection.insertOne(doc);
      }
      created += 1;
    }
  } finally {
    await mongoose.disconnect();
  }

  console.log({ created, skipped, dryRun });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
