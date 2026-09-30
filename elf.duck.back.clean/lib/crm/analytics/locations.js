import mongoose from "mongoose";
import Order from "../../../models/Order.js";
import Product from "../../../models/Product.js";
import PickupPoint from "../../../models/PickupPoint.js";
import User from "../../../models/User.js";
import BroadcastCampaign from "../../../models/BroadcastCampaign.js";
import { PUSH_ATTRIBUTION_WINDOW_DAYS } from "../constants.js";
import {
  getCompletedOrderMatch,
  getSaleDateExpression,
  loadSales,
  loadSalesHistory,
  loadCanceledCount,
  loadCanceledOrders,
} from "../sales.js";
import { getPeriodRange, getWarsawDateKey } from "../datetime.js";
import { percentChange, percentagePoints } from "./metrics.js";


export function getLocationIdentity(order) {
  if (
    order?.deliveryType === "pickup" &&
    order?.pickupPointId
  ) {
    return `pickup:${String(
      order.pickupPointId
    )}`;
  }

  if (
    order?.deliveryType === "delivery" &&
    order?.deliveryMethod === "courier"
  ) {
    return "delivery:courier";
  }

  if (
    order?.deliveryType === "delivery" &&
    order?.deliveryMethod === "inpost"
  ) {
    return "delivery:inpost";
  }

  return "other";
}

export function collectLocationSales(
  orders = []
) {
  const map = new Map();

  for (const order of orders) {
    const identity =
      getLocationIdentity(order);

    if (!map.has(identity)) {
      map.set(identity, {
        revenue: 0,
        orders: 0,
        customers: new Set(),
      });
    }

    const row =
      map.get(identity);

    row.revenue += Number(
      order?.totalZl || 0
    );

    row.orders += 1;

    const telegramId = String(
      order?.userTelegramId || ""
    ).trim();

    if (telegramId) {
      row.customers.add(
        telegramId
      );
    }
  }

  return map;
}

