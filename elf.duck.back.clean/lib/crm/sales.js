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
            payment: 1,
            crmSaleDate: 1,
            items: 1,
            deliveryType: 1,
            deliveryMethod: 1,
            pickupPointId: 1,
        },
    },
  ]);
}

/**
 * Завершені продажі по клієнтах (групування в Mongo, без завантаження всіх orders у Node).
 * @param {Date} to — верхня межа crmSaleDate (не включно)
 * @param {{ telegramIds?: string[] }} [options] — обмежити вибірку (напр. «Избранные»)
 */
export async function buildSalesByCustomerMap(
  to,
  options = {}
) {
  const telegramIds = Array.isArray(
    options?.telegramIds
  )
    ? options.telegramIds
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    : null;

  const pipeline = [
    {
      $match: getCompletedOrderMatch(),
    },
    {
      $addFields: {
        crmSaleDate: getSaleDateExpression(),
      },
    },
    {
      $match: {
        crmSaleDate: {
          $lt: to,
        },
      },
    },
  ];

  if (telegramIds?.length) {
    pipeline.push({
      $match: {
        userTelegramId: {
          $in: telegramIds,
        },
      },
    });
  }

  pipeline.push(
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
    {
      $group: {
        _id: "$userTelegramId",
        orders: {
          $push: {
            userTelegramId: "$userTelegramId",
            totalZl: "$totalZl",
            crmSaleDate: "$crmSaleDate",
          },
        },
      },
    }
  );

  const grouped = await Order.aggregate(pipeline);
  const map = new Map();

  for (const row of grouped) {
    const telegramId = String(row?._id || "").trim();
    if (!telegramId) {
      continue;
    }

    map.set(
      telegramId,
      Array.isArray(row?.orders) ? row.orders : []
    );
  }

  return map;
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
        payment: 1,
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
