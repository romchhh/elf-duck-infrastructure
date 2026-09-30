import express from "express";
import {
  loadFirstSales,
  buildMetrics,
  buildProductPerformance,
  buildLocationPerformance,
  buildTopPartners,
  percentagePoints,
  valueDifference,
  CRM_TIME_ZONE,
  getPeriodRange,
  loadSales,
  loadSalesHistory,
  loadCanceledCount,
  loadCanceledOrders,
  Order,
} from "./deps.js";

const router = express.Router();

router.get(
  "/dashboard",
  async (req, res) => {
    try {
      const range =
        getPeriodRange(
          req.query?.period ||
            "month",

          req.query?.from || "",

          req.query?.to || ""
        );

        let currentOrders;
        let previousOrders = [];

        let currentCanceled = 0;
        let previousCanceled = 0;

        const firstSalesPromise =
        loadFirstSales();

        const salesHistoryPromise =
        loadSalesHistory(
            range.to
        );

        if (range.key === "all") {
        [
            currentOrders,
            currentCanceled,
        ] = await Promise.all([
            loadSales(
            range.from,
            range.to
            ),

            loadCanceledCount(
            range.from,
            range.to
            ),
        ]);
        } else {
        [
            currentOrders,
            previousOrders,
            currentCanceled,
            previousCanceled,
        ] = await Promise.all([
            loadSales(
            range.from,
            range.to
            ),

            loadSales(
            range.previousFrom,
            range.previousTo
            ),

            loadCanceledCount(
            range.from,
            range.to
            ),

            loadCanceledCount(
            range.previousFrom,
            range.previousTo
            ),
        ]);
        }

        const firstSales =
        await firstSalesPromise;

        const salesHistory =
        await salesHistoryPromise;

        const firstSaleByUser =
        new Map(
            firstSales.map((row) => [
            String(row?._id || ""),
            new Date(row.firstSaleAt),
            ])
        );

        const current =
        buildMetrics(
            currentOrders,
            range.from,
            range.to,
            currentCanceled,
            firstSaleByUser
        );

        const previous =
        range.key === "all"
            ? null
            : buildMetrics(
                previousOrders,
                range.previousFrom,
                range.previousTo,
                previousCanceled,
                firstSaleByUser
            );

      const hasComparison =
        range.key !== "all";

        const productPerformance =
        await buildProductPerformance({
            currentOrders,
            previousOrders,
            salesHistory,
            range,
            hasComparison,
        });

        const [
            currentCanceledOrdersForLocations,
            previousCanceledOrdersForLocations,
        ] = await Promise.all([
            loadCanceledOrders(
                range.from,
                range.to
            ),

            hasComparison
                ? loadCanceledOrders(
                    range.previousFrom,
                    range.previousTo
                )
                : Promise.resolve([]),
            ]);

        const locationPerformance =

        await buildLocationPerformance({

            currentOrders,

            previousOrders,

            salesHistory,

            currentCanceledOrders:

            currentCanceledOrdersForLocations,

            previousCanceledOrders:

            previousCanceledOrdersForLocations,

            hasComparison,

        });

        const topPartners =
        await buildTopPartners({
            currentOrders,
        });

        const historyByCustomer =
        new Map();

        for (
        const order of salesHistory
        ) {
        const telegramId =
            String(
            order?.userTelegramId ||
                ""
            ).trim();

        if (!telegramId) continue;

        if (
            !historyByCustomer.has(
            telegramId
            )
        ) {
            historyByCustomer.set(
            telegramId,
            []
            );
        }

        historyByCustomer
            .get(telegramId)
            .push(order);
        }

        let repeatRevenue = 0;
        let intervalTotalMs = 0;
        let intervalCount = 0;

        for (
        const orders of
        historyByCustomer.values()
        ) {
        for (
            let index = 1;
            index < orders.length;
            index += 1
        ) {
            const order =
            orders[index];

            const previousOrder =
            orders[index - 1];

            const orderDate =
            new Date(
                order.crmSaleDate
            );

            if (
            orderDate < range.from ||
            orderDate >= range.to
            ) {
            continue;
            }

            repeatRevenue +=
            Number(
                order?.totalZl || 0
            );

            const previousDate =
            new Date(
                previousOrder.crmSaleDate
            );

            const intervalMs =
            orderDate.getTime() -
            previousDate.getTime();

            if (intervalMs >= 0) {
            intervalTotalMs +=
                intervalMs;

            intervalCount += 1;
            }
        }
        }

        const averageRepeatIntervalDays =
        intervalCount > 0
            ? Number(
                (
                intervalTotalMs /
                intervalCount /
                (
                    24 *
                    60 *
                    60 *
                    1000
                )
                ).toFixed(1)
            )
            : 0;

        const retention = {
        rate:
            current
            .repeatCustomersPercent,

        change:
            hasComparison
            ? percentagePoints(
                current
                    .repeatCustomersPercent,
                previous
                    .repeatCustomersPercent
                )
            : null,

        newShare:
            current
            .newCustomersPercent,

        repeatShare:
            current
            .repeatCustomersPercent,

        averageIntervalDays:
            averageRepeatIntervalDays,

        repeatRevenue:
            Number(
            repeatRevenue.toFixed(2)
            ),
        };

    const dynamicsMap =
        new Map();

        const seenCustomersInPeriod =
        new Set();

        const sortedCurrentOrders =
        [...currentOrders].sort(
            (a, b) =>
            new Date(
                a.crmSaleDate
            ).getTime() -
            new Date(
                b.crmSaleDate
            ).getTime()
        );

        for (
        const order of
        sortedCurrentOrders
        ) {
        const dateKey =
            new Intl.DateTimeFormat(
            "en-CA",
            {
                timeZone:
                CRM_TIME_ZONE,
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
            }
            ).format(
            new Date(
                order.crmSaleDate
            )
            );

        if (
            !dynamicsMap.has(
            dateKey
            )
        ) {
            dynamicsMap.set(
            dateKey,
            {
                date: dateKey,
                revenue: 0,
                orders: 0,
                cancellations: 0,
                newCustomers:
                new Set(),
                repeatCustomers:
                new Set(),
            }
            );
        }

        const row =
            dynamicsMap.get(
            dateKey
            );

        const telegramId =
            String(
            order?.userTelegramId ||
                ""
            ).trim();

        const firstSaleAt =
            firstSaleByUser.get(
            telegramId
            );

        const isFirstOrderInPeriod =
            telegramId &&
            !seenCustomersInPeriod.has(
            telegramId
            );

        row.revenue +=
            Number(
            order?.totalZl || 0
            );

        row.orders += 1;

        if (
            telegramId &&
            isFirstOrderInPeriod &&
            firstSaleAt &&
            firstSaleAt >=
            range.from &&
            firstSaleAt <
            range.to
        ) {
            row.newCustomers.add(
            telegramId
            );
        } else if (
            telegramId
        ) {
            row.repeatCustomers.add(
            telegramId
            );
        }

        if (telegramId) {
            seenCustomersInPeriod.add(
            telegramId
            );
        }
        }

        const currentCanceledOrders =
            await Order.aggregate([
                {
                $match: {
                    status: {
                    $in: [
                        "canceled",
                        "annulled",
                    ],
                    },
                },
                },

                {
                $addFields: {
                    crmCanceledAt: {
                    $cond: [
                        {
                        $eq: [
                            "$status",
                            "annulled",
                        ],
                        },

                        "$annulledAt",

                        "$canceledAt",
                    ],
                    },
                },
                },

                {
                $match: {
                    crmCanceledAt: {
                    $gte: range.from,
                    $lt: range.to,
                    },
                },
                },

                {
                $project: {
                    crmCanceledAt: 1,
                },
                },
            ]);

            for (
            const order of
            currentCanceledOrders
            ) {
            const dateKey =
                new Intl.DateTimeFormat(
                "en-CA",
                {
                    timeZone:
                    CRM_TIME_ZONE,

                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                }
                ).format(
                new Date(
                    order.crmCanceledAt
                )
                );

            if (
                !dynamicsMap.has(
                dateKey
                )
            ) {
                dynamicsMap.set(
                dateKey,
                {
                    date: dateKey,
                    revenue: 0,
                    orders: 0,
                    cancellations: 0,
                    newCustomers:
                    new Set(),
                    repeatCustomers:
                    new Set(),
                }
                );
            }

            const row =
                dynamicsMap.get(
                dateKey
                );

            row.cancellations += 1;
        }

        const businessDynamics =
        Array.from(
            dynamicsMap.values()
        )
            .sort(
            (a, b) =>
                a.date.localeCompare(
                b.date
                )
            )

            .map((row) => ({
            date:
                row.date,

            revenue:
                Number(
                row.revenue.toFixed(
                    2
                )
                ),

            orders:
                row.orders,

            cancellations:
                row.cancellations,

            cancellationsPercent:
                (
                row.orders +
                row.cancellations
                ) > 0
                ? Number(
                    (
                        (
                        row.cancellations /
                        (
                            row.orders +
                            row.cancellations
                        )
                        ) *
                        100
                    ).toFixed(1)
                    )
                : 0,

            newCustomers:
                row.newCustomers.size,

            repeatCustomers:
                row.repeatCustomers.size,
            }));

      return res.json({
        ok: true,

        period: {
          key:
            range.key,

          from:
            range.from,

          to:
            range.to,

          previousFrom:
            range.previousFrom,

          previousTo:
            range.previousTo,
        },

        revenue: {
        value:
            current.revenue,

        previousValue:
            hasComparison
            ? previous.revenue
            : null,

        changeValue:
            hasComparison
            ? valueDifference(
                current.revenue,
                previous.revenue,
                2
                )
            : null,
        },

        orders: {

        value:

            current.orders,

        previousValue:

            hasComparison

            ? previous.orders

            : null,

        changeValue:

            hasComparison

            ? valueDifference(

                current.orders,

                previous.orders

                )

            : null,

        },

        averageCheck: {

        value:

            current.averageCheck,

        previousValue:

            hasComparison

            ? previous.averageCheck

            : null,

        changeValue:

            hasComparison

            ? valueDifference(

                current.averageCheck,

                previous.averageCheck,

                2

                )

            : null,

        },

        customers: {
        value:
            current.customers,

        previousValue:
            hasComparison
            ? previous.customers
            : null,

        changeValue:
            hasComparison
            ? valueDifference(
                current.customers,
                previous.customers
                )
            : null,
        },

        newCustomers: {
        value:
            current.newCustomers,

        percent:
            current.newCustomersPercent,

        previousValue:
            hasComparison
            ? previous.newCustomers
            : null,

        previousPercent:
            hasComparison
            ? previous.newCustomersPercent
            : null,

        changePoints:
            hasComparison
            ? percentagePoints(
                current.newCustomersPercent,
                previous.newCustomersPercent
                )
            : null,
        },

        repeatPurchases: {
        value:
            current.repeatCustomers,

        percent:
            current.repeatCustomersPercent,

        previousValue:
            hasComparison
            ? previous.repeatCustomers
            : null,

        previousPercent:
            hasComparison
            ? previous.repeatCustomersPercent
            : null,

        changePoints:
            hasComparison
            ? percentagePoints(
                current.repeatCustomersPercent,
                previous.repeatCustomersPercent
                )
            : null,
        },

        cancellations: {
        value:
            current.cancellations,

        percent:
            current.cancellationsPercent,

        previousValue:
            hasComparison
            ? previous.cancellations
            : null,

        previousPercent:
            hasComparison
            ? previous.cancellationsPercent
            : null,

        changePoints:
            hasComparison
            ? percentagePoints(
                current.cancellationsPercent,
                previous.cancellationsPercent
                )
            : null,
        },
        businessDynamics,
        retention,
        products: productPerformance,
        locations: locationPerformance,
        topPartners,
      });
    } catch (error) {
      console.error(
        "GET /crm/dashboard error:",
        error
      );

      if (
        String(
          error?.message || ""
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
            "DASHBOARD_LOAD_FAILED",
        });
    }
  }
);

export default router;
