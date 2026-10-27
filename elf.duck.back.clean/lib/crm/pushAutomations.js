import mongoose from "mongoose";
import Order from "../../models/Order.js";
import BroadcastCampaign from "../../models/BroadcastCampaign.js";
import { getCompletedOrderMatch } from "./sales.js";
import { normalizePushButtons } from "./pushMessageFormat.js";
import { formatCashbackExpireDateLocalized } from "../telegram/clientOrderMessages.js";

export const CRM_PUSH_AUTOMATIONS_COLLECTION = "crm_push_automations";
export const CRM_PUSH_AUTOMATION_SENDS_COLLECTION =
  "crm_push_automation_sends";

export const PUSH_AUTOMATION_TRIGGERS = {
  FIRST_PURCHASE: "first_purchase",
  LEAD_FOLLOWUP: "lead_followup",
  CASHBACK_EXPIRING: "cashback_expiring",
};

const MAX_DELAY_MINUTES = 14 * 24 * 60;

const AUTOMATION_LABELS = {
  first_purchase: "Авто · первая покупка",
  lead_followup: "Авто · лиды",
  cashback_expiring: "Авто · кэшбек сгорает",
};

let broadcastRunner = null;

export function registerCrmBroadcastRunner(fn) {
  broadcastRunner = typeof fn === "function" ? fn : null;
}

function automationsCollection() {
  return mongoose.connection.collection(CRM_PUSH_AUTOMATIONS_COLLECTION);
}

function sendsCollection() {
  return mongoose.connection.collection(CRM_PUSH_AUTOMATION_SENDS_COLLECTION);
}

export async function ensurePushAutomationIndexes() {
  try {
    await automationsCollection().createIndex({ trigger: 1 }, { unique: true });
    await sendsCollection()
      .dropIndex("trigger_1_telegramId_1")
      .catch(() => {});
    await sendsCollection().updateMany(
      { subjectId: { $exists: false } },
      { $set: { subjectId: "" } }
    );
    await sendsCollection().createIndex(
      { trigger: 1, telegramId: 1, subjectId: 1 },
      { unique: true }
    );
    await sendsCollection().createIndex({ createdAt: -1 });
    await sendsCollection().createIndex({ status: 1, runAt: 1 });
  } catch (error) {
    console.error(
      "Push automation index sync failed:",
      error?.message || error
    );
  }
}

function normalizeMessage(message = {}) {
  const textPl = String(message?.textPl || "").trim();
  const textRu = String(message?.textRu || "").trim();
  const text =
    String(message?.text || "").trim() || textPl || textRu;
  const defaultLanguage =
    String(message?.defaultLanguage || "ru").trim().toLowerCase() === "pl"
      ? "pl"
      : "ru";

  return {
    title: String(message?.title || "").trim(),
    text,
    textPl,
    textRu,
    defaultLanguage,
    promo: String(message?.promo || "").trim(),
    photoUrl: String(message?.photoUrl || "").trim(),
    photoFileId: String(message?.photoFileId || "").trim(),
    buttonText: String(message?.buttonText || "").trim(),
    buttonUrl: String(message?.buttonUrl || "").trim(),
    buttons: normalizePushButtons(message?.buttons || []),
    templateId: String(message?.templateId || "").trim(),
  };
}

export async function getPushAutomation(trigger) {
  const key = String(trigger || "").trim();
  if (!key) return null;

  const row = await automationsCollection().findOne({ trigger: key });
  if (!row) {
    return {
      trigger: key,
      enabled: false,
      delayMinutes: 0,
      message: normalizeMessage({}),
      updatedAt: null,
    };
  }

  return {
    trigger: key,
    enabled: row?.enabled === true,
    delayMinutes: Math.max(0, Number(row?.delayMinutes || 0)),
    message: normalizeMessage(row?.message || {}),
    updatedAt: row?.updatedAt || null,
  };
}

export async function upsertPushAutomation(trigger, payload = {}) {
  const key = String(trigger || "").trim();
  if (!key) {
    throw new Error("INVALID_AUTOMATION_TRIGGER");
  }

  const message = normalizeMessage(payload?.message || {});
  if (!message.title && !message.text && !message.promo) {
    throw new Error("MESSAGE_REQUIRED");
  }

  const delayMinutes = Math.min(
    MAX_DELAY_MINUTES,
    Math.max(0, Number(payload?.delayMinutes || 0))
  );

  const now = new Date();
  const doc = {
    trigger: key,
    enabled: payload?.enabled === true,
    delayMinutes,
    message,
    updatedAt: now,
  };

  await automationsCollection().updateOne(
    { trigger: key },
    {
      $set: doc,
      $setOnInsert: { createdAt: now },
    },
    { upsert: true }
  );

  return getPushAutomation(key);
}

