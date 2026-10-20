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

/**
 * Грубый pre-filter по индексируемым датам до точного crmSaleDate.
 * Может захватить чуть больше строк — точный $match после $addFields отсечёт лишнее.
 */
export function getCompletedSaleDateBoundsMatch(from, to) {
  const bounds = {};
  if (from) bounds.$gte = from;
  if (to) bounds.$lt = to;

  if (!Object.keys(bounds).length) {
    return null;
  }

  return {
    $or: [
      { completedAt: bounds },
      { shippedAt: bounds },
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

/** Slim items: product identity + qty/price only (без stock/labels). */
function getSlimItemsProjection() {
  return {
    $map: {
      input: { $ifNull: ["$items", []] },
      as: "it",
      in: {
        productKey: "$$it.productKey",
        productId: "$$it.productId",
        productTitle1: "$$it.productTitle1",
        productTitle2: "$$it.productTitle2",
        orderImgUrl: "$$it.orderImgUrl",
        flavors: {
          $map: {
            input: { $ifNull: ["$$it.flavors", []] },
            as: "fl",
            in: {
              qty: "$$fl.qty",
              unitPrice: "$$fl.unitPrice",
            },
          },
        },
      },
    },
  };
}

function buildCompletedSalesPipeline(from, to, projectStage) {
  const matchStage = {
    ...getCompletedOrderMatch(),
  };

  const bounds = getCompletedSaleDateBoundsMatch(from, to);
  if (bounds) {
    Object.assign(matchStage, {
      $and: [
        { $or: matchStage.$or },
        bounds,
      ],
    });
    delete matchStage.$or;
  }

  const dateMatch = { crmSaleDate: {} };
  if (from) dateMatch.crmSaleDate.$gte = from;
  if (to) dateMatch.crmSaleDate.$lt = to;

  return [
    { $match: matchStage },
    {
      $addFields: {
        crmSaleDate: getSaleDateExpression(),
      },
    },
    { $match: dateMatch },
    { $project: projectStage },
  ];
}

/**
 * @param {Date} from
 * @param {Date} to
 * @param {{ slimItems?: boolean }} [options] — default true
 */
export async function loadSales(from, to, options = {}) {
  const slimItems = options?.slimItems !== false;

  const projectStage = {
    userTelegramId: 1,
    totalZl: 1,
    payment: 1,
    crmSaleDate: 1,
    deliveryType: 1,
    deliveryMethod: 1,
    pickupPointId: 1,
    items: slimItems ? getSlimItemsProjection() : 1,
  };

  return Order.aggregate(
    buildCompletedSalesPipeline(from, to, projectStage)
  ).option({ allowDiskUse: true });
}

/** KPI без items — для списка заказов. */
export async function loadSalesKpis(from, to) {
  const rows = await Order.aggregate([
    ...buildCompletedSalesPipeline(from, to, {
      totalZl: 1,
    }),
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        revenue: { $sum: { $ifNull: ["$totalZl", 0] } },
      },
    },
  ]).option({ allowDiskUse: true });

  const count = Number(rows?.[0]?.count || 0);
  const revenue = Number(Number(rows?.[0]?.revenue || 0).toFixed(2));

  return { count, revenue };
}

/**
 * Агреговані метрики клієнтів до `to` (без масиву всіх ордерів у Node).
 * @param {Date} to
 * @param {{ telegramIds?: string[], from?: Date }} [options]
 *   from — для purchasesInPeriod / revenueInPeriod
 */
export async function buildCustomerSalesStats(to, options = {}) {
  const telegramIds = Array.isArray(options?.telegramIds)
    ? options.telegramIds
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    : null;

  const from = options?.from || null;

  const matchStage = {
    ...getCompletedOrderMatch(),
  };

  const bounds = getCompletedSaleDateBoundsMatch(null, to);
  if (bounds) {
    Object.assign(matchStage, {
      $and: [
        { $or: matchStage.$or },
        bounds,
      ],
    });
    delete matchStage.$or;
  }

  if (telegramIds?.length) {
    matchStage.userTelegramId = { $in: telegramIds };
  }

  const pipeline = [
    { $match: matchStage },
    {
      $addFields: {
        crmSaleDate: getSaleDateExpression(),
      },
    },
    {
      $match: {
        crmSaleDate: { $lt: to },
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
      // No $sort / $push saleDates — interval = (last−first)/(n−1).
      $group: {
        _id: "$userTelegramId",
        ltv: { $sum: { $ifNull: ["$totalZl", 0] } },
        purchases: { $sum: 1 },
        firstSaleAt: { $min: "$crmSaleDate" },
        lastSaleAt: { $max: "$crmSaleDate" },
        revenueInPeriod: from
          ? {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $gte: ["$crmSaleDate", from] },
                      { $lt: ["$crmSaleDate", to] },
                    ],
                  },
                  { $ifNull: ["$totalZl", 0] },
                  0,
                ],
              },
            }
          : { $sum: 0 },
        purchasesInPeriod: from
          ? {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $gte: ["$crmSaleDate", from] },
                      { $lt: ["$crmSaleDate", to] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            }
          : { $sum: 0 },
      },
    },
  ];

  const grouped = await Order.aggregate(pipeline).option({
    allowDiskUse: true,
  });

  const map = new Map();

  for (const row of grouped) {
    const telegramId = String(row?._id || "").trim();
    if (!telegramId) continue;

    map.set(telegramId, {
      ltv: Number(Number(row?.ltv || 0).toFixed(2)),
      purchases: Number(row?.purchases || 0),
      firstSaleAt: row?.firstSaleAt || null,
      lastSaleAt: row?.lastSaleAt || null,
      revenueInPeriod: Number(
        Number(row?.revenueInPeriod || 0).toFixed(2)
      ),
      purchasesInPeriod: Number(row?.purchasesInPeriod || 0),
    });
  }

  return map;
}

