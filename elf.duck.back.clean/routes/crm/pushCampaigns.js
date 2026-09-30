import express from "express";
import {
  buildPushCampaignAnalytics,
  getPeriodRange,
  BroadcastCampaign,
} from "./deps.js";

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
          200,

          Math.max(
            1,

            Number(
              req.query?.limit ||
                100
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

        campaigns:
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
          })),
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

export default router;