async function countCompletedPurchases(telegramId) {
  return Order.countDocuments({
    userTelegramId: telegramId,
    ...getCompletedOrderMatch(),
  });
}

function sendKey(trigger, telegramId, subjectId = "") {
  return {
    trigger: String(trigger || "").trim(),
    telegramId: String(telegramId || "").trim(),
    subjectId: String(subjectId || ""),
  };
}

async function releaseClaimedSend(trigger, telegramId, reason, subjectId = "") {
  await sendsCollection().updateOne(
    {
      ...sendKey(trigger, telegramId, subjectId),
      status: { $in: ["queued", "running"] },
    },
    {
      $set: {
        status: "scheduled",
        runAt: new Date(Date.now() + 30_000),
        lastError: String(reason || "RETRY"),
        updatedAt: new Date(),
      },
    }
  );
}

async function sendAutomationNow({
  trigger,
  telegramId,
  orderId,
  automation,
  alreadyClaimed = false,
  subjectId = "",
  messageOverride = null,
}) {
  const key = String(trigger || "").trim();
  const subject = String(subjectId || "");
  const identity = sendKey(key, telegramId, subject);
  const message = normalizeMessage(
    messageOverride || automation?.message || {}
  );
  if (
    !message.title &&
    !message.text &&
    !message.textPl &&
    !message.textRu &&
    !message.promo
  ) {
    if (alreadyClaimed) {
      await sendsCollection().updateOne(
        identity,
        {
          $set: {
            status: "cancelled",
            cancelledAt: new Date(),
            lastError: "MESSAGE_EMPTY",
          },
        }
      );
    }
    return { ok: false, reason: "MESSAGE_EMPTY" };
  }

  if (typeof broadcastRunner !== "function") {
    if (alreadyClaimed) {
      await releaseClaimedSend(
        key,
        telegramId,
        "BROADCAST_ENGINE_UNAVAILABLE",
        subject
      );
    }
    return { ok: false, reason: "BROADCAST_ENGINE_UNAVAILABLE" };
  }

  let claimed = alreadyClaimed;
  if (!claimed) {
    try {
      await sendsCollection().insertOne({
        ...identity,
        orderId: String(orderId || ""),
        status: "queued",
        createdAt: new Date(),
      });
      claimed = true;
    } catch (error) {
      if (error?.code === 11000) {
        return { ok: false, reason: "ALREADY_SENT" };
      }
      throw error;
    }
  } else {
    await sendsCollection().updateOne(
      {
        ...identity,
        status: { $in: ["scheduled", "running"] },
      },
      {
        $set: {
          status: "queued",
          orderId: String(orderId || ""),
          startedAt: new Date(),
        },
      }
    );
  }

  try {
    const campaign = await BroadcastCampaign.create({
      name: `${AUTOMATION_LABELS[key] || "Авто"} · ${telegramId}`,
      audience:
        key === PUSH_AUTOMATION_TRIGGERS.LEAD_FOLLOWUP
          ? "leads"
          : "customers",
      filters: {
        statuses: [],
        categoryKeys: [],
        locationKeys: [],
        minCheck: 0,
        minCashback: 0,
        favProduct: "",
        telegram: telegramId,
      },
      message,
      status: "queued",
      recipients: 1,
      recipientTelegramIds: [telegramId],
      processed: 0,
      sent: 0,
      failed: 0,
      blocked: 0,
      purchases: 0,
      revenue: 0,
      conversion: 0,
    });

    await broadcastRunner({
      campaignId: String(campaign._id),
      telegramIds: [telegramId],
      message,
    });

    await sendsCollection().updateOne(identity, {
      $set: {
        status: "sent",
        campaignId: String(campaign._id),
        sentAt: new Date(),
      },
    });

    return { ok: true, campaignId: String(campaign._id) };
  } catch (error) {
    if (claimed) {
      if (alreadyClaimed) {
        await releaseClaimedSend(key, telegramId, "SEND_FAILED", subject);
      } else {
        await sendsCollection().deleteOne({
          ...identity,
          status: { $in: ["queued", "running", "scheduled"] },
        });
      }
    }
    console.error("push automation send failed:", key, error);
    return { ok: false, reason: "SEND_FAILED" };
  }
}

async function sendFirstPurchaseAutomationNow(payload) {
  return sendAutomationNow({
    ...payload,
    trigger: PUSH_AUTOMATION_TRIGGERS.FIRST_PURCHASE,
  });
}

/**
 * Після першої успішної покупки — спец. офер з промокодом.
 * Delay зберігається в Mongo (status=scheduled), не в setTimeout.
 */
