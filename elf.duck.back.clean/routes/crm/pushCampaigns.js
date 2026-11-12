import express from "express";
import mongoose from "mongoose";
import {
  buildPushCampaignAnalytics,
  getPeriodRange,
  BroadcastCampaign,
  User,
  requireCrmPushAdmin,
} from "./deps.js";
import { getWarsawDateKey, warsawLocalToUtc } from "../../lib/crm/datetime.js";

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function campaignSource(row) {
  const explicit = String(row?.source || "").trim();
  if (explicit === "automation" || explicit === "giveaway" || explicit === "manual") {
    return explicit;
  }
  const name = String(row?.name || "");
  if (row?.automation === true || /^Авто\s*·/.test(name)) return "automation";
  if (/^Розыгрыш\s*·/.test(name)) return "giveaway";
  return "manual";
}

function autoTitle(name) {
  const raw = String(name || "").trim();
  const match = raw.match(/^Авто\s*·\s*(.+?)(?:\s*·\s*\d{5,})?$/);
  if (!match) return raw || "Авто";
  return `Авто · ${String(match[1] || "").trim()}`;
}

const AUTOMATION_TRIGGER_LABELS = {
  first_purchase: "Авто · первая покупка",
  lead_followup: "Авто · лиды",
  cashback_expiring: "Авто · кэшбек сгорает",
  customer_sleeping: "Авто · спящий клиент",
};

function automationTriggerKey(row) {
  const explicit = String(row?.automationTrigger || "").trim();
  if (explicit && Object.prototype.hasOwnProperty.call(AUTOMATION_TRIGGER_LABELS, explicit)) {
    return explicit;
  }
  const title = autoTitle(row?.name || explicit).toLowerCase();
  if (title.includes("кэшбек") || title.includes("кешбек")) return "cashback_expiring";
  if (title.includes("спящ")) return "customer_sleeping";
  if (title.includes("перв")) return "first_purchase";
  if (title.includes("лид")) return "lead_followup";
  return explicit || autoTitle(row?.name) || "automation";
}

function automationDisplayName(row) {
  const key = automationTriggerKey(row);
  return AUTOMATION_TRIGGER_LABELS[key] || autoTitle(row?.name) || "Авто";
}

function warsawDayRange(dayKey) {
  const [year, month, day] = String(dayKey || "")
    .split("-")
    .map((part) => Number(part));
  if (!year || !month || !day) return null;
  return {
    from: warsawLocalToUtc({ year, month, day, hour: 0, minute: 0, second: 0 }),
    to: warsawLocalToUtc({
      year,
      month,
      day: day + 1,
      hour: 0,
      minute: 0,
      second: 0,
    }),
  };
}

function automationBucket(row) {
  if (campaignSource(row) !== "automation") return "";
  const day =
    String(row?.automationDayKey || "").trim() ||
    getWarsawDateKey(row?.createdAt || row?.startedAt || new Date());
  const trigger = automationTriggerKey(row);
  return `${trigger}|${day}`;
}

async function resolveCampaignMembers(row) {
  if (!row) return [row];
  let members = [row];
  if (campaignSource(row) === "automation") {
    const dayKey =
      String(row.automationDayKey || "").trim() ||
      getWarsawDateKey(row.createdAt || row.startedAt || new Date());
    const range = warsawDayRange(dayKey);
    const title = autoTitle(row.name);
    if (range && title) {
      const found = await BroadcastCampaign.find({
        createdAt: { $gte: range.from, $lt: range.to },
        $or: [
          {
            automation: true,
            automationTrigger: String(row.automationTrigger || ""),
            automationDayKey: dayKey,
          },
          { name: { $regex: `^${escapeRegex(title)}` } },
        ],
      })
        .sort({ createdAt: -1 })
        .lean();
      if (found.length) members = found;
    }
  }
  return members;
}

function mergeDeliveryLogs(members) {
  return members
    .flatMap((item) => (Array.isArray(item.deliveryLog) ? item.deliveryLog : []))
    .sort((a, b) => new Date(b?.at || 0) - new Date(a?.at || 0));
}

