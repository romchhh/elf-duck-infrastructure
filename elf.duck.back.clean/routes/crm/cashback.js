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
import {
  findCashbackUserByQuery,
  normalizeCashbackUsername,
} from "../../lib/cashback/findUser.js";

const router = express.Router();

function ledgerSourceLabel(source, type) {
  const key = String(source || "").trim();
  const map = {
    manual_admin_grant: "Начисление (админ/CRM)",
    manual_admin_deduct: "Списание (админ/CRM)",
    order_earned_cashback: "Начисление за заказ",
    order_payment_refund: "Возврат на баланс после отмены",
    cashback_replace: "Корректировка кэшбэка на заказе",
  };
  if (map[key]) return map[key];
  if (String(type || "") === "refund") return "Возврат на баланс";
  if (key) return key;
  return "Движение кэшбэка";
}

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

      const nowForUsers = new Date();

      const [users, usedRows] = await Promise.all([
        User.aggregate([
          {
            $project: {
              telegramId: 1,
              username: 1,
              firstName: 1,
              lastName: 1,
              cashbackBalance: 1,
              issuedTotal: {
                $sum: {
                  $map: {
                    input: {
                      $ifNull: ["$cashbackLedger", []],
                    },
                    as: "entry",
                    in: {
                      $ifNull: ["$$entry.amountZl", 0],
                    },
                  },
                },
              },
              issuedInPeriod: {
                $sum: {
                  $map: {
                    input: {
                      $ifNull: ["$cashbackLedger", []],
                    },
                    as: "entry",
                    in: {
                      $cond: [
                        {
                          $and: [
                            {
                              $gte: [
                                "$$entry.earnedAt",
                                range.from,
                              ],
                            },
                            {
                              $lt: [
                                "$$entry.earnedAt",
                                range.to,
                              ],
                            },
                          ],
                        },
                        {
                          $ifNull: ["$$entry.amountZl", 0],
                        },
                        0,
                      ],
                    },
                  },
                },
              },
              nearestExpiry: {
                $min: {
                  $map: {
                    input: {
                      $filter: {
                        input: {
                          $ifNull: ["$cashbackLedger", []],
                        },
                        as: "entry",
                        cond: {
                          $and: [
                            {
                              $gt: [
                                {
                                  $ifNull: [
                                    "$$entry.remainingZl",
                                    0,
                                  ],
                                },
                                0,
                              ],
                            },
                            {
                              $eq: [
                                {
                                  $ifNull: [
                                    "$$entry.expiredAt",
                                    null,
                                  ],
                                },
                                null,
                              ],
                            },
                            {
                              $gt: [
                                "$$entry.expiresAt",
                                nowForUsers,
                              ],
                            },
                          ],
                        },
                      },
                    },
                    as: "entry",
                    in: "$$entry.expiresAt",
                  },
                },
              },
            },
          },
        ]),
        Order.aggregate([
          {
            $match: {
              $and: [
                getCompletedOrderMatch(),
                {
                  $or: [
                    {
                      "payment.cashbackAppliedZl": {
                        $gt: 0,
                      },
                    },
                    {
                      "payment.cashbackRefundedAmountZl": {
                        $gt: 0,
                      },
                    },
                  ],
                },
              ],
            },
          },
          {
            $addFields: {
              crmSaleDate: getSaleDateExpression(),
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
              _id: "$userTelegramId",
              usedTotal: {
                $sum: "$crmCashbackUsed",
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
        ]),
      ]);

      const usedByUser = new Map();
      let usedInPeriod = 0;

      for (const row of usedRows) {
        const telegramId = String(row?._id || "").trim();
        usedByUser.set(telegramId, Number(row?.usedTotal || 0));
        usedInPeriod += Number(row?.usedInPeriod || 0);
      }

      const now = nowForUsers;
      const fiveDaysMs = 5 * 24 * 60 * 60 * 1000;

      let issuedInPeriod = 0;
      let activeBalance = 0;

      let rows = users.map((user) => {
        const telegramId = String(user?.telegramId || "").trim();
        const issuedTotal = Number(user?.issuedTotal || 0);
        const userIssuedInPeriod = Number(user?.issuedInPeriod || 0);
        issuedInPeriod += userIssuedInPeriod;

        const balance = Number(user?.cashbackBalance || 0);
        activeBalance += balance;

        const nearestExpiry = user?.nearestExpiry
          ? new Date(user.nearestExpiry)
          : null;

        const msUntilExpiry = nearestExpiry
          ? nearestExpiry.getTime() - now.getTime()
          : null;

        const status =
          nearestExpiry &&
          msUntilExpiry >= 0 &&
          msUntilExpiry <= fiveDaysMs
            ? "expiring"
            : "active";

        const username = String(user?.username || "").trim();
        const fullName = [user?.firstName || "", user?.lastName || ""]
          .filter(Boolean)
          .join(" ")
          .trim();

        const name =
          fullName || (username ? `@${username}` : telegramId);

        return {
          id: String(user?._id || telegramId),
          telegramId,
          username,
          name,
          handle: username ? `@${username}` : telegramId,
          balance: Number(balance.toFixed(2)),
          issued: Number(issuedTotal.toFixed(2)),
          used: Number(
            Number(usedByUser.get(telegramId) || 0).toFixed(2)
          ),
          expiresAt: nearestExpiry,
          status,
        };
      });

    rows = rows.filter(
        (row) =>
            Number(row?.balance || 0) > 0 ||
            Number(row?.issued || 0) > 0 ||
            Number(row?.used || 0) > 0
        );

      /*
       * Фильтры.
       */
      if (filter === "active") {
        rows = rows.filter((row) => row?.status === "active");
      }

      if (filter === "expiring") {
        rows = rows.filter((row) => row?.status === "expiring");
      }

      if (filter === "balance") {
        rows = rows.filter((row) => Number(row?.balance || 0) > 0);
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

      const { parseSortQuery, sortRows } = await import(
        "../../lib/crm/sortRows.js"
      );
      const { sortKey, sortDirection } = parseSortQuery(req.query, [
        "name",
        "balance",
        "issued",
        "used",
        "expiresAt",
        "status",
      ]);

      if (sortKey) {
        rows = sortRows(rows, sortKey, sortDirection, {
          name: (row) => row.name || row.handle || row.telegramId || "",
          balance: (row) => Number(row.balance || 0),
          issued: (row) => Number(row.issued || 0),
          used: (row) => Number(row.used || 0),
          expiresAt: (row) => row.expiresAt || null,
          status: (row) => row.status || "",
        });
      } else {
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
      }

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

      const summary = {
        issued,
        used,
        balance,
        utilisation,
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
    const username = normalizeCashbackUsername(
      req.query?.username || req.query?.q || ""
    );
    if (!username) {
      return res.status(400).json({ ok: false, error: "USERNAME_REQUIRED" });
    }

    const userDoc = await findCashbackUserByQuery(username, {
      telegramId: 1,
      username: 1,
      firstName: 1,
      lastName: 1,
      cashbackBalance: 1,
      cashbackLedger: 1,
    });
    const user = userDoc?.toObject ? userDoc.toObject() : userDoc;

    if (!user) {
      return res.status(404).json({ ok: false, error: "USER_NOT_FOUND" });
    }

    const telegramId = String(user.telegramId || "").trim();
    const ledger = Array.isArray(user.cashbackLedger) ? user.cashbackLedger : [];
    const activeLots = ledger.filter(
      (row) => !row?.expiredAt && Number(row?.remainingZl || 0) > 0
    );

    const cashbackOrders = await Order.find(
      {
        userTelegramId: telegramId,
        $or: [
          { "payment.cashbackAppliedZl": { $gt: 0 } },
          { "payment.cashbackOriginalAppliedZl": { $gt: 0 } },
          { "payment.cashbackRefundedAmountZl": { $gt: 0 } },
        ],
      },
      {
        orderNo: 1,
        status: 1,
        totalZl: 1,
        createdAt: 1,
        cancelledAt: 1,
        updatedAt: 1,
        payment: 1,
      }
    )
      .sort({ createdAt: -1 })
      .limit(40)
      .lean();

    const orderHistory = cashbackOrders.map((order) => {
      const payment = order?.payment || {};
      const appliedZl = Number(
        payment.cashbackOriginalAppliedZl || payment.cashbackAppliedZl || 0
      );
      const stillAppliedZl = Number(payment.cashbackAppliedZl || 0);
      const refundedZl = Number(payment.cashbackRefundedAmountZl || 0);
      const refundedAt = payment.cashbackRefundedAt || null;
      const status = String(order?.status || "").trim();
      const cancelledLike = /cancel|annul|reject|fail/i.test(status) ||
        Boolean(order?.cancelledAt);

      let refundStatus = "none";
      if (refundedZl > 0 && refundedAt) {
        refundStatus = "refunded";
      } else if (appliedZl > 0 && cancelledLike && stillAppliedZl <= 0 && !refundedAt) {
        refundStatus = "unclear";
      } else if (appliedZl > 0 && cancelledLike && stillAppliedZl > 0) {
        refundStatus = "missing";
      } else if (stillAppliedZl > 0) {
        refundStatus = "held";
      }

      return {
        orderId: String(order?._id || ""),
        orderNo: String(order?.orderNo || ""),
        status,
        totalZl: Number(order?.totalZl || 0),
        createdAt: order?.createdAt || null,
        cancelledAt: order?.cancelledAt || null,
        cashbackAppliedZl: stillAppliedZl,
        cashbackOriginalAppliedZl: appliedZl,
        cashbackRefundedAmountZl: refundedZl,
        cashbackAppliedAt: payment.cashbackAppliedAt || null,
        cashbackRefundedAt: refundedAt,
        refundStatus,
      };
    });

    const history = [];

    for (const order of orderHistory) {
      const spendAmount = Number(
        order.cashbackOriginalAppliedZl || order.cashbackAppliedZl || 0
      );
      if (spendAmount > 0) {
        history.push({
          id: `spend-${order.orderId}`,
          at: order.cashbackAppliedAt || order.createdAt,
          kind: "spend",
          amountZl: spendAmount,
          label: `Списано на заказ #${order.orderNo || "—"}`,
          orderId: order.orderId,
          orderNo: order.orderNo,
          orderStatus: order.status,
          refundStatus: order.refundStatus,
        });
      }
      if (Number(order.cashbackRefundedAmountZl || 0) > 0) {
        history.push({
          id: `refund-order-${order.orderId}`,
          at: order.cashbackRefundedAt || order.cancelledAt || order.createdAt,
          kind: "refund",
          amountZl: Number(order.cashbackRefundedAmountZl || 0),
          label: `Возврат на баланс (заказ #${order.orderNo || "—"})`,
          orderId: order.orderId,
          orderNo: order.orderNo,
          orderStatus: order.status,
          refundStatus: order.refundStatus,
        });
      }
    }

    for (const row of ledger) {
      const source = String(row?.source || "").trim();
      // spend/refund по заказам уже в orderHistory
      if (source === "order_payment_refund") continue;

      const amountZl = Number(row?.amountZl || 0);
      const earnedAt = row?.earnedAt || row?.createdAt || null;
      let kind = "grant";
      if (source === "manual_admin_deduct") kind = "deduct";
      else if (source === "order_earned_cashback") kind = "earn";
      else if (source === "cashback_replace" || String(row?.type || "") === "refund") {
        kind = "refund";
      } else if (source === "manual_admin_grant" || amountZl > 0) {
        kind = "grant";
      }

      history.push({
        id: `ledger-${String(row?._id || `${source}-${earnedAt}`)}`,
        at: earnedAt,
        kind,
        amountZl,
        remainingZl: Number(row?.remainingZl || 0),
        label: ledgerSourceLabel(source, row?.type),
        source,
        orderId: row?.orderId || row?.sourceOrderId
          ? String(row?.orderId || row?.sourceOrderId)
          : "",
        expiresAt: row?.expiresAt || null,
      });

      if (row?.expiredAt) {
        const expiredAmount = Number(
          row?.expiredAmountZl || amountZl || 0
        );
        history.push({
          id: `expire-${String(row?._id || `${source}-exp`)}`,
          at: row.expiredAt,
          kind: "expire",
          amountZl: Number(expiredAmount.toFixed(2)),
          label: "Сгорел срок действия",
          source,
        });
      }
    }

    history.sort((a, b) => {
      const ta = a?.at ? new Date(a.at).getTime() : 0;
      const tb = b?.at ? new Date(b.at).getTime() : 0;
      return tb - ta;
    });

    return res.json({
      ok: true,
      user: {
        telegramId,
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
        amountZl: Number(row?.amountZl || 0),
        earnedAt: row?.earnedAt || null,
      })),
      orders: orderHistory,
      history: history.slice(0, 80),
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

    const user = await findCashbackUserByQuery(username);
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

    const user = await findCashbackUserByQuery(username);
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
