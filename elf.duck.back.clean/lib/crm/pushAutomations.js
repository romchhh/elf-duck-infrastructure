import mongoose from "mongoose";
import Order from "../../models/Order.js";
import BroadcastCampaign from "../../models/BroadcastCampaign.js";
import { getCompletedOrderMatch } from "./sales.js";

export const CRM_PUSH_AUTOMATIONS_COLLECTION = "crm_push_automations";
export const CRM_PUSH_AUTOMATION_SENDS_COLLECTION =
  "crm_push_automation_sends";

export const PUSH_AUTOMATION_TRIGGERS = {
  FIRST_PURCHASE: "first_purchase",
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
    await Promise.all([
      automationsCollection().createIndex({ trigger: 1 }, { unique: true }),
      sendsCollection().createIndex(
        { trigger: 1, telegramId: 1 },
        { unique: true }
      ),
      sendsCollection().createIndex({ createdAt: -1 }),
      sendsCollection().createIndex({ status: 1, runAt: 1 }),
    ]);
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
    24 * 60,
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

async function releaseClaimedSend(telegramId, reason) {
  await sendsCollection().updateOne(
    {
      trigger: PUSH_AUTOMATION_TRIGGERS.FIRST_PURCHASE,
      telegramId,
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

async function sendFirstPurchaseAutomationNow({
  telegramId,
  orderId,
  automation,
  alreadyClaimed = false,
}) {
  const message = normalizeMessage(automation?.message || {});
  if (
    !message.title &&
    !message.text &&
    !message.textPl &&
    !message.textRu &&
    !message.promo
  ) {
    if (alreadyClaimed) {
      await sendsCollection().updateOne(
        {
          trigger: PUSH_AUTOMATION_TRIGGERS.FIRST_PURCHASE,
          telegramId,
        },
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
      await releaseClaimedSend(telegramId, "BROADCAST_ENGINE_UNAVAILABLE");
    }
    return { ok: false, reason: "BROADCAST_ENGINE_UNAVAILABLE" };
  }

  let claimed = alreadyClaimed;
  if (!claimed) {
    try {
      await sendsCollection().insertOne({
        trigger: PUSH_AUTOMATION_TRIGGERS.FIRST_PURCHASE,
        telegramId,
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
        trigger: PUSH_AUTOMATION_TRIGGERS.FIRST_PURCHASE,
        telegramId,
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
      name: `Авто: первая покупка · ${telegramId}`,
      audience: "customers",
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

    await sendsCollection().updateOne(
      {
        trigger: PUSH_AUTOMATION_TRIGGERS.FIRST_PURCHASE,
        telegramId,
      },
      {
        $set: {
          status: "sent",
          campaignId: String(campaign._id),
          sentAt: new Date(),
        },
      }
    );

    return { ok: true, campaignId: String(campaign._id) };
  } catch (error) {
    if (claimed) {
      if (alreadyClaimed) {
        await releaseClaimedSend(telegramId, "SEND_FAILED");
      } else {
        await sendsCollection().deleteOne({
          trigger: PUSH_AUTOMATION_TRIGGERS.FIRST_PURCHASE,
          telegramId,
          status: { $in: ["queued", "running", "scheduled"] },
        });
      }
    }
    console.error("first purchase automation send failed:", error);
    return { ok: false, reason: "SEND_FAILED" };
  }
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
 * Обробка відкладених first_purchase (після рестарту API теж підхоплює).
 */
export async function processDueFirstPurchaseAutomations() {
  try {
    if (typeof broadcastRunner !== "function") {
      return { ok: false, reason: "BROADCAST_ENGINE_UNAVAILABLE", processed: 0 };
    }

    const now = new Date();

    // Зависшие running после краша процесса — вернуть в очередь
    await sendsCollection().updateMany(
      {
        trigger: PUSH_AUTOMATION_TRIGGERS.FIRST_PURCHASE,
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
        trigger: PUSH_AUTOMATION_TRIGGERS.FIRST_PURCHASE,
        status: "scheduled",
        runAt: { $lte: now },
      })
      .sort({ runAt: 1 })
      .limit(40)
      .toArray();

    if (!due.length) {
      return { ok: true, processed: 0 };
    }

    const automation = await getPushAutomation(
      PUSH_AUTOMATION_TRIGGERS.FIRST_PURCHASE
    );

    let processed = 0;
    for (const row of due) {
      const telegramId = String(row?.telegramId || "").trim();
      if (!telegramId) continue;

      const claimed = await sendsCollection().findOneAndUpdate(
        {
          _id: row._id,
          status: "scheduled",
        },
        {
          $set: {
            status: "running",
            startedAt: new Date(),
          },
        },
        { returnDocument: "after" }
      );

      const claimedDoc = claimed?.value || claimed;
      if (!claimedDoc?._id) continue;

      if (!automation?.enabled) {
        await sendsCollection().updateOne(
          { _id: row._id },
          { $set: { status: "cancelled", cancelledAt: new Date() } }
        );
        continue;
      }

      const result = await sendFirstPurchaseAutomationNow({
        telegramId,
        orderId: String(row?.orderId || ""),
        automation,
        alreadyClaimed: true,
      });

      if (result?.ok) processed += 1;
    }

    return { ok: true, processed };
  } catch (error) {
    console.error("processDueFirstPurchaseAutomations error:", error);
    return { ok: false, reason: "ERROR", processed: 0 };
  }
}
