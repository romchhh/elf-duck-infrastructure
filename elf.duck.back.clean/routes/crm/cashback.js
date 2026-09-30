import express from "express";
import {
  getPeriodRange,
  getCompletedOrderMatch,
  getSaleDateExpression,
  Order,
  User,
} from "./deps.js";
import {
  grantManualCashbackToUser,
  deductManualCashbackFromUser,
} from "../../lib/cashback/manualAdmin.js";

const router = express.Router();

const normalizeCashbackUsername = (raw) =>
  String(raw || "")
    .trim()
    .replace(/^@+/, "");

router.get(
  "/cashback",
  async (req, res) => {
    try {
      const range =
        getPeriodRange(
          req.query?.period || "month",
          req.query?.from || "",
          req.query?.to || ""
        );

      const page = Math.max(
        1,
        Number.parseInt(
          req.query?.page,
          10
        ) || 1
      );

      const limit = Math.min(
        100,
        Math.max(
          1,
          Number.parseInt(
            req.query?.limit,
            10
          ) || 50
        )
      );

      const search = String(
        req.query?.search || ""
      )
        .trim()
        .toLowerCase();

      const filter = String(
        req.query?.filter || "all"
      )
        .trim()
        .toLowerCase();

      const users =
        await User.find({})
          .select({
            telegramId: 1,
            username: 1,
            firstName: 1,
            lastName: 1,
            cashbackBalance: 1,
            cashbackLedger: 1,
          })
          .lean();

      /*
       * Использованный кэшбэк
       * считаем по завершённым заказам.
       */
      const usedRows =
        await Order.aggregate([
          {
            $match:
              getCompletedOrderMatch(),
          },

          {
            $addFields: {
              crmSaleDate:
                getSaleDateExpression(),

              crmCashbackUsed: {
                $max: [
                  0,

                  {
                    $subtract: [
                      {
                        $ifNull: [
                          "$payment.cashbackAppliedZl",
                          0,
                        ],
                      },

                      {
                        $ifNull: [
                          "$payment.cashbackRefundedAmountZl",
                          0,
                        ],
                      },
                    ],
                  },
                ],
              },
            },
          },

          {
            $match: {
              crmSaleDate: {
                $lt: range.to,
              },

              crmCashbackUsed: {
                $gt: 0,
              },
            },
          },

          {
            $group: {
              _id:
                "$userTelegramId",

              usedTotal: {
                $sum:
                  "$crmCashbackUsed",
              },

              usedInPeriod: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        {
                          $gte: [
                            "$crmSaleDate",
                            range.from,
                          ],
                        },

                        {
                          $lt: [
                            "$crmSaleDate",
                            range.to,
                          ],
                        },
                      ],
                    },

                    "$crmCashbackUsed",

                    0,
                  ],
                },
              },
            },
          },
        ]);

      const usedByUser =
        new Map();

      let usedInPeriod = 0;

      for (
        const row of usedRows
      ) {
        const telegramId =
          String(
            row?._id || ""
          ).trim();

        usedByUser.set(
          telegramId,
          Number(
            row?.usedTotal || 0
          )
        );

        usedInPeriod +=
          Number(
            row?.usedInPeriod || 0
          );
      }

      const now =
        new Date();

      const fiveDaysMs =
        5 *
        24 *
        60 *
        60 *
        1000;

      let issuedInPeriod = 0;
      let activeBalance = 0;

      let rows =
        users.map(
          (user) => {
            const telegramId =
              String(
                user?.telegramId ||
                  ""
              ).trim();

            const ledger =
              Array.isArray(
                user?.cashbackLedger
              )
                ? user.cashbackLedger
                : [];

            /*
             * Выдано всего.
             */
            const issuedTotal =
              ledger.reduce(
                (
                  sum,
                  entry
                ) =>
                  sum +
                  Number(
                    entry?.amountZl ||
                      0
                  ),

                0
              );

            /*
             * Начислено за выбранный период.
             */
            const userIssuedInPeriod =
              ledger.reduce(
                (
                  sum,
                  entry
                ) => {
                  if (
                    !entry?.earnedAt
                  ) {
                    return sum;
                  }

                  const earnedAt =
                    new Date(
                      entry.earnedAt
                    );

                  if (
                    earnedAt <
                      range.from ||
                    earnedAt >=
                      range.to
                  ) {
                    return sum;
                  }

                  return (
                    sum +
                    Number(
                      entry?.amountZl ||
                        0
                    )
                  );
                },

                0
              );

            issuedInPeriod +=
              userIssuedInPeriod;

            const balance =
              Number(
                user?.cashbackBalance ||
                  0
              );

            activeBalance +=
              balance;

            /*
             * Ищем ближайшую дату,
             * когда сгорит ещё
             * не использованный cashback.
             */
            const activeLedger =
              ledger
                .filter(
                  (entry) => {
                    const remaining =
                      Number(
                        entry?.remainingZl ||
                          0
                      );

                    if (
                      remaining <= 0
                    ) {
                      return false;
                    }

                    if (
                      entry?.expiredAt
                    ) {
                      return false;
                    }

                    if (
                      !entry?.expiresAt
                    ) {
                      return false;
                    }

                    const expiresAt =
                      new Date(
                        entry.expiresAt
                      );

                    return (
                      expiresAt >
                      now
                    );
                  }
                )
                .sort(
                  (a, b) =>
                    new Date(
                      a.expiresAt
                    ).getTime() -
                    new Date(
                      b.expiresAt
                    ).getTime()
                );

            const nearestExpiry =
              activeLedger.length >
              0
                ? new Date(
                    activeLedger[0]
                      .expiresAt
                  )
                : null;

            const msUntilExpiry =
              nearestExpiry
                ? nearestExpiry.getTime() -
                  now.getTime()
                : null;

            const status =
              nearestExpiry &&
              msUntilExpiry >= 0 &&
              msUntilExpiry <=
                fiveDaysMs
                ? "expiring"
                : "active";

            const username =
              String(
                user?.username ||
                  ""
              ).trim();

            const fullName = [
              user?.firstName ||
                "",
              user?.lastName ||
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
              id: String(
                user?._id ||
                  telegramId
              ),

              telegramId,

              username,

              name,

              handle:
                username
                  ? `@${username}`
                  : telegramId,

              balance:
                Number(
                  balance.toFixed(
                    2
                  )
                ),

              issued:
                Number(
                  issuedTotal.toFixed(
                    2
                  )
                ),

              used:
                Number(
                  Number(
                    usedByUser.get(
                      telegramId
                    ) || 0
                  ).toFixed(
                    2
                  )
                ),

              expiresAt:
                nearestExpiry,

              status,
            };
          }
        );

    rows = rows.filter(
        (row) =>
            Number(row?.balance || 0) > 0 ||
            Number(row?.issued || 0) > 0 ||
            Number(row?.used || 0) > 0
        );

      /*
       * Фильтры.
       */
      if (
        filter ===
        "balance"
      ) {
        rows =
          rows.filter(
            (row) =>
              Number(
                row?.balance || 0
              ) > 0
          );
      }

      if (
        filter ===
        "expiring"
      ) {
        rows =
          rows.filter(
            (row) =>
              row?.status ===
              "expiring"
          );
      }

      /*
       * Поиск.
       */
      if (search) {
        rows =
          rows.filter(
            (row) => {
              const haystack = [
                row.name,
                row.handle,
                row.username,
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

      /*
       * Сначала те,
       * у кого скоро сгорит.
       */
      rows.sort(
        (a, b) => {
          if (
            a.status ===
              "expiring" &&
            b.status !==
              "expiring"
          ) {
            return -1;
          }

          if (
            a.status !==
              "expiring" &&
            b.status ===
              "expiring"
          ) {
            return 1;
          }

          const aExpiry =
            a.expiresAt
              ? new Date(
                  a.expiresAt
                ).getTime()
              : Infinity;

          const bExpiry =
            b.expiresAt
              ? new Date(
                  b.expiresAt
                ).getTime()
              : Infinity;

          if (
            aExpiry !==
            bExpiry
          ) {
            return (
              aExpiry -
              bExpiry
            );
          }

          return (
            Number(
              b.balance || 0
            ) -
            Number(
              a.balance || 0
            )
          );
        }
      );

      const total =
        rows.length;

      const pageCount =
        Math.max(
          1,
          Math.ceil(
            total / limit
          )
        );

      const safePage =
        Math.min(
          page,
          pageCount
        );

      const start =
        (
          safePage - 1
        ) * limit;

      const pageRows =
        rows.slice(
          start,
          start + limit
        );

      const issued =
        Number(
          issuedInPeriod.toFixed(
            2
          )
        );

      const used =
        Number(
          usedInPeriod.toFixed(
            2
          )
        );

      const balance =
        Number(
          activeBalance.toFixed(
            2
          )
        );

      const utilisation =
        issued > 0
          ? Number(
              (
                (
                  used /
                  issued
                ) *
                100
              ).toFixed(
                1
              )
            )
          : 0;

      const listIssued = Number(
        rows
          .reduce(
            (sum, row) =>
              sum +
              Number(row?.issued || 0),
            0
          )
          .toFixed(2)
      );

      const listUsed = Number(
        rows
          .reduce(
            (sum, row) =>
              sum +
              Number(row?.used || 0),
            0
          )
          .toFixed(2)
      );

      const listBalance = Number(
        rows
          .reduce(
            (sum, row) =>
              sum +
              Number(row?.balance || 0),
            0
          )
          .toFixed(2)
      );

      const listUtilisation =
        listIssued > 0
          ? Number(
              (
                (listUsed / listIssued) *
                100
              ).toFixed(1)
            )
          : 0;

      const summary =
        filter === "all"
          ? {
              issued,
              used,
              balance,
              utilisation,
              filter,
              clients: total,
            }
          : {
              issued: listIssued,
              used: listUsed,
              balance: listBalance,
              utilisation: listUtilisation,
              filter,
              clients: total,
            };

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

        summary,

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
        "GET /crm/cashback error:",
        error
      );

      return res
        .status(500)
        .json({
          ok: false,
          error:
            "CASHBACK_LOAD_FAILED",
        });
    }
  }
);