export async function buildLocationPerformance({
  currentOrders,
  previousOrders,
  salesHistory,
  currentCanceledOrders,
  previousCanceledOrders,
  hasComparison,
}) {
  const pickupPoints =
    await PickupPoint.find({}).lean();

  const pickupTitleById =
    new Map(
      pickupPoints.map(
        (point) => [
          String(
            point?._id || ""
          ),

          String(
            point?.title ||
              point?.address ||
              point?.key ||
              "Точка самовывоза"
          ),
        ]
      )
    );

  const current =
    collectLocationSales(
      currentOrders
    );

  const previous =
    collectLocationSales(
      previousOrders
    );

  function collectCanceledByLocation(
    orders = []
  ) {
    const map = new Map();

    for (const order of orders) {
      const identity =
        getLocationIdentity(order);

      map.set(
        identity,
        Number(
          map.get(identity) || 0
        ) + 1
      );
    }

    return map;
  }

  const currentCanceled =
    collectCanceledByLocation(
      currentCanceledOrders
    );

  const previousCanceled =
    collectCanceledByLocation(
      previousCanceledOrders
    );

  /*
   * История покупок:
   * location -> customer -> даты покупок
   */
  const locationHistory =
    new Map();

  for (
    const order of salesHistory || []
  ) {
    const identity =
      getLocationIdentity(order);

    const telegramId = String(
      order?.userTelegramId || ""
    ).trim();

    if (!telegramId) {
      continue;
    }

    if (
      !locationHistory.has(
        identity
      )
    ) {
      locationHistory.set(
        identity,
        new Map()
      );
    }

    const customers =
      locationHistory.get(
        identity
      );

    if (
      !customers.has(
        telegramId
      )
    ) {
      customers.set(
        telegramId,
        []
      );
    }

    customers
      .get(telegramId)
      .push(
        new Date(
          order.crmSaleDate
        )
      );
  }

  const identities =
    new Set([
      ...current.keys(),
      ...previous.keys(),
      ...currentCanceled.keys(),
      ...previousCanceled.keys(),
    ]);

  for (const point of pickupPoints) {
    const pointTitle = String(
      point?.title ||
        point?.key ||
        ""
    )
      .trim()
      .toLowerCase();

    const isDeliveryPoint =
      pointTitle === "курьер" ||
      pointTitle === "courier" ||
      pointTitle === "inpost";

    if (isDeliveryPoint) {
      continue;
    }

    identities.add(
      `pickup:${String(
        point?._id || ""
      )}`
    );
  }

  function getRepeatStats(
    identity,
    orders
  ) {
    const buyers =
      new Set();

    const repeatBuyers =
      new Set();

    const sortedOrders =
      [...orders]
        .filter(
          (order) =>
            getLocationIdentity(
              order
            ) === identity
        )
        .sort(
          (a, b) =>
            new Date(
              a.crmSaleDate
            ).getTime() -
            new Date(
              b.crmSaleDate
            ).getTime()
        );

    for (
      const order of sortedOrders
    ) {
      const telegramId =
        String(
          order
            ?.userTelegramId ||
            ""
        ).trim();

      if (!telegramId) {
        continue;
      }

      buyers.add(
        telegramId
      );

      const orderDate =
        new Date(
          order.crmSaleDate
        );

      const history =
        locationHistory
          .get(identity)
          ?.get(telegramId) ||
        [];

      const hadEarlierPurchase =
        history.some(
          (date) =>
            date < orderDate
        );

      if (
        hadEarlierPurchase
      ) {
        repeatBuyers.add(
          telegramId
        );
      }
    }

    const percent =
      buyers.size > 0
        ? Number(
            (
              (
                repeatBuyers.size /
                buyers.size
              ) *
              100
            ).toFixed(1)
          )
        : 0;

    return {
      buyers:
        buyers.size,

      repeatBuyers:
        repeatBuyers.size,

      percent,
    };
  }

  const rows =
    Array.from(
      identities
    ).map(
      (identity) => {
        const currentRow =
          current.get(identity) || {
            revenue: 0,
            orders: 0,
            customers:
              new Set(),
          };

        const previousRow =
          previous.get(identity) || {
            revenue: 0,
            orders: 0,
            customers:
              new Set(),
          };

        const revenue =
          Number(
            Number(
              currentRow
                .revenue || 0
            ).toFixed(2)
          );

        const previousRevenue =
          Number(
            Number(
              previousRow
                .revenue || 0
            ).toFixed(2)
          );

        const orders =
          Number(
            currentRow
              .orders || 0
          );

        const previousOrdersCount =
          Number(
            previousRow
              .orders || 0
          );

        const averageCheck =
          orders > 0
            ? Number(
                (
                  revenue /
                  orders
                ).toFixed(2)
              )
            : 0;

        const previousAverageCheck =
          previousOrdersCount >
          0
            ? Number(
                (
                  previousRevenue /
                  previousOrdersCount
                ).toFixed(2)
              )
            : 0;

        const cancellations =
          Number(
            currentCanceled.get(
              identity
            ) || 0
          );

        const previousCancellations =
          Number(
            previousCanceled.get(
              identity
            ) || 0
          );

        const cancellationsPercent =
          orders +
            cancellations >
          0
            ? Number(
                (
                  (
                    cancellations /
                    (
                      orders +
                      cancellations
                    )
                  ) *
                  100
                ).toFixed(1)
              )
            : 0;

        const previousCancellationsPercent =
          previousOrdersCount +
            previousCancellations >
          0
            ? Number(
                (
                  (
                    previousCancellations /
                    (
                      previousOrdersCount +
                      previousCancellations
                    )
                  ) *
                  100
                ).toFixed(1)
              )
            : 0;

        const repeat =
          getRepeatStats(
            identity,
            currentOrders
          );

        const previousRepeat =
          getRepeatStats(
            identity,
            previousOrders
          );

        let name =
          "Другое";

        let type =
          "other";

        if (
          identity.startsWith(
            "pickup:"
          )
        ) {
          const pickupPointId =
            identity.slice(
              "pickup:".length
            );

          name =
            pickupTitleById.get(
              pickupPointId
            ) ||
            "Точка самовывоза";

          type =
            "pickup";
        } else if (
          identity ===
          "delivery:courier"
        ) {
          name =
            "Доставка — Варшава";

          type =
            "courier";
        } else if (
          identity ===
          "delivery:inpost"
        ) {
          name =
            "InPost / Польша";

          type =
            "inpost";
        }

        return {
          id:
            identity,

          name,

          type,

          revenue,

          previousRevenue:
            hasComparison
              ? previousRevenue
              : null,

          revenueChange:
            hasComparison
              ? percentChange(
                  revenue,
                  previousRevenue
                )
              : null,

          orders,

          previousOrders:
            hasComparison
              ? previousOrdersCount
              : null,

          ordersChange:
            hasComparison
              ? percentChange(
                  orders,
                  previousOrdersCount
                )
              : null,

          averageCheck,

          previousAverageCheck:
            hasComparison
              ? previousAverageCheck
              : null,

          averageCheckChange:
            hasComparison
              ? percentChange(
                  averageCheck,
                  previousAverageCheck
                )
              : null,

          customers:
            currentRow
              .customers.size,

          cancellations,

          cancellationsPercent,

          previousCancellationsPercent:
            hasComparison
              ? previousCancellationsPercent
              : null,

          cancellationsChangePoints:
            hasComparison
              ? percentagePoints(
                  cancellationsPercent,
                  previousCancellationsPercent
                )
              : null,

          repeatCustomers:
            repeat
              .repeatBuyers,

          repeatPercent:
            repeat.percent,

          previousRepeatPercent:
            hasComparison
              ? previousRepeat
                  .percent
              : null,

          repeatChangePoints:
            hasComparison
              ? percentagePoints(
                  repeat.percent,
                  previousRepeat
                    .percent
                )
              : null,
        };
      }
    );

  rows.sort(
    (a, b) =>
      b.revenue -
      a.revenue
  );

  return {
    rows,
  };
}