export async function maybeTriggerFirstPurchaseAutomation(order) {
  try {
    const telegramId = String(order?.userTelegramId || "").trim();
    if (!telegramId || telegramId.startsWith("guest_")) {
      return { ok: false, reason: "NO_TELEGRAM" };
    }

    await sendsCollection().updateMany(
      {
        trigger: PUSH_AUTOMATION_TRIGGERS.LEAD_FOLLOWUP,
        telegramId,
        status: { $in: ["scheduled", "queued"] },
      },
      {
        $set: {
          status: "cancelled",
          cancelledAt: new Date(),
          lastError: "PURCHASED",
          updatedAt: new Date(),
        },
      }
    );

    const automation = await getPushAutomation(
      PUSH_AUTOMATION_TRIGGERS.FIRST_PURCHASE
    );

    if (!automation?.enabled) {
      return { ok: false, reason: "DISABLED" };
    }

    const purchases = await countCompletedPurchases(telegramId);
    if (purchases !== 1) {
      return { ok: false, reason: "NOT_FIRST_PURCHASE", purchases };
    }

    const already = await sendsCollection().findOne({
      trigger: PUSH_AUTOMATION_TRIGGERS.FIRST_PURCHASE,
      telegramId,
    });
    if (already) {
      return { ok: false, reason: "ALREADY_SENT" };
    }

    const delayMs =
      Math.max(0, Number(automation.delayMinutes || 0)) * 60 * 1000;

    const payload = {
      telegramId,
      orderId: String(order?._id || ""),
      automation,
    };

    if (delayMs > 0) {
      const runAt = new Date(Date.now() + delayMs);
      try {
        await sendsCollection().insertOne({
          trigger: PUSH_AUTOMATION_TRIGGERS.FIRST_PURCHASE,
          telegramId,
          subjectId: "",
          orderId: String(order?._id || ""),
          status: "scheduled",
          runAt,
          createdAt: new Date(),
        });
      } catch (error) {
        if (error?.code === 11000) {
          return { ok: false, reason: "ALREADY_SENT" };
        }
        throw error;
      }
      return {
        ok: true,
        scheduled: true,
        delayMinutes: automation.delayMinutes,
        runAt,
      };
    }

    return sendFirstPurchaseAutomationNow(payload);
  } catch (error) {
    console.error("maybeTriggerFirstPurchaseAutomation error:", error);
    return { ok: false, reason: "ERROR" };
  }
}

/**
 * Лід без покупки: один раз, через delayMinutes після відкриття мініапу.
 * Повторний захід не створює другу відправку.
 */
export async function maybeScheduleLeadFollowup(telegramId) {
  try {
    const id = String(telegramId || "").trim();
    if (!id || id.startsWith("guest_")) {
      return { ok: false, reason: "NO_TELEGRAM" };
    }

    const automation = await getPushAutomation(
      PUSH_AUTOMATION_TRIGGERS.LEAD_FOLLOWUP
    );
    if (!automation?.enabled) {
      return { ok: false, reason: "DISABLED" };
    }

    const purchases = await countCompletedPurchases(id);
    if (purchases > 0) {
      return { ok: false, reason: "ALREADY_CUSTOMER" };
    }

    const existing = await sendsCollection().findOne({
      trigger: PUSH_AUTOMATION_TRIGGERS.LEAD_FOLLOWUP,
      telegramId: id,
    });
    if (existing) {
      return { ok: false, reason: "ALREADY_SENT" };
    }

    const delayMs =
      Math.max(0, Number(automation.delayMinutes || 0)) * 60 * 1000;
    const runAt = new Date(Date.now() + delayMs);

    try {
      await sendsCollection().insertOne({
        trigger: PUSH_AUTOMATION_TRIGGERS.LEAD_FOLLOWUP,
        telegramId: id,
        subjectId: "",
        orderId: "",
        status: "scheduled",
        runAt,
        createdAt: new Date(),
      });
    } catch (error) {
      if (error?.code === 11000) {
        return { ok: false, reason: "ALREADY_SENT" };
      }
      throw error;
    }

    return { ok: true, scheduled: true, runAt };
  } catch (error) {
    console.error("maybeScheduleLeadFollowup error:", error);
    return { ok: false, reason: "ERROR" };
  }
}

const DUE_TRIGGERS = [
  PUSH_AUTOMATION_TRIGGERS.FIRST_PURCHASE,
  PUSH_AUTOMATION_TRIGGERS.LEAD_FOLLOWUP,
];

/**
 * Відкладені авторозсилки (після рестарту API теж підхоплює).
 */
