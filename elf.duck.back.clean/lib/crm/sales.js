import Order from "../../models/Order.js";

export function getCompletedOrderMatch() {
  return {
    $or: [
      // Самовывоз
      {
        deliveryType: "pickup",
        status: "completed",
        completedAt: {
          $type: "date",
        },
      },

      // Курьер
      {
        deliveryType: "delivery",
        deliveryMethod: "courier",
        status: "completed",
        completedAt: {
          $type: "date",
        },
      },

      // InPost
      {
        deliveryType: "delivery",
        deliveryMethod: "inpost",
        status: "shipped",
        shippedAt: {
          $type: "date",
        },
      },
    ],
  };
}

export function getSaleDateExpression() {
  return {
    $cond: [
      {
        $and: [
          {
            $eq: [
              "$deliveryType",
              "delivery",
            ],
          },
          {
            $eq: [
              "$deliveryMethod",
              "inpost",
            ],
          },
          {
            $eq: [
              "$status",
              "shipped",
            ],
          },
        ],
      },

      "$shippedAt",

      "$completedAt",
    ],
  };
}

export async function loadSales(
  from,
  to
) {
  return Order.aggregate([
    {
      $match:
        getCompletedOrderMatch(),
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
          $gte: from,
          $lt: to,
        },
      },
    },

    {
        $project: {
            userTelegramId: 1,
            totalZl: 1,
            crmSaleDate: 1,
            items: 1,
            deliveryType: 1,
            deliveryMethod: 1,
            pickupPointId: 1,
        },
    },
  ]);
}

export async function loadSalesHistory(to) {
  return Order.aggregate([
    {
      $match:
        getCompletedOrderMatch(),
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
          $lt: to,
        },
      },
    },

    {
    $project: {
        userTelegramId: 1,
        totalZl: 1,
        crmSaleDate: 1,
        items: 1,
        deliveryType: 1,
        deliveryMethod: 1,
        pickupPointId: 1,
    },
    },

    {
      $sort: {
        userTelegramId: 1,
        crmSaleDate: 1,
      },
    },
  ]);
}

export async function loadCanceledCount(from, to) {
  const rows = await Order.aggregate([
    {
      $match: {
        status: {
          $in: ["canceled", "annulled"],
        },
      },
    },
    {
      $addFields: {
        crmCanceledAt: {
          $cond: [
            {
              $eq: ["$status", "annulled"],
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
          $gte: from,
          $lt: to,
        },
      },
    },
    {
      $count: "count",
    },
  ]);

  return Number(rows?.[0]?.count || 0);
}

export async function loadCanceledOrders(
  from,
  to
) {
  return Order.aggregate([
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
          $gte: from,
          $lt: to,
        },
      },
    },

    {
      $project: {
        userTelegramId: 1,
        crmCanceledAt: 1,
        deliveryType: 1,
        deliveryMethod: 1,
        pickupPointId: 1,
      },
    },
  ]);
}
