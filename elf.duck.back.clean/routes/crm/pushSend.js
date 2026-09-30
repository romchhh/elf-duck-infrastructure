import express from "express";
import {
  BROADCAST_TEMPLATES_COLLECTION,
  requireCrmPushAdmin,
  getPeriodRange,
  normalizePushString,
  mongoose,
  BroadcastCampaign,
  buildPushAudiencePreview,
} from "./deps.js";

const router = express.Router();

/*
 * Реальный подсчёт
 * аудитории.
 */
router.post(
  "/push/audience-preview",

  async (
    req,
    res
  ) => {
    try {
      const range =
        getPeriodRange(
          req.body?.period ||
            "month",

          req.body?.from ||
            "",

          req.body?.to ||
            ""
        );

      const preview =
        await buildPushAudiencePreview({
          range,
        //   includeTelegramIds: true,

          audience:
            req.body
              ?.audience ||
            "all",

          statuses:
            req.body
              ?.statuses ||
            [],

          categoryKeys:
            req.body
              ?.categoryKeys ||
            [],

          locationKeys:
            req.body
              ?.locationKeys ||
            [],

          minCheck:
            req.body
              ?.minCheck ||
            0,

          minCashback:
            req.body
              ?.minCashback ||
            0,

          favProduct:
            req.body
              ?.favProduct ||
            "",

          telegram:
            req.body
              ?.telegram ||
            "",

          cashbackExpiringSoon: Boolean(
            req.body?.cashbackExpiringSoon
          ),
        });

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

        ...preview,
      });
    } catch (error) {
      console.error(
        "POST /crm/push/audience-preview error:",
        error
      );

      if (
        String(
          error?.message ||
            ""
        ) ===
        "INVALID_CUSTOM_PERIOD"
      ) {
        return res
          .status(400)
          .json({
            ok: false,

            error:
              "INVALID_CUSTOM_PERIOD",
          });
      }

      return res
        .status(500)
        .json({
          ok: false,

          error:
            "PUSH_AUDIENCE_PREVIEW_FAILED",
        });
    }
  }
);

