import express from "express";
import {
  percentChange,
  getPeriodRange,
  getCompletedOrderMatch,
  getSaleDateExpression,
  Order,
  User,
} from "./deps.js";

const router = express.Router();

router.get(
  "/partners",
  async (req, res) => {
    try {
      const range =
        getPeriodRange(
          req.query?.period ||
            "month",

          req.query?.from || "",

          req.query?.to || ""
        );

      const page =
        Math.max(
          1,
          Number.parseInt(
            req.query?.page,
            10
          ) || 1
        );

      const limit =
        Math.min(
          100,
          Math.max(
            1,
            Number.parseInt(
              req.query?.limit,
              10
            ) || 25
          )
        );

      const search =
        String(
          req.query?.search || ""
        )
          .trim()
          .toLowerCase();

      const partners =
        await User.find({
          "referral.code": {
            $type: "string",
            $ne: "",
          },
        })
          .select({
            telegramId: 1,
            username: 1,
            firstName: 1,
            lastName: 1,
            "referral.code": 1,
          })
          .lean();

      const partnerTelegramIds =
        partners
          .map((partner) =>
            String(
              partner?.telegramId ||
                ""
            ).trim()
          )
          .filter(Boolean);

      /*
       * Приглашённые пользователи
       * текущего периода.
       */
      const currentInvited =
        partnerTelegramIds.length
          ? await User.find({
              "referral.invitedByTelegramId": {
                $in:
                  partnerTelegramIds,
              },

              createdAt: {
                $gte:
                  range.from,
                $lt:
                  range.to,
              },
            })
              .select({
                telegramId: 1,
                createdAt: 1,
                "referral.invitedByTelegramId": 1,
              })
              .lean()
          : [];

      /*
       * Приглашённые предыдущего
       * периода — для тренда.
       */
      const previousInvited =
        range.previousFrom &&
        range.previousTo &&
        partnerTelegramIds.length
          ? await User.find({
              "referral.invitedByTelegramId": {
                $in:
                  partnerTelegramIds,
              },

              createdAt: {
                $gte:
                  range.previousFrom,

                $lt:
                  range.previousTo,
              },
            })
              .select({
                telegramId: 1,
                "referral.invitedByTelegramId": 1,
              })
              .lean()
          : [];

      const currentInvitedIds =
        currentInvited
          .map((user) =>
            String(
              user?.telegramId ||
                ""
            ).trim()
          )
          .filter(Boolean);

      const previousInvitedIds =
        previousInvited
          .map((user) =>
            String(
              user?.telegramId ||
                ""
            ).trim()
          )
          .filter(Boolean);

      /*
       * Продажи текущего периода.
       */
      const currentSales =
        currentInvitedIds.length
          ? await Order.aggregate([
              {
                $match: {
                  ...getCompletedOrderMatch(),

                  userTelegramId: {
                    $in:
                      currentInvitedIds,
                  },
                },
              },

              {
                $addFields: {
                  crmSaleDate:
                    getSaleDateExpression(),
                },
              },

              {
                $match: {
                  crmSaleDate: {
                    $gte:
                      range.from,

                    $lt:
                      range.to,
                  },
                },
              },

              {
                $project: {
                  userTelegramId: 1,
                  totalZl: 1,
                  crmSaleDate: 1,
                },
              },
            ])
          : [];

      /*
       * Все продажи текущих
       * приглашённых до конца периода.
       *
       * Нужны для LTV.
       */
      const lifetimeSales =
        currentInvitedIds.length
          ? await Order.aggregate([
              {
                $match: {
                  ...getCompletedOrderMatch(),

                  userTelegramId: {
                    $in:
                      currentInvitedIds,
                  },
                },
              },

              {
                $addFields: {
                  crmSaleDate:
                    getSaleDateExpression(),
                },
              },

              {
                $match: {
                  crmSaleDate: {
                    $lt:
                      range.to,
                  },
                },
              },

              {
                $project: {
                  userTelegramId: 1,
                  totalZl: 1,
                  crmSaleDate: 1,
                },
              },
            ])
          : [];

      /*
       * Предыдущий период
       * нужен только для тренда.
       */
      const previousSales =
        range.previousFrom &&
        range.previousTo &&
        previousInvitedIds.length
          ? await Order.aggregate([
              {
                $match: {
                  ...getCompletedOrderMatch(),

                  userTelegramId: {
                    $in:
                      previousInvitedIds,
                  },
                },
              },

              {
                $addFields: {
                  crmSaleDate:
                    getSaleDateExpression(),
                },
              },

              {
                $match: {
                  crmSaleDate: {
                    $gte:
                      range.previousFrom,

                    $lt:
                      range.previousTo,
                  },
                },
              },

              {
                $project: {
                  userTelegramId: 1,
                  totalZl: 1,
                },
              },
            ])
          : [];

      /*
       * user -> partner
       */
      const currentPartnerByUser =
        new Map();

      for (
        const user of currentInvited
      ) {
        const telegramId =
          String(
            user?.telegramId ||
              ""
          ).trim();

        const partnerId =
          String(
            user?.referral
              ?.invitedByTelegramId ||
              ""
          ).trim();

        if (
          telegramId &&
          partnerId
        ) {
          currentPartnerByUser.set(
            telegramId,
            partnerId
          );
        }
      }

      const previousPartnerByUser =
        new Map();

      for (
        const user of previousInvited
      ) {
        const telegramId =
          String(
            user?.telegramId ||
              ""
          ).trim();

        const partnerId =
          String(
            user?.referral
              ?.invitedByTelegramId ||
              ""
          ).trim();

        if (
          telegramId &&
          partnerId
        ) {
          previousPartnerByUser.set(
            telegramId,
            partnerId
          );
        }
      }

      /*
       * partner -> stats
       */
      const stats =
        new Map();

      for (
        const partner of partners
      ) {
        const telegramId =
          String(
            partner?.telegramId ||
              ""
          ).trim();

        if (!telegramId) {
          continue;
        }

        stats.set(
          telegramId,
          {
            invited:
              new Set(),

            buyers:
              new Set(),

            orders:
              0,

            revenue:
              0,

            ltv:
              0,

            previousRevenue:
              0,
          }
        );
      }

      /*
       * Приглашённые.
       */
      for (
        const user of currentInvited
      ) {
        const userId =
          String(
            user?.telegramId ||
              ""
          ).trim();

        const partnerId =
          String(
            user?.referral
              ?.invitedByTelegramId ||
              ""
          ).trim();

        stats
          .get(partnerId)
          ?.invited.add(
            userId
          );
      }

      /*
       * Продажи периода.
       */
      for (
        const order of currentSales
      ) {
        const buyerId =
          String(
            order?.userTelegramId ||
              ""
          ).trim();

        const partnerId =
          currentPartnerByUser.get(
            buyerId
          );

        if (!partnerId) {
          continue;
        }

        const row =
          stats.get(
            partnerId
          );

        if (!row) {
          continue;
        }

        row.buyers.add(
          buyerId
        );

        row.orders += 1;

        row.revenue +=
          Number(
            order?.totalZl ||
              0
          );
      }

      /*
       * Lifetime revenue.
       */
      for (
        const order of lifetimeSales
      ) {
        const buyerId =
          String(
            order?.userTelegramId ||
              ""
          ).trim();

        const partnerId =
          currentPartnerByUser.get(
            buyerId
          );

        if (!partnerId) {
          continue;
        }

        const row =
          stats.get(
            partnerId
          );

        if (!row) {
          continue;
        }

        row.ltv +=
          Number(
            order?.totalZl ||
              0
          );
      }

      /*
       * Предыдущая выручка.
       */
      for (
        const order of previousSales
      ) {
        const buyerId =
          String(
            order?.userTelegramId ||
              ""
          ).trim();

        const partnerId =
          previousPartnerByUser.get(
            buyerId
          );

        if (!partnerId) {
          continue;
        }

        const row =
          stats.get(
            partnerId
          );

        if (!row) {
          continue;
        }

        row.previousRevenue +=
          Number(
            order?.totalZl ||
              0
          );
      }

      let rows =
        partners.map(
          (partner) => {
            const telegramId =
              String(
                partner?.telegramId ||
                  ""
              ).trim();

            const stat =
              stats.get(
                telegramId
              ) || {
                invited:
                  new Set(),

                buyers:
                  new Set(),

                orders:
                  0,

                revenue:
                  0,

                ltv:
                  0,

                previousRevenue:
                  0,
              };

            const invited =
              stat.invited.size;

            const bought =
              stat.buyers.size;

            const revenue =
              Number(
                Number(
                  stat.revenue ||
                    0
                ).toFixed(2)
              );

            const previousRevenue =
              Number(
                Number(
                  stat.previousRevenue ||
                    0
                ).toFixed(2)
              );

            const ltv =
              Number(
                Number(
                  stat.ltv ||
                    0
                ).toFixed(2)
              );

            const conversion =
              invited > 0
                ? Number(
                    (
                      (
                        bought /
                        invited
                      ) *
                      100
                    ).toFixed(1)
                  )
                : 0;

            const avgCheck =
              stat.orders > 0
                ? Number(
                    (
                      revenue /
                      stat.orders
                    ).toFixed(2)
                  )
                : 0;

            const username =
              String(
                partner
                  ?.username ||
                  ""
              )
                .trim()
                .replace(
                  /^@+/,
                  ""
                );

            const fullName =
              [
                partner
                  ?.firstName ||
                  "",

                partner
                  ?.lastName ||
                  "",
              ]
                .filter(Boolean)
                .join(" ")
                .trim();

            const name =
              fullName ||
              (
                username
                  ? `@${username}`
                  : telegramId
              );

            return {
              id:
                String(
                  partner?._id ||
                    telegramId
                ),

              telegramId,

              name,

              username,

              handle:
                username
                  ? `@${username}`
                  : telegramId,

              invited,

              bought,

              conversion,

              revenue,

              avgCheck,

              ltv,

              trend:
                range.previousFrom &&
                range.previousTo
                  ? percentChange(
                      revenue,
                      previousRevenue
                    )
                  : null,
            };
          }
        );

      /*
       * На странице нет смысла
       * показывать пользователей,
       * которые создали referral.code,
       * но вообще никого не привели.
       */
      rows =
        rows.filter(
          (row) =>
            row.invited > 0
        );

      /*
       * KPI считаем без поиска.
       */
      const totalPartners =
        rows.length;

      if (search) {
        rows =
          rows.filter(
            (row) => {
              const haystack =
                [
                  row.name,
                  row.username,
                  row.handle,
                  row.telegramId,
                ]
                  .join(" ")
                  .toLowerCase();

              return (
                haystack.includes(
                  search
                )
              );
            }
          );
      }

      rows.sort(
        (a, b) =>
          b.revenue -
          a.revenue
      );

      const total =
        rows.length;

      const pageCount =
        Math.max(
          1,
          Math.ceil(
            total /
              limit
          )
        );

      const safePage =
        Math.min(
          page,
          pageCount
        );

      const start =
        (
          safePage -
          1
        ) * limit;

      const pageRows =
        rows.slice(
          start,
          start + limit
        );

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

        summary: {
          totalPartners,
        },

        rows:
          pageRows,

        pagination: {
          page:
            safePage,

          limit,

          total,

          pageCount,
        },
      });
    } catch (error) {
      console.error(
        "GET /crm/partners error:",
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
            "PARTNERS_LOAD_FAILED",
        });
    }
  }
);

export default router;
