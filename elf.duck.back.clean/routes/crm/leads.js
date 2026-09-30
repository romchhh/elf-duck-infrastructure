import express from "express";
import {
  getPeriodRange,
  getCompletedOrderMatch,
  getSaleDateExpression,
  Order,
  User,
} from "./deps.js";

const router = express.Router();

router.get(
  "/leads",
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
            ) || 50
          )
        );

      const search =
        String(
          req.query?.search || ""
        )
          .trim()
          .toLowerCase();

        /*
        * Лид =
        * любой пользователь,
        * который появился в User,
        * но ещё не совершил
        * завершённую покупку.
        */
        const users =
        await User.find({
            telegramId: {
            $exists: true,
            $ne: "",
            },

            createdAt: {
            $gte: range.from,
            $lt: range.to,
            },
        })
          .select({
            telegramId: 1,
            username: 1,
            firstName: 1,
            lastName: 1,
            createdAt: 1,

            "referral.invitedByTelegramId": 1,
          })
          .lean();

        const telegramIds =

        users

            .map((user) =>
            String(
              user?.telegramId || ""
            ).trim()
          )
          .filter(Boolean);

      /*
       * Ищем завершённые покупки
       * этих приглашённых пользователей.
       */
      const sales =
        telegramIds.length > 0
          ? await Order.aggregate([
              {
                $match: {
                  ...getCompletedOrderMatch(),

                  userTelegramId: {
                    $in: telegramIds,
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
                    $lt: range.to,
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

              {
                $sort: {
                  crmSaleDate: 1,
                },
              },
            ])
          : [];

      const salesByTelegramId =
        new Map();

      for (const sale of sales) {
        const telegramId =
          String(
            sale?.userTelegramId ||
              ""
          ).trim();

        if (!telegramId) {
          continue;
        }

        if (
          !salesByTelegramId.has(
            telegramId
          )
        ) {
          salesByTelegramId.set(
            telegramId,
            []
          );
        }

        salesByTelegramId
          .get(telegramId)
          .push(sale);
      }

      /*
       * Для прошлых периодов нельзя
       * считать возраст лида относительно
       * сегодняшнего дня.
       *
       * Поэтому точкой отсчёта является
       * конец выбранного периода.
       *
       * Для текущего периода — сейчас.
       */
      const now =
        new Date();

      const referenceDate =
        range.to < now
          ? range.to
          : now;

        let rows =

        users.map(
          (user) => {
            const telegramId =
              String(
                user?.telegramId ||
                  ""
              ).trim();

            const userSales =
              salesByTelegramId.get(
                telegramId
              ) || [];

            const completedPurchases =
              userSales.length;

            const completedTotal =
              Number(
                userSales
                  .reduce(
                    (
                      sum,
                      order
                    ) =>
                      sum +
                      Number(
                        order
                          ?.totalZl ||
                          0
                      ),
                    0
                  )
                  .toFixed(2)
              );

            const firstPurchaseAt =
              userSales[0]
                ?.crmSaleDate ||
              null;

            const createdAt =
              user?.createdAt
                ? new Date(
                    user.createdAt
                  )
                : null;

            const daysSinceCreated =
              createdAt
                ? Math.max(
                    0,

                    Math.floor(
                      (
                        referenceDate.getTime() -
                        createdAt.getTime()
                      ) /
                        (
                          24 *
                          60 *
                          60 *
                          1000
                        )
                    )
                  )
                : 0;

            const firstPurchaseDays =
              createdAt &&
              firstPurchaseAt
                ? Math.max(
                    0,

                    Math.floor(
                      (
                        new Date(
                          firstPurchaseAt
                        ).getTime() -
                        createdAt.getTime()
                      ) /
                        (
                          24 *
                          60 *
                          60 *
                          1000
                        )
                    )
                  )
                : null;

            /*
             * Логика статуса:
             *
             * Есть покупка -> Клиент
             *
             * Нет покупки,
             * прошло > 8 дней
             * -> Спящий лид
             *
             * Иначе -> Лид
             */
            let status =
              "lead";

            let inLeads =
              daysSinceCreated;

            if (
              completedPurchases >
              0
            ) {
              status =
                "client";

              inLeads =
                firstPurchaseDays ??
                0;
            } else if (
              daysSinceCreated >
              8
            ) {
              status =
                "sleeping";
            }

            const username =
              String(
                user?.username ||
                  ""
              )
                .trim()
                .replace(
                  /^@+/,
                  ""
                );

            const fullName =
              [
                user?.firstName ||
                  "",
                user?.lastName ||
                  "",
              ]
                .filter(Boolean)
                .join(" ")
                .trim();

            return {
              id:
                telegramId,

              telegramId,

              name:
                fullName ||
                (
                  username
                    ? `@${username}`
                    : telegramId
                ),

              username,

              handle:
                username
                  ? `@${username}`
                  : telegramId,

              inviterTelegramId:
                String(
                  user?.referral
                    ?.invitedByTelegramId ||
                    ""
                ).trim(),

              createdAt,

              inLeads,

              completedPurchases,

              completedTotal,

              firstPurchaseAt,

              status,
            };
          }
        );

        /*
        * После первой завершённой
        * покупки пользователь
        * перестаёт быть лидом.
        */
        rows =
        rows.filter(
            (row) =>
            Number(
                row?.completedPurchases || 0
            ) === 0
        );

      /*
       * KPI считаем до поиска.
       */
      const leads =
        rows.filter(
          (row) =>
            row.status ===
            "lead"
        ).length;

      const sleeping =
        rows.filter(
          (row) =>
            row.status ===
            "sleeping"
        ).length;

        const clients = 0;

      const totalInvited =
        rows.length;

        const conversion = 0;

      /*
       * Поиск.
       */
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
                  row.inviterTelegramId,
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

      /*
       * Новые регистрации сверху.
       */
      rows.sort(
        (a, b) => {
          const aDate =
            a.createdAt
              ? new Date(
                  a.createdAt
                ).getTime()
              : 0;

          const bDate =
            b.createdAt
              ? new Date(
                  b.createdAt
                ).getTime()
              : 0;

          return (
            bDate - aDate
          );
        }
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
        ) *
        limit;

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
          leads,
          sleeping,
          clients,
          conversion,
          totalInvited,
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
        "GET /crm/leads error:",
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
            "LEADS_LOAD_FAILED",
        });
    }
  }
);

export default router;
