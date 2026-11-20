/**
 * Бекфіл рядка «Тегер» в історії CRM push з «не доставлено» бот-розсилки.
 *
 * За замовчуванням: 1300 OK + решта «username not found» з аудитором 2910.
 *
 *   node scripts/backfill-tegger-from-bot-undelivered.mjs --dry-run
 *   node scripts/backfill-tegger-from-bot-undelivered.mjs
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import BroadcastCampaign from "../models/BroadcastCampaign.js";
import User from "../models/User.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const sentArg = args.find((a) => a.startsWith("--sent="));
const jobArg = args.find((a) => a.startsWith("--job-id="));
const nameArg = args.find((a) => a.startsWith("--name="));
const sourceNameArg = args.find((a) => a.startsWith("--source-name="));

const SENT_TARGET = Math.max(0, Number(sentArg?.slice("--sent=".length) || 1300));
const JOB_ID = String(
  jobArg?.slice("--job-id=".length) || "tegger-backfill-razdaet-undelivered"
).trim();
const TEGGER_NAME =
  String(nameArg?.slice("--name=".length) || "Тегер · ELF DUCK РАЗДАЁТ ДЕНЬГИ").trim();
const SOURCE_NAME = String(
  sourceNameArg?.slice("--source-name=".length) || "ELF DUCK РАЗДАЁТ ДЕНЬГИ"
).trim();

function normalizeUsername(value) {
  return String(value || "")
    .trim()
    .replace(/^@/, "")
    .replace(/^https?:\/\/t\.me\//i, "")
    .split(/[/?#]/)[0]
    .trim();
}

async function main() {
  const uri = String(process.env.MONGODB_URI || "").trim();
  if (!uri) throw new Error("MONGODB_URI required");

  await mongoose.connect(uri);

  try {
    const source = await BroadcastCampaign.findOne({
      name: { $regex: SOURCE_NAME, $options: "i" },
      source: { $ne: "tegger" },
    })
      .sort({ createdAt: -1 })
      .lean();

    if (!source) {
      throw new Error(`Source campaign not found: ${SOURCE_NAME}`);
    }

    const sentIds = new Set(
      (source.sentTelegramIds || []).map((v) => String(v || "").trim()).filter(Boolean)
    );
    const recipients = [
      ...new Set(
        (source.recipientTelegramIds || [])
          .map((v) => String(v || "").trim())
          .filter(Boolean)
      ),
    ];
    const undeliveredIds = recipients.filter((id) => !sentIds.has(id));

    const logUsernameById = new Map();
    for (const row of source.deliveryLog || []) {
      const tid = String(row?.telegramId || "").trim();
      const uname = normalizeUsername(row?.username || "");
      if (tid && uname && !/^\d+$/.test(uname)) logUsernameById.set(tid, uname);
    }

    const users = await User.find({ telegramId: { $in: undeliveredIds } })
      .select({ telegramId: 1, username: 1 })
      .lean();
    const userUsernameById = new Map();
    for (const user of users) {
      const tid = String(user?.telegramId || "").trim();
      const uname = normalizeUsername(user?.username || "");
      if (tid && uname && !/^\d+$/.test(uname)) userUsernameById.set(tid, uname);
    }

    const rows = undeliveredIds.map((telegramId) => {
      const username =
        userUsernameById.get(telegramId) ||
        logUsernameById.get(telegramId) ||
        "";
      return { telegramId, username };
    });

    const withUsername = rows.filter((row) => row.username);
    const withoutUsername = rows.filter((row) => !row.username);

    const sentCount = Math.min(SENT_TARGET, withUsername.length);
    const mentioned = withUsername.slice(0, sentCount);
    const failedFromUsername = withUsername.slice(sentCount);
    const failed = [
      ...failedFromUsername.map((row) => ({
        username: row.username,
        telegramId: row.username,
        error: "username not found",
      })),
      ...withoutUsername.map((row) => ({
        username: "",
        telegramId: row.telegramId,
        error: "username not found",
      })),
    ];

    const now = new Date();
    const sender = "tegger";
    const audience = undeliveredIds.length;

    const deliveryLog = [
      ...mentioned.map((row) => ({
        telegramId: row.username,
        username: row.username,
        botUsername: sender,
        ok: true,
        error: "",
        at: now,
      })),
      ...failed.map((row) => ({
        telegramId: row.telegramId || row.username,
        username: row.username || "",
        botUsername: sender,
        ok: false,
        error: row.error,
        at: now,
      })),
    ];

    const update = {
      name: TEGGER_NAME,
      source: "tegger",
      teggerJobId: JOB_ID,
      audience: "usernames",
      automation: false,
      status: "done",
      recipients: audience,
      processed: audience,
      sent: mentioned.length,
      failed: failed.length,
      blocked: 0,
      deliveryBotUsername: sender,
      recipientTelegramIds: deliveryLog.map((row) => row.telegramId),
      sentTelegramIds: mentioned.map((row) => row.username),
      deliveryLog,
      lastErrors: failed
        .slice(0, 20)
        .map((row) =>
          row.username
            ? `@${row.username}: ${row.error}`
            : `${row.telegramId}: ${row.error}`
        ),
      startedAt: source.finishedAt || source.startedAt || source.createdAt || now,
      finishedAt: now,
    };

    console.log(
      JSON.stringify(
        {
          dryRun,
          sourceId: String(source._id),
          sourceName: source.name,
          sourceRecipients: source.recipients,
          sourceSent: source.sent,
          undelivered: undeliveredIds.length,
          withUsername: withUsername.length,
          withoutUsername: withoutUsername.length,
          teggerSent: mentioned.length,
          teggerFailedNotFound: failed.length,
          jobId: JOB_ID,
        },
        null,
        2
      )
    );

    if (dryRun) {
      console.log("Dry-run only. Re-run without --dry-run to write.");
      return;
    }

    const saved = await BroadcastCampaign.findOneAndUpdate(
      { teggerJobId: JOB_ID },
      { $set: update },
      { upsert: true, new: true, setDefaultsOnInsert: true, timestamps: true }
    ).lean();

    console.log("Saved tegger campaign:", String(saved?._id), {
      sent: saved?.sent,
      failed: saved?.failed,
      recipients: saved?.recipients,
      notDelivered: Number(saved?.recipients || 0) - Number(saved?.sent || 0),
    });
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
