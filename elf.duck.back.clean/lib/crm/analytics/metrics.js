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


export async function loadFirstSales() {
  return Order.aggregate([
    {
      $match: getCompletedOrderMatch(),
    },
    {
      $addFields: {
        crmSaleDate: getSaleDateExpression(),
      },
    },
    {
      $sort: {
        crmSaleDate: 1,
      },
    },
    {
      $group: {
        _id: "$userTelegramId",
        firstSaleAt: {
          $first: "$crmSaleDate",
        },
      },
    },
  ]);
}

export function percentagePoints(current, previous) {
  return Number(
    (
      Number(current || 0) -
      Number(previous || 0)
    ).toFixed(1)
  );
}

export function valueDifference(
  current,
  previous,
  digits = 0
) {
  return Number(
    (
      Number(current || 0) -
      Number(previous || 0)
    ).toFixed(digits)
  );
}

export function buildMetrics(
  orders,
  from,
  to,
  canceledCount,
  firstSaleByUser,
  options = {}
) {
  const getRevenue =
    typeof options.getRevenue === "function"
      ? options.getRevenue
      : (order) => Number(order?.totalZl || 0);

  const ordersCount = orders.length;

  const revenue = Number(
    orders
      .reduce(
        (sum, order) =>
          sum + Number(getRevenue(order) || 0),
        0
      )
      .toFixed(2)
  );

  const averageCheck =
    ordersCount > 0
      ? Number(
          (revenue / ordersCount).toFixed(2)
        )
      : 0;

  const ordersByCustomer = new Map();

  for (const order of orders) {
    const telegramId = String(
      order?.userTelegramId || ""
    ).trim();

    if (!telegramId) continue;

    ordersByCustomer.set(
      telegramId,
      Number(
        ordersByCustomer.get(telegramId) || 0
      ) + 1
    );
  }

  const customerIds = Array.from(
    ordersByCustomer.keys()
  );

  const newCustomerIds = customerIds.filter(
    (telegramId) => {
      const firstSaleAt =
        firstSaleByUser.get(telegramId);

      return Boolean(
        firstSaleAt &&
          firstSaleAt >= from &&
          firstSaleAt < to
      );
    }
  );

  const repeatCustomerIds =
    customerIds.filter((telegramId) => {
      const firstSaleAt =
        firstSaleByUser.get(telegramId);

      const ordersInPeriod = Number(
        ordersByCustomer.get(telegramId) || 0
      );

      return Boolean(
        firstSaleAt &&
          (
            firstSaleAt < from ||
            ordersInPeriod >= 2
          )
      );
    });

  const customersCount =
    customerIds.length;

  const newCustomersPercent =
    customersCount > 0
      ? Number(
          (
            (newCustomerIds.length /
              customersCount) *
            100
          ).toFixed(1)
        )
      : 0;

  const repeatCustomersPercent =
    customersCount > 0
      ? Number(
          (
            (repeatCustomerIds.length /
              customersCount) *
            100
          ).toFixed(1)
        )
      : 0;

  const finalOrdersCount =
    ordersCount +
    Number(canceledCount || 0);

  const cancellationsPercent =
    finalOrdersCount > 0
      ? Number(
          (
            (Number(canceledCount || 0) /
              finalOrdersCount) *
            100
          ).toFixed(1)
        )
      : 0;

  return {
    revenue,
    orders: ordersCount,
    averageCheck,
    customers: customersCount,

    newCustomers:
      newCustomerIds.length,

    newCustomersPercent,

    repeatCustomers:
      repeatCustomerIds.length,

    repeatCustomersPercent,

    cancellations:
      Number(canceledCount || 0),

    cancellationsPercent,
  };
}

export function percentChange(
  current,
  previous
) {
  const currentValue =
    Number(current || 0);

  const previousValue =
    Number(previous || 0);

  if (previousValue === 0) {
    if (currentValue === 0) {
      return 0;
    }

    return 100;
  }

  return Number(
    (
      ((currentValue -
        previousValue) /
        previousValue) *
      100
    ).toFixed(1)
  );
}