function csvEscape(value) {
  const raw = String(value ?? "");
  if (/[",\n\r]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

function sendRecipientsCsv(res, filename, rows) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${filename.replace(/[^a-zA-Z0-9._-]+/g, "_")}"`
  );
  const header = ["telegram_id", "username"].map(csvEscape).join(",");
  const lines = rows.map(
    (row) => `${csvEscape(row.telegramId)},${csvEscape(row.username)}`
  );
  const body = [header, ...lines].join("\r\n");
  res.send(`\ufeff${body}\r\n`);
}

const AUTOMATION_STATUS_RANK = {
  running: 5,
  queued: 4,
  failed: 3,
  completed: 2,
  cancelled: 1,
};

function pickAutomationStatus(current, next) {
  const left = AUTOMATION_STATUS_RANK[String(current || "")] || 0;
  const right = AUTOMATION_STATUS_RANK[String(next || "")] || 0;
  return right > left ? next : current;
}

function newerTimestamp(left, right) {
  const a = left ? new Date(left).getTime() : NaN;
  const b = right ? new Date(right).getTime() : NaN;
  if (!Number.isFinite(a)) return right || null;
  if (!Number.isFinite(b)) return left || null;
  return b >= a ? right : left;
}

function olderTimestamp(left, right) {
  const a = left ? new Date(left).getTime() : NaN;
  const b = right ? new Date(right).getTime() : NaN;
  if (!Number.isFinite(a)) return right || null;
  if (!Number.isFinite(b)) return left || null;
  return b <= a ? right : left;
}

function mergeCampaignMetrics(target, row) {
  target.recipients += Number(row.recipients || 0);
  target.sent += Number(row.sent || 0);
  target.failed += Number(row.failed || 0);
  target.blocked += Number(row.blocked || 0);
  target.processed += Number(row.processed || 0);
  target.opened += Number(row.opened || 0);
  target.promoApplications += Number(row.promoApplications || 0);
  target.purchases += Number(row.purchases || 0);
  target.buyers += Number(row.buyers || 0);
  target.revenue += Number(row.revenue || 0);
  const base = Math.max(target.sent, target.recipients, 1);
  target.conversion = Number(((target.purchases / base) * 100).toFixed(1));
  target.notDelivered = Math.max(0, target.recipients - target.sent);
  target.status = pickAutomationStatus(target.status, row.status);
  target.startedAt = newerTimestamp(target.startedAt, row.startedAt);
  target.finishedAt = newerTimestamp(target.finishedAt, row.finishedAt);
  target.createdAt = newerTimestamp(target.createdAt, row.createdAt);
  target.firstAt = olderTimestamp(
    target.firstAt || target.startedAt || target.createdAt,
    row.startedAt || row.createdAt
  );
  if (!target.deliveryBotUsername && row.deliveryBotUsername) {
    target.deliveryBotUsername = row.deliveryBotUsername;
  }
}

function groupHistoryRows(rows) {
  // 1) Same trigger + day → one mailing row (as before).
  const dayRows = [];
  const dayGroups = new Map();

  for (const row of rows) {
    const bucket = row.source === "automation" ? automationBucket(row) : "";
    if (!bucket) {
      dayRows.push({ ...row, memberIds: [row.id] });
      continue;
    }

    const prev = dayGroups.get(bucket);
    if (!prev) {
      const trigger = automationTriggerKey(row);
      const next = {
        ...row,
        name: automationDisplayName(row),
        automationTrigger: trigger,
        memberIds: [row.id],
        firstAt: row.startedAt || row.createdAt || null,
      };
      dayGroups.set(bucket, next);
      dayRows.push(next);
      continue;
    }

    prev.memberIds.push(row.id);
    mergeCampaignMetrics(prev, row);
  }

  // 2) All days of one trigger → one parent row with expandable children.
  const out = [];
  const triggerGroups = new Map();

  for (const row of dayRows) {
    if (row.source !== "automation") {
      out.push(row);
      continue;
    }

    const trigger = automationTriggerKey(row);
    const key = `trigger:${trigger}`;
    const child = {
      ...row,
      name: automationDisplayName(row),
      isAutomationChild: true,
      automationTrigger: trigger,
    };
    const prev = triggerGroups.get(key);
    if (!prev) {
      const parent = {
        ...row,
        id: `auto-group:${encodeURIComponent(trigger)}`,
        name: automationDisplayName(row),
        automationTrigger: trigger,
        isAutomationGroup: true,
        runCount: 1,
        memberIds: [...(row.memberIds || [row.id])],
        children: [child],
        firstAt: row.firstAt || row.startedAt || row.createdAt || null,
      };
      triggerGroups.set(key, parent);
      out.push(parent);
      continue;
    }

    prev.children.push(child);
    prev.runCount = prev.children.length;
    prev.memberIds.push(...(row.memberIds || [row.id]));
    mergeCampaignMetrics(prev, row);
  }

  for (const parent of triggerGroups.values()) {
    parent.children.sort((a, b) => {
      const left = new Date(b.startedAt || b.createdAt || 0).getTime();
      const right = new Date(a.startedAt || a.createdAt || 0).getTime();
      return left - right;
    });
  }

  return out;
}

const router = express.Router();

router.get(
  "/push/campaigns",
  async (req, res) => {
    try {

        const range = getPeriodRange(
            req.query?.period || "month",
            req.query?.from || "",
            req.query?.to || ""
        );

      const limit =
        Math.min(
          1000,

          Math.max(
            1,

            Number(
              req.query?.limit ||
                500
            )
          )
        );

      const rows =
        await BroadcastCampaign
          .find({
            createdAt: {
              $gte:
                range.from,

              $lt:
                range.to,
            },
          })
          .sort({
            createdAt: -1,
          })
          .limit(limit)
          .lean();

        const analyticsByCampaign =
            await buildPushCampaignAnalytics(
                rows
            );

            const analyticsUpdates = [];

            for (const row of rows) {
            const id =
                String(
                row?._id || ""
                );

            const analytics =
                analyticsByCampaign.get(
                id
                ) || {
                purchases: 0,
                buyers: 0,
                revenue: 0,
                conversion: 0,
                opened: 0,
                promoApplications: 0,
                };

            const purchases =
                Number(
                analytics
                    .purchases || 0
                );

            const buyers =

                Number(

                    analytics.buyers || 0

                );

            const revenue =
                Number(
                analytics
                    .revenue || 0
                );

            const conversion =
                Number(
                analytics
                    .conversion || 0
                );

            const storedPurchases =
                Number(
                row
                    ?.purchases || 0
                );

                const storedBuyers =
                Number(
                    row?.buyers || 0
                );

            const storedRevenue =
                Number(
                row
                    ?.revenue || 0
                );

            const storedConversion =
                Number(
                row
                    ?.conversion || 0
                );

            row.purchases =
                purchases;

                row.buyers = buyers;

            row.revenue =
                revenue;

            row.conversion =
                conversion;

            row.opened = Math.max(
              Number(analytics.opened || 0),
              Number(row?.opened || 0),
              Array.isArray(row?.openedTelegramIds)
                ? row.openedTelegramIds.length
                : 0
            );

            row.promoApplications = Number(
              analytics.promoApplications || 0
            );

            row.promoCodes = Array.isArray(analytics.promoCodes)
              ? analytics.promoCodes
              : [];

            if (
                storedPurchases !==
                purchases ||
                storedBuyers !== buyers ||
                storedRevenue !==
                revenue ||
                storedConversion !==
                conversion
            ) {
                analyticsUpdates.push({
                updateOne: {
                    filter: {
                    _id:
                        row._id,
                    },

                    update: {
                    $set: {
                        purchases,
                        buyers,
                        revenue,
                        conversion,
                    },
                    },
                },
                });
            }
            }

            if (
            analyticsUpdates.length >
            0
            ) {
            BroadcastCampaign
                .bulkWrite(
                analyticsUpdates
                )
                .catch((error) => {
                console.error(
                    "CRM push analytics persist error:",
                    error
                );
                });
            }

      return res.json({
        ok: true,

        period: {
          key:
            range.key,

          from:
            range.from,

          to:
            range.to,
        },

        campaigns: groupHistoryRows(
          rows.map((row) => {
            const recipients = Number(row?.recipients || 0);
            const sent = Number(row?.sent || 0);
            return {
              id:
                String(
                  row?._id ||
                    ""
                ),

              name:
                String(
                  row?.name ||
                    "Рассылка"
                ),

              source: campaignSource(row),

              automation: campaignSource(row) === "automation",

              automationTrigger: String(row?.automationTrigger || "").trim(),

              automationDayKey: String(row?.automationDayKey || "").trim(),

              audience:
                String(
                  row?.audience ||
                    "all"
                ),

              status:
                String(
                  row?.status ||
                    "queued"
                ),

              recipients,

              processed:
                Number(
                  row?.processed ||
                    0
                ),

              sent,

              failed:
                Number(
                  row?.failed ||
                    0
                ),

              blocked:
                Number(
                  row?.blocked ||
                    0
                ),

              notDelivered: Math.max(0, recipients - sent),

              opened: Number(row?.opened || 0),

              promoApplications: Number(
                row?.promoApplications || 0
              ),

              promo:
                String(row?.message?.promo || "").trim() ||
                (Array.isArray(row?.promoCodes) && row.promoCodes[0]) ||
                "",

              purchases:
                Number(
                  row?.purchases ||
                    0
                ),

              buyers:

                  Number(

                      row?.buyers || 0

                  ),

              revenue:
                Number(
                  row?.revenue ||
                    0
                ),

              conversion:
                Number(
                  row?.conversion ||
                    0
                ),

              startedAt:
                row?.startedAt ||
                null,

              finishedAt:
                row?.finishedAt ||
                null,

              createdAt:
                row?.createdAt ||
                null,

              deliveryBotUsername: String(row?.deliveryBotUsername || "").trim(),

              lastErrors: Array.isArray(row?.lastErrors)
                ? row.lastErrors.slice(-10)
                : [],

              deliveryLogCount: Array.isArray(row?.deliveryLog)
                ? row.deliveryLog.length
                : 0,
            };
          })
        ),
      });
    } catch (error) {
      console.error(
        "CRM push campaigns error:",
        error
      );

      return res
        .status(500)
        .json({
          ok: false,

          error:
            error?.message ||
            "CRM_PUSH_CAMPAIGNS_FAILED",
        });
    }
  }
);

router.get(
  "/push/campaigns/:id",
  requireCrmPushAdmin,
  async (req, res) => {
    try {
      const id = String(req.params?.id || "").trim();
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          ok: false,
          error: "CAMPAIGN_ID_REQUIRED",
        });
      }

      const row = await BroadcastCampaign.findById(id).lean();
      if (!row) {
        return res.status(404).json({
          ok: false,
          error: "CAMPAIGN_NOT_FOUND",
        });
      }

      const members = await resolveCampaignMembers(row);
      const fullDeliveryLog = mergeDeliveryLogs(members);
      const deliveryLog = fullDeliveryLog.slice(0, 500);
      const sum = (field) =>
        members.reduce((total, item) => total + Number(item?.[field] || 0), 0);

      const recipientTelegramIds = [
        ...new Set(
          members
            .flatMap((item) => item.recipientTelegramIds || [])
            .map((value) => String(value || "").trim())
            .filter(Boolean)
        ),
      ];
      const sentTelegramIds = new Set(
        members
          .flatMap((item) => item.sentTelegramIds || [])
          .map((value) => String(value || "").trim())
          .filter(Boolean)
      );
      const recipientsTotal = sum("recipients");
      const sentTotal = sum("sent");
      const notDeliveredCount = Math.max(0, recipientsTotal - sentTotal);

      return res.json({
        ok: true,
        campaign: {
          id: String(row._id),
          name: autoTitle(row.name) || String(row.name || "Рассылка"),
          source: campaignSource(row),
          status: String(row.status || "queued"),
          audience: String(row.audience || "all"),
          filters: row.filters || {},
          message: row.message || {},
          recipients: recipientsTotal,
          processed: sum("processed"),
          sent: sentTotal,
          failed: sum("failed"),
          blocked: sum("blocked"),
          notDelivered: notDeliveredCount,
          deliveryLogTruncated: fullDeliveryLog.length > 500,
          deliveryBotUsername: String(
            members.find((item) => item.deliveryBotUsername)?.deliveryBotUsername || ""
          ).trim(),
          recipientTelegramIds,
          sentTelegramIds: [...sentTelegramIds],
          lastErrors: members
            .flatMap((item) => item.lastErrors || [])
            .slice(-20),
          deliveryLog,
          startedAt: row.startedAt || null,
          finishedAt: row.finishedAt || null,
          createdAt: row.createdAt || null,
        },
      });
    } catch (error) {
      console.error("GET /crm/push/campaigns/:id error:", error);
      return res.status(500).json({
        ok: false,
        error: "CRM_PUSH_CAMPAIGN_LOAD_FAILED",
      });
    }
  }
);