export async function processDueFirstPurchaseAutomations() {
  try {
    if (typeof broadcastRunner !== "function") {
      return { ok: false, reason: "BROADCAST_ENGINE_UNAVAILABLE", processed: 0 };
    }

    const now = new Date();

    await sendsCollection().updateMany(
      {
        trigger: { $in: DUE_TRIGGERS },
        status: "running",
        startedAt: { $lte: new Date(Date.now() - 5 * 60 * 1000) },
      },
      {
        $set: {
          status: "scheduled",
          runAt: now,
          lastError: "STALE_RUNNING_RECOVERY",
          updatedAt: now,
        },
      }
    );

    const due = await sendsCollection()
      .find({
        trigger: { $in: DUE_TRIGGERS },
        status: "scheduled",
        runAt: { $lte: now },
      })
      .sort({ runAt: 1 })
      .limit(40)
      .toArray();

    if (!due.length) {
      return { ok: true, processed: 0 };
    }

    const automationByTrigger = new Map();
    let processed = 0;

    for (const row of due) {
      const telegramId = String(row?.telegramId || "").trim();
      const trigger = String(row?.trigger || "").trim();
      if (!telegramId || !DUE_TRIGGERS.includes(trigger)) continue;

      const claimed = await sendsCollection().findOneAndUpdate(
        { _id: row._id, status: "scheduled" },
        { $set: { status: "running", startedAt: new Date() } },
        { returnDocument: "after" }
      );

      const claimedDoc = claimed?.value || claimed;
      if (!claimedDoc?._id) continue;

      if (!automationByTrigger.has(trigger)) {
        automationByTrigger.set(trigger, await getPushAutomation(trigger));
      }
      const automation = automationByTrigger.get(trigger);

      if (!automation?.enabled) {
        await sendsCollection().updateOne(
          { _id: row._id },
          { $set: { status: "cancelled", cancelledAt: new Date() } }
        );
        continue;
      }

      if (trigger === PUSH_AUTOMATION_TRIGGERS.LEAD_FOLLOWUP) {
        const purchases = await countCompletedPurchases(telegramId);
        if (purchases > 0) {
          await sendsCollection().updateOne(
            { _id: row._id },
            {
              $set: {
                status: "cancelled",
                cancelledAt: new Date(),
                lastError: "PURCHASED",
              },
            }
          );
          continue;
        }
      }

      const result = await sendAutomationNow({
        trigger,
        telegramId,
        orderId: String(row?.orderId || ""),
        automation,
        alreadyClaimed: true,
        subjectId: String(row?.subjectId || ""),
      });

      if (result?.ok) processed += 1;
    }

    return { ok: true, processed };
  } catch (error) {
    console.error("processDueFirstPurchaseAutomations error:", error);
    return { ok: false, reason: "ERROR", processed: 0 };
  }
}

function fillExpireToken(value, { amount, days, date }) {
  return String(value || "")
    .replaceAll("{amount}", amount)
    .replaceAll("{days}", String(days))
    .replaceAll("{date}", date);
}

/**
 * Один раз на каждую порцию кэшбека, когда до сгорания остаётся 5 дней или меньше.
 * Повторная порция с другой датой уходит отдельно.
 */
export async function notifyCashbackExpiringAutomation(user, rows) {
  const telegramId = String(user?.telegramId || "").trim();
  const batch = Array.isArray(rows) ? rows.filter(Boolean) : [];
  if (!telegramId || telegramId.startsWith("guest_") || !batch.length) {
    return { ok: false, reason: "NO_TELEGRAM" };
  }

  const automation = await getPushAutomation(
    PUSH_AUTOMATION_TRIGGERS.CASHBACK_EXPIRING
  );
  if (!automation?.enabled) {
    return { ok: false, reason: "DISABLED" };
  }

  const sorted = [...batch].sort(
    (a, b) => new Date(a?.expiresAt).getTime() - new Date(b?.expiresAt).getTime()
  );
  const nearest = sorted[0];
  const expiresAt = new Date(nearest?.expiresAt);
  const days = Math.max(
    0,
    Math.ceil((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
  );
  const amount = batch
    .reduce((sum, row) => sum + Math.max(0, Number(row?.remainingZl || 0)), 0)
    .toFixed(2);
  const datePl = formatCashbackExpireDateLocalized(expiresAt, "pl");
  const dateRu = formatCashbackExpireDateLocalized(expiresAt, "ru");
  const base = automation.message || {};
  const messageOverride = {
    ...base,
    title: fillExpireToken(base.title, { amount, days, date: dateRu }),
    text: fillExpireToken(base.text, { amount, days, date: dateRu }),
    textPl: fillExpireToken(base.textPl, { amount, days, date: datePl }),
    textRu: fillExpireToken(base.textRu, { amount, days, date: dateRu }),
  };

  const subjectId = sorted
    .map((row) => String(row?._id || ""))
    .filter(Boolean)
    .sort()
    .join(",")
    .slice(0, 240);

  await ensurePushAutomationIndexes();

  const result = await sendAutomationNow({
    trigger: PUSH_AUTOMATION_TRIGGERS.CASHBACK_EXPIRING,
    telegramId,
    automation,
    messageOverride,
    subjectId,
  });

  if (result?.reason === "ALREADY_SENT") {
    return { ok: true, already: true };
  }

  return result;
}