router.post(
  "/push/send",
  requireCrmPushAdmin,
  async (req, res) => {
    try {
      const body = req.body || {};

        const range = getPeriodRange(
            body?.period || "month",
            body?.from || "",
            body?.to || ""
        );

      const title =
        normalizePushString(
          body?.title
        );

      const text =
        normalizePushString(
          body?.text
        );

      const promo =
        normalizePushString(
          body?.promo
        );

      const photoUrl =
        normalizePushString(
          body?.photoUrl
        );

        const photoFileId =
  normalizePushString(
    body?.photoFileId
  );
        

      const buttonText =
        normalizePushString(
          body?.buttonText
        );

      const buttonUrl =
        normalizePushString(
          body?.buttonUrl
        );

      if (!title && !text && !promo) {
        return res.status(400).json({
          ok: false,
          error: "MESSAGE_REQUIRED",
        });
      }

      if (
        (buttonText && !buttonUrl) ||
        (!buttonText && buttonUrl)
      ) {
        return res.status(400).json({
          ok: false,
          error:
            "BUTTON_TEXT_AND_URL_REQUIRED_TOGETHER",
        });
      }

      if (buttonUrl) {
        let parsedButtonUrl;

        try {
          parsedButtonUrl =
            new URL(buttonUrl);
        } catch {
          return res
            .status(400)
            .json({
              ok: false,
              error:
                "INVALID_BUTTON_URL",
            });
        }

        if (
          ![
            "http:",
            "https:",
            "tg:",
          ].includes(
            parsedButtonUrl.protocol
          )
        ) {
          return res
            .status(400)
            .json({
              ok: false,
              error:
                "INVALID_BUTTON_URL_PROTOCOL",
            });
        }
      }

        const audienceResult =
        await buildPushAudiencePreview({
            range,

            includeTelegramIds: true,

            audience:
            body?.audience ||
            "all",

          statuses:
            body?.statuses || [],

          categoryKeys:
            body?.categoryKeys ||
            [],

          locationKeys:
            body?.locationKeys ||
            [],

          minCheck:
            body?.minCheck || 0,

          minCashback:
            body?.minCashback || 0,

          favProduct:
            body?.favProduct || "",

          telegram:
            body?.telegram || "",

          cashbackExpiringSoon: Boolean(
            body?.cashbackExpiringSoon
          ),
        });

      const telegramIds =
        Array.from(
          new Set(
            (
              Array.isArray(
                audienceResult
                  ?.telegramIds
              )
                ? audienceResult
                    .telegramIds
                : []
            )
              .map((value) =>
                String(
                  value || ""
                ).trim()
              )
              .filter(Boolean)
          )
        );

      if (!telegramIds.length) {
        return res.status(400).json({
          ok: false,
          error: "AUDIENCE_EMPTY",
        });
      }

      const runCampaign =
        req.app?.locals
          ?.runCrmBroadcastCampaign;

      if (
        typeof runCampaign !==
        "function"
      ) {
        return res.status(503).json({
          ok: false,
          error:
            "CRM_BROADCAST_ENGINE_UNAVAILABLE",
        });
      }

      const campaign =
        await BroadcastCampaign
          .create({
            name:
              normalizePushString(
                body?.name
              ) ||
              title ||
              "Рассылка",

            audience:
              String(
                body?.audience ||
                  "all"
              )
                .trim()
                .toLowerCase(),

            filters: {
              statuses:
                Array.isArray(
                  body?.statuses
                )
                  ? body.statuses
                  : [],

              categoryKeys:
                Array.isArray(
                  body?.categoryKeys
                )
                  ? body
                      .categoryKeys
                  : [],

              locationKeys:
                Array.isArray(
                  body?.locationKeys
                )
                  ? body
                      .locationKeys
                  : [],

              minCheck:
                Math.max(
                  0,
                  Number(
                    body
                      ?.minCheck || 0
                  )
                ),

              minCashback:
                Math.max(
                  0,
                  Number(
                    body
                      ?.minCashback ||
                      0
                  )
                ),

              favProduct:
                normalizePushString(
                  body?.favProduct
                ),

              telegram:
                normalizePushString(
                  body?.telegram
                ),
            },

            message: {
              title,
              text,
              promo,
              photoUrl,
              photoFileId,
              buttonText,
              buttonUrl,
            },

            templateId:
              mongoose
                .isValidObjectId(
                  body?.templateId
                )
                ? body.templateId
                : null,

            status: "queued",

            recipients:
              telegramIds.length,

            recipientTelegramIds:
              telegramIds,

            processed: 0,
            sent: 0,
            failed: 0,
            blocked: 0,

            purchases: 0,
            revenue: 0,
            conversion: 0,
          });

      try {
        await runCampaign({
          campaignId:
            String(
              campaign._id
            ),

          telegramIds,

          message: {
            title,
            text,
            promo,
            photoUrl,
            photoFileId,
            buttonText,
            buttonUrl,
          },
        });

        if (
            campaign.templateId &&
            mongoose.isValidObjectId(
                campaign.templateId
            )
            ) {
            await mongoose.connection
                .collection(
                BROADCAST_TEMPLATES_COLLECTION
                )
                .updateOne(
                {
                    _id:
                    new mongoose
                        .Types
                        .ObjectId(
                        campaign
                            .templateId
                        ),
                },

                {
                    $inc: {
                    used: 1,
                    },

                    $set: {
                    lastUsed:
                        new Date(),

                    updatedAt:
                        new Date(),
                    },
                }
                );
            }
      } catch (error) {
        await BroadcastCampaign
          .updateOne(
            {
              _id:
                campaign._id,
            },
            {
              $set: {
                status:
                  "failed",

                finishedAt:
                  new Date(),

                lastErrors: [
                  String(
                    error?.message ||
                      error ||
                      "BROADCAST_START_FAILED"
                  ),
                ],
              },
            }
          );

        throw error;
      }

      return res
        .status(202)
        .json({
          ok: true,

          campaign: {
            id: String(
              campaign._id
            ),

            name:
              campaign.name,

            status:
              "running",

            recipients:
              telegramIds.length,

            createdAt:
              campaign.createdAt,
          },
        });
    } catch (error) {
      console.error(
        "CRM push send error:",
        error
      );

      return res
        .status(500)
        .json({
          ok: false,

          error:
            error?.message ||
            "CRM_PUSH_SEND_FAILED",
        });
    }
  }
);

export default router;