/**
 * Перші продажі лише для заданих telegramId (дешево vs повний loadFirstSales).
 */
export async function loadFirstSalesForUsers(telegramIds = []) {
  const ids = [
    ...new Set(
      (telegramIds || [])
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    ),
  ];

  if (!ids.length) {
    return [];
  }

  return Order.aggregate([
    {
      $match: {
        ...getCompletedOrderMatch(),
        userTelegramId: { $in: ids },
      },
    },
    {
      $addFields: {
        crmSaleDate: getSaleDateExpression(),
      },
    },
    {
      $group: {
        _id: "$userTelegramId",
        firstSaleAt: { $min: "$crmSaleDate" },
      },
    },
  ]).option({ allowDiskUse: true });
}

/**
 * @deprecated use buildCustomerSalesStats
 * Compatibility: Map telegramId -> [{ totalZl, crmSaleDate }, ...]
 * (totalZl only on first row as LTV placeholder is NOT preserved — prefer stats API)
 */
export async function buildSalesByCustomerMap(to, options = {}) {
  return buildCustomerSalesStats(to, options);
}

/**
 * Історія завершених продажів до `to`.
 * options.telegramIds — обмежити клієнтами (дашборд: лише хто купив у періоді).
 * options.slimItems — без важких полів смаків (дашборд ~10× швидше).
 * Без telegramIds тягне ВСЮ історію → 502 на CRM dashboard.
 */
export async function loadSalesHistory(to, options = {}) {
  const telegramIds = Array.isArray(options?.telegramIds)
    ? [...new Set(
        options.telegramIds
          .map((id) => String(id || "").trim())
          .filter(Boolean)
      )]
    : null;

  if (telegramIds && telegramIds.length === 0) {
    return [];
  }

  const matchStage = {
    ...getCompletedOrderMatch(),
  };

  const bounds = getCompletedSaleDateBoundsMatch(
    options?.from || null,
    to
  );
  if (bounds) {
    Object.assign(matchStage, {
      $and: [
        { $or: matchStage.$or },
        bounds,
      ],
    });
    delete matchStage.$or;
  }

  if (telegramIds) {
    matchStage.userTelegramId = { $in: telegramIds };
  }

  const dateMatch = {
    crmSaleDate: {
      $lt: to,
    },
  };

  if (options?.from) {
    dateMatch.crmSaleDate.$gte = options.from;
  }

  const slimItems = Boolean(options?.slimItems);
  const projectStage = slimItems
    ? {
        userTelegramId: 1,
        totalZl: 1,
        crmSaleDate: 1,
        deliveryType: 1,
        deliveryMethod: 1,
        pickupPointId: 1,
        items: {
          $map: {
            input: { $ifNull: ["$items", []] },
            as: "it",
            in: {
              productKey: "$$it.productKey",
              productId: "$$it.productId",
              flavors: {
                $map: {
                  input: { $ifNull: ["$$it.flavors", []] },
                  as: "fl",
                  in: { qty: "$$fl.qty" },
                },
              },
            },
          },
        },
      }
    : {
        userTelegramId: 1,
        totalZl: 1,
        payment: 1,
        crmSaleDate: 1,
        items: 1,
        deliveryType: 1,
        deliveryMethod: 1,
        pickupPointId: 1,
      };

  const rows = await Order.aggregate([
    {
      $match: matchStage,
    },

    {
      $addFields: {
        crmSaleDate:
          getSaleDateExpression(),
      },
    },

    {
      $match: dateMatch,
    },

    {
      $project: projectStage,
    },
  ]).option({ allowDiskUse: true });

  rows.sort((a, b) => {
    const ua = String(a?.userTelegramId || "");
    const ub = String(b?.userTelegramId || "");
    if (ua !== ub) return ua.localeCompare(ub);
    return (
      new Date(a?.crmSaleDate || 0).getTime() -
      new Date(b?.crmSaleDate || 0).getTime()
    );
  });

  return rows;
}

export async function loadCanceledCount(from, to) {
  const rows = await Order.aggregate([
    {
      $match: {
        status: {
          $in: ["canceled", "annulled"],
        },
        $or: [
          {
            canceledAt: {
              ...(from ? { $gte: from } : {}),
              ...(to ? { $lt: to } : {}),
            },
          },
          {
            annulledAt: {
              ...(from ? { $gte: from } : {}),
              ...(to ? { $lt: to } : {}),
            },
          },
        ],
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
        $or: [
          {
            canceledAt: {
              ...(from ? { $gte: from } : {}),
              ...(to ? { $lt: to } : {}),
            },
          },
          {
            annulledAt: {
              ...(from ? { $gte: from } : {}),
              ...(to ? { $lt: to } : {}),
            },
          },
        ],
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