router.get(
  "/push/campaigns/:id/export",
  requireCrmPushAdmin,
  async (req, res) => {
    try {
      const id = String(req.params?.id || "").trim();
      const kind = String(req.query?.kind || "ok").trim().toLowerCase();
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          ok: false,
          error: "CAMPAIGN_ID_REQUIRED",
        });
      }
      if (kind !== "ok" && kind !== "failed") {
        return res.status(400).json({
          ok: false,
          error: "EXPORT_KIND_INVALID",
        });
      }

      const row = await BroadcastCampaign.findById(id).lean();
      if (!row) {
        return res.status(404).json({
          ok: false,
          error: "CAMPAIGN_NOT_FOUND",
        });
      }

      const members = await resolveCampaignMembers(row);
      const fullDeliveryLog = mergeDeliveryLogs(members);

      const recipientTelegramIds = [
        ...new Set(
          members
            .flatMap((item) => item.recipientTelegramIds || [])
            .map((value) => String(value || "").trim())
            .filter(Boolean)
        ),
      ];
      const sentTelegramIds = new Set(
        members
          .flatMap((item) => item.sentTelegramIds || [])
          .map((value) => String(value || "").trim())
          .filter(Boolean)
      );

      let targetIds = [];
      if (kind === "ok") {
        targetIds = [...sentTelegramIds];
      } else {
        const failed = new Set();
        for (const rid of recipientTelegramIds) {
          if (!sentTelegramIds.has(rid)) {
            failed.add(rid);
          }
        }
        if (!failed.size && fullDeliveryLog.length) {
          for (const entry of fullDeliveryLog) {
            if (entry && entry.ok === false) {
              const tid = String(entry.telegramId || "").trim();
              if (tid) failed.add(tid);
            }
          }
        }
        targetIds = [...failed];
      }

      const usernameById = new Map();
      if (targetIds.length > 0) {
        const profiles = await User.find({
          telegramId: { $in: targetIds },
        })
          .select({ telegramId: 1, username: 1 })
          .lean();
        for (const profile of profiles) {
          const tid = String(profile?.telegramId || "").trim();
          if (!tid) continue;
          usernameById.set(
            tid,
            String(profile?.username || "").trim()
          );
        }
      }

      const rows = targetIds.map((telegramId) => ({
        telegramId,
        username: usernameById.get(telegramId) || "",
      }));

      const safeName =
        String(row?.name || "campaign")
          .replace(/[^\w\-\u0400-\u04FF]+/g, "_")
          .slice(0, 60) || "campaign";
      const filename =
        kind === "ok"
          ? `push_${safeName}_${id}_ok.csv`
          : `push_${safeName}_${id}_not_delivered.csv`;

      return sendRecipientsCsv(res, filename, rows);
    } catch (error) {
      console.error("GET /crm/push/campaigns/:id/export error:", error);
      return res.status(500).json({
        ok: false,
        error: "CRM_PUSH_CAMPAIGN_EXPORT_FAILED",
      });
    }
  }
);