router.get("/cashback/user", async (req, res) => {
  try {
    const username = normalizeCashbackUsername(req.query?.username);
    if (!username) {
      return res.status(400).json({ ok: false, error: "USERNAME_REQUIRED" });
    }

    const user = await User.findOne(
      { username },
      {
        telegramId: 1,
        username: 1,
        firstName: 1,
        lastName: 1,
        cashbackBalance: 1,
        cashbackLedger: 1,
      }
    ).lean();

    if (!user) {
      return res.status(404).json({ ok: false, error: "USER_NOT_FOUND" });
    }

    const ledger = Array.isArray(user.cashbackLedger) ? user.cashbackLedger : [];
    const activeLots = ledger.filter(
      (row) => !row?.expiredAt && Number(row?.remainingZl || 0) > 0
    );

    return res.json({
      ok: true,
      user: {
        telegramId: String(user.telegramId || ""),
        username: String(user.username || ""),
        firstName: String(user.firstName || ""),
        lastName: String(user.lastName || ""),
      },
      cashbackBalance: Number(user.cashbackBalance || 0),
      activeLotsCount: activeLots.length,
      activeLots: activeLots.slice(0, 30).map((row) => ({
        remainingZl: Number(row?.remainingZl || 0),
        expiresAt: row?.expiresAt || null,
        source: String(row?.source || ""),
      })),
    });
  } catch (error) {
    console.error("GET /crm/cashback/user error:", error);
    return res.status(500).json({ ok: false, error: "CASHBACK_LOOKUP_FAILED" });
  }
});

