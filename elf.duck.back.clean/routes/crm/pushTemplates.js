import express from "express";
import {
  buildPushCampaignAnalytics,
  BROADCAST_TEMPLATES_COLLECTION,
  requireCrmPushAdmin,
  normalizePushString,
  mongoose,
  BroadcastCampaign,
} from "./deps.js";

const router = express.Router();

/*
 * Реальные шаблоны.
 */
router.get(
  "/push/templates",

  async (
    req,
    res
  ) => {
    try {
      const templates =
        await mongoose
          .connection
          .collection(
            BROADCAST_TEMPLATES_COLLECTION
          )
          .find({})
          .sort({
            isDefault: -1,
            createdAt: -1,
          })
          .toArray();

    const templateIds =
  templates
    .map(
      (template) =>
        template?._id
    )
    .filter(Boolean);

const templateCampaigns =
  templateIds.length > 0
    ? await BroadcastCampaign.find({
        templateId: {
          $in: templateIds,
        },
      })
        .select({
          _id: 1,
          templateId: 1,
          sent: 1,
          startedAt: 1,
          createdAt: 1,
        })
        .lean()
    : [];

const campaignAnalytics =
  await buildPushCampaignAnalytics(
    templateCampaigns
  );

const templateStats =
  new Map();

for (
  const campaign of
  templateCampaigns
) {
  const templateId =
    String(
      campaign?.templateId || ""
    );

  if (!templateId) {
    continue;
  }

  if (
    !templateStats.has(
      templateId
    )
  ) {
    templateStats.set(
      templateId,
      {
        sent: 0,
        buyers: 0,
      }
    );
  }

  const stats =
    templateStats.get(
      templateId
    );

  const analytics =
    campaignAnalytics.get(
      String(
        campaign?._id || ""
      )
    );

  stats.sent +=
    Number(
      campaign?.sent || 0
    );

  stats.buyers +=
    Number(
      analytics?.buyers || 0
    );
}

      return res.json({
        ok: true,

        templates:
          templates.map(
            (
              template
            ) => ({
              id: String(
                template?._id ||
                  ""
              ),

              name: String(
                template?.title ||
                  "Без названия"
              ),

              preview:
                String(
                  template?.text ||
                    ""
                ),

              title: String(
                template?.title ||
                  ""
              ),

              text: String(
                template?.text ||
                  ""
              ),

              photoUrl:
                String(
                  template
                    ?.photoUrl ||
                    ""
                ),

                photoFileId:
  String(
    template?.photoFileId ||
      ""
  ),

  photoPreviewUrl:

  String(

    template?.photoPreviewUrl ||

      ""

  ),

              buttonText:
                String(
                  template
                    ?.buttonText ||
                    ""
                ),

              buttonUrl:
                String(
                  template
                    ?.buttonUrl ||
                    ""
                ),

              isDefault:
                template
                  ?.isDefault ===
                true,

              used: Number(
                template?.used ||
                  0
              ),

            conversion: (() => {
            const stats =
                templateStats.get(
                String(
                    template?._id || ""
                )
                ) || {
                sent: 0,
                buyers: 0,
                };

            return stats.sent > 0
                ? Number(
                    (
                    (
                        stats.buyers /
                        stats.sent
                    ) *
                    100
                    ).toFixed(1)
                )
                : 0;
            })(),

              lastUsed:
                template
                  ?.lastUsed ||
                null,

              createdAt:
                template
                  ?.createdAt ||
                null,
            })
          ),
      });
    } catch (error) {
      console.error(
        "GET /crm/push/templates error:",
        error
      );

      return res
        .status(500)
        .json({
          ok: false,
          error:
            "PUSH_TEMPLATES_LOAD_FAILED",
        });
    }
  }
);

/*
 * Создание шаблона.
 */
router.post(

  "/push/templates",

  requireCrmPushAdmin,

  async (
    req,
    res
  ) => {
    try {
      const title =
        String(
          req.body?.title ||
            ""
        ).trim();

      const text =
        String(
          req.body?.text ||
            ""
        ).trim();

      const photoUrl =
        String(
          req.body
            ?.photoUrl ||
            ""
        ).trim();

//         const photoFileId =

//   normalizePushString(

//     req.body?.photoFileId

//   );

         const photoFileId =
        String(
          req.body
            ?.photoFileId ||
            ""
        ).trim();

        const photoPreviewUrl =
  String(
    req.body
      ?.photoPreviewUrl ||
      ""
  ).trim();

      const buttonText =
        String(
          req.body
            ?.buttonText ||
            ""
        ).trim();

      const buttonUrl =
        String(
          req.body
            ?.buttonUrl ||
            ""
        ).trim();

      if (!title) {
        return res
          .status(400)
          .json({
            ok: false,

            error:
              "TEMPLATE_TITLE_REQUIRED",
          });
      }

      if (!text) {
        return res
          .status(400)
          .json({
            ok: false,

            error:
              "TEMPLATE_TEXT_REQUIRED",
          });
      }

      const result =
        await mongoose
          .connection
          .collection(
            BROADCAST_TEMPLATES_COLLECTION
          )
          .insertOne({
            title,
            text,
            photoUrl,
            photoFileId,
            photoPreviewUrl,
            buttonText,
            buttonUrl,

            isDefault:
              false,

            used: 0,

            conversion: 0,

            lastUsed:
              null,

            createdAt:
              new Date(),

            updatedAt:
              new Date(),
          });

      return res.json({
        ok: true,

        id:
          String(
            result.insertedId
          ),
      });
    } catch (error) {
      console.error(
        "POST /crm/push/templates error:",
        error
      );

      if (
        Number(
          error?.code || 0
        ) === 11000
      ) {
        return res
          .status(409)
          .json({
            ok: false,

            error:
              "TEMPLATE_ALREADY_EXISTS",
          });
      }

      return res
        .status(500)
        .json({
          ok: false,

          error:
            "PUSH_TEMPLATE_SAVE_FAILED",
        });
    }
  }
);

router.delete(
  "/push/templates/:id",
  requireCrmPushAdmin,
  async (req, res) => {
    try {
      const id = String(
        req.params?.id || ""
      ).trim();

      if (!id) {
        return res.status(400).json({
          ok: false,
          error: "TEMPLATE_ID_REQUIRED",
        });
      }

      const collection =
        mongoose.connection.collection(
          BROADCAST_TEMPLATES_COLLECTION
        );

      let result = null;

      if (
        mongoose.Types.ObjectId.isValid(id)
      ) {
        result =
          await collection.deleteOne({
            _id:
              new mongoose.Types.ObjectId(
                id
              ),
          });
      }

      if (!result?.deletedCount) {
        result =
          await collection.deleteOne({
            id,
          });
      }

      if (!result?.deletedCount) {
        return res.status(404).json({
          ok: false,
          error: "TEMPLATE_NOT_FOUND",
        });
      }

      return res.json({
        ok: true,
        id,
      });
    } catch (error) {
      console.error(
        "DELETE /crm/push/templates/:id error:",
        error
      );

      return res.status(500).json({
        ok: false,
        error: "TEMPLATE_DELETE_FAILED",
      });
    }
  }
);

export default router;