router.delete(
  "/push/campaigns/:id",
  requireCrmPushAdmin,
  async (req, res) => {
    try {
      const id = String(req.params?.id || "").trim();
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          ok: false,
          error: "CAMPAIGN_ID_REQUIRED",
        });
      }

      const campaign = await BroadcastCampaign.findById(id)
        .select({ status: 1 })
        .lean();

      if (!campaign) {
        return res.status(404).json({
          ok: false,
          error: "CAMPAIGN_NOT_FOUND",
        });
      }

      if (campaign.status === "running" || campaign.status === "queued") {
        return res.status(409).json({
          ok: false,
          error: "CAMPAIGN_STILL_RUNNING",
        });
      }

      await BroadcastCampaign.deleteOne({ _id: campaign._id });

      return res.json({ ok: true, id });
    } catch (error) {
      console.error("DELETE /crm/push/campaigns/:id error:", error);
      return res.status(500).json({
        ok: false,
        error: "CRM_PUSH_CAMPAIGN_DELETE_FAILED",
      });
    }
  }
);

router.delete(
  "/push/campaigns",
  requireCrmPushAdmin,
  async (req, res) => {
    try {
      const range = getPeriodRange(
        req.query?.period || "all",
        req.query?.from || "",
        req.query?.to || ""
      );

      const filter =
        range.key === "all"
          ? {}
          : {
              createdAt: {
                $gte: range.from,
                $lt: range.to,
              },
            };

      const result = await BroadcastCampaign.deleteMany(filter);

      return res.json({
        ok: true,
        deletedCount: Number(result?.deletedCount || 0),
      });
    } catch (error) {
      console.error("DELETE /crm/push/campaigns error:", error);
      return res.status(500).json({
        ok: false,
        error: "CRM_PUSH_CAMPAIGNS_CLEAR_FAILED",
      });
    }
  }
);

export default router;