router.post("/cashback/grant", async (req, res) => {
  try {
    const username = normalizeCashbackUsername(req.body?.username);
    const amountZl = Number(req.body?.amountZl || 0);

    if (!username) {
      return res.status(400).json({ ok: false, error: "USERNAME_REQUIRED" });
    }

    if (!(amountZl > 0)) {
      return res.status(400).json({ ok: false, error: "INVALID_CASHBACK_AMOUNT" });
    }

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ ok: false, error: "USER_NOT_FOUND" });
    }

    const result = await grantManualCashbackToUser(user, amountZl, {
      grantedByTelegramId: "crm",
      grantedByUsername: "crm",
    });

    return res.json({
      ok: true,
      user: {
        telegramId: String(user.telegramId || ""),
        username: String(user.username || ""),
        firstName: String(user.firstName || ""),
      },
      cashbackBalance: Number(result.cashbackBalance || 0),
      grantedAmountZl: Number(result.grantedAmountZl || 0),
      expiresAt: result.expiresAt,
    });
  } catch (error) {
    console.error("POST /crm/cashback/grant error:", error);
    return res.status(500).json({
      ok: false,
      error: String(error?.message || "CASHBACK_GRANT_FAILED"),
    });
  }
});

router.post("/cashback/deduct", async (req, res) => {
  try {
    const username = normalizeCashbackUsername(req.body?.username);
    const amountZl = Number(req.body?.amountZl || 0);

    if (!username) {
      return res.status(400).json({ ok: false, error: "USERNAME_REQUIRED" });
    }

    if (!(amountZl > 0)) {
      return res.status(400).json({ ok: false, error: "INVALID_CASHBACK_AMOUNT" });
    }

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ ok: false, error: "USER_NOT_FOUND" });
    }

    const result = await deductManualCashbackFromUser(user, amountZl, {
      grantedByTelegramId: "crm",
      grantedByUsername: "crm",
    });

    return res.json({
      ok: true,
      user: {
        telegramId: String(user.telegramId || ""),
        username: String(user.username || ""),
        firstName: String(user.firstName || ""),
      },
      cashbackBalance: Number(result.cashbackBalance || 0),
      deductedAmountZl: Number(result.deductedAmountZl || 0),
    });
  } catch (error) {
    const msg = String(error?.message || "");
    if (msg === "INSUFFICIENT_CASHBACK_BALANCE") {
      return res.status(409).json({ ok: false, error: msg });
    }
    console.error("POST /crm/cashback/deduct error:", error);
    return res.status(500).json({
      ok: false,
      error: msg || "CASHBACK_DEDUCT_FAILED",
    });
  }
});

export default router;
