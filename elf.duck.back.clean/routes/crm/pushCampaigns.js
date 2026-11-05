import express from "express";
import mongoose from "mongoose";
import {
  buildPushCampaignAnalytics,
  getPeriodRange,
  BroadcastCampaign,
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
  const trigger =
    String(row?.automationTrigger || "").trim() || autoTitle(row?.name);
  return `${trigger}|${day}`;
}

function groupHistoryRows(rows) {
  const out = [];
  const groups = new Map();

  for (const row of rows) {
    const bucket = row.source === "automation" ? automationBucket(row) : "";
    if (!bucket) {
      out.push({ ...row, memberIds: [row.id] });
      continue;
    }

    const prev = groups.get(bucket);
    if (!prev) {
      const next = {
        ...row,
        name: autoTitle(row.name),
        memberIds: [row.id],
      };
      groups.set(bucket, next);
      out.push(next);
      continue;
    }

    prev.memberIds.push(row.id);
    prev.recipients += Number(row.recipients || 0);
    prev.sent += Number(row.sent || 0);
    prev.failed += Number(row.failed || 0);
    prev.blocked += Number(row.blocked || 0);
    prev.processed += Number(row.processed || 0);
    prev.opened += Number(row.opened || 0);
    prev.promoApplications += Number(row.promoApplications || 0);
    prev.purchases += Number(row.purchases || 0);
    prev.buyers += Number(row.buyers || 0);
    prev.revenue += Number(row.revenue || 0);
    const base = Math.max(prev.sent, prev.recipients, 1);
    prev.conversion = Number(((prev.purchases / base) * 100).toFixed(1));
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
          rows.map((row) => ({
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

            recipients:
              Number(
                row?.recipients ||
                  0
              ),

            processed:
              Number(
                row?.processed ||
                  0
              ),

            sent:
              Number(
                row?.sent ||
                  0
              ),

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
          }))
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

      let members = [row];
      if (campaignSource(row) === "automation") {
        const dayKey =
          String(row.automationDayKey || "").trim() ||
          getWarsawDateKey(row.createdAt || row.startedAt || new Date());
        const range = warsawDayRange(dayKey);
        const title = autoTitle(row.name);
        if (range && title) {
          members = await BroadcastCampaign.find({
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
          if (!members.length) members = [row];
        }
      }

      const deliveryLog = members
        .flatMap((item) => (Array.isArray(item.deliveryLog) ? item.deliveryLog : []))
        .sort((a, b) => new Date(b?.at || 0) - new Date(a?.at || 0))
        .slice(0, 500);
      const sum = (field) =>
        members.reduce((total, item) => total + Number(item?.[field] || 0), 0);

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
          recipients: sum("recipients"),
          processed: sum("processed"),
          sent: sum("sent"),
          failed: sum("failed"),
          blocked: sum("blocked"),
          deliveryBotUsername: String(
            members.find((item) => item.deliveryBotUsername)?.deliveryBotUsername || ""
          ).trim(),
          recipientTelegramIds: members.flatMap((item) => item.recipientTelegramIds || []),
          sentTelegramIds: members.flatMap((item) => item.sentTelegramIds || []),
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
