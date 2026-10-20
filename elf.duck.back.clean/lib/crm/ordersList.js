import Order from "../../models/Order.js";
import { getCrmOrderDateExpression } from "./orderDate.js";

function escapeRegex(raw) {
  return String(raw || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Paginated CRM orders for a period — filter + skip/limit in MongoDB, not in Node memory.
 */
const ORDER_SORT_FIELDS = {
  date: { crmOrderDate: -1, createdAt: -1 },
  amount: { totalZl: -1, crmOrderDate: -1 },
  status: { status: 1, crmOrderDate: -1 },
  orderNo: { orderNo: 1, crmOrderDate: -1 },
  payment: { "payment.method": 1, crmOrderDate: -1 },
  delivery: { deliveryType: 1, crmOrderDate: -1 },
};

export async function fetchCrmOrdersPage({
  range,
  page = 1,
  limit = 50,
  search = "",
  sortKey = "",
  sortDirection = "desc",
}) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 50));
  const skip = (safePage - 1) * safeLimit;
  const searchRaw = String(search || "")
    .trim()
    .toLowerCase()
    .replace(/^@+/, "");

  const dateMatch = {
    crmOrderDate: {
      $gte: range.from,
      $lt: range.to,
    },
  };

  // Index-friendly prefilter before computing crmOrderDate on the whole collection.
  const dateBoundsPrefilter = {
    $or: [
      {
        createdAt: {
          $gte: range.from,
          $lt: range.to,
        },
      },
      {
        completedAt: {
          $gte: range.from,
          $lt: range.to,
        },
      },
      {
        shippedAt: {
          $gte: range.from,
          $lt: range.to,
        },
      },
      {
        canceledAt: {
          $gte: range.from,
          $lt: range.to,
        },
      },
      {
        annulledAt: {
          $gte: range.from,
          $lt: range.to,
        },
      },
    ],
  };

  const afterDateStages = [{ $match: dateMatch }];

  if (searchRaw) {
    const regex = escapeRegex(searchRaw);
    afterDateStages.push(
      {
        $lookup: {
          from: "users",
          localField: "userTelegramId",
          foreignField: "telegramId",
          as: "crmUser",
        },
      },
      {
        $unwind: {
          path: "$crmUser",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $match: {
          $or: [
            { orderNo: { $regex: regex, $options: "i" } },
            { userTelegramId: { $regex: regex, $options: "i" } },
            { "crmUser.username": { $regex: regex, $options: "i" } },
            { "crmUser.firstName": { $regex: regex, $options: "i" } },
            { "crmUser.lastName": { $regex: regex, $options: "i" } },
            { "items.productTitle1": { $regex: regex, $options: "i" } },
            { "items.productTitle2": { $regex: regex, $options: "i" } },
          ],
        },
      }
    );
  }

  const basePipeline = [
    { $match: dateBoundsPrefilter },
    { $addFields: { crmOrderDate: getCrmOrderDateExpression() } },
    ...afterDateStages,
  ];

  const direction = sortDirection === "asc" ? 1 : -1;
  const defaultSort = { crmOrderDate: -1, createdAt: -1 };
  let mongoSort = defaultSort;

  if (sortKey && ORDER_SORT_FIELDS[sortKey]) {
    const template = ORDER_SORT_FIELDS[sortKey];
    mongoSort = Object.fromEntries(
      Object.entries(template).map(([field, value], index) => [
        field,
        index === 0 ? direction * Math.sign(value || 1) || direction : value,
      ])
    );
  }

  const [facetResult, periodCountResult] = await Promise.all([
    Order.aggregate([
      ...basePipeline,
      { $sort: mongoSort },
      {
        $facet: {
          meta: [{ $count: "total" }],
          rows: [
            { $skip: skip },
            { $limit: safeLimit },
            {
              $project: {
                orderNo: 1,
                userTelegramId: 1,
                items: 1,
                totalZl: 1,
                status: 1,
                payment: 1,
                deliveryType: 1,
                deliveryMethod: 1,
                pickupPointId: 1,
                courierDistrict: 1,
                crmOrderDate: 1,
                createdAt: 1,
              },
            },
          ],
        },
      },
    ]).option({ allowDiskUse: true }),
    Order.aggregate([
      { $match: dateBoundsPrefilter },
      { $addFields: { crmOrderDate: getCrmOrderDateExpression() } },
      { $match: dateMatch },
      { $count: "total" },
    ]).option({ allowDiskUse: true }),
  ]);

  const facet = facetResult?.[0] || {};
  const total = Number(facet?.meta?.[0]?.total || 0);
  const rows = Array.isArray(facet?.rows) ? facet.rows : [];
  const periodTotal = Number(periodCountResult?.[0]?.total || 0);

  const pageCount = Math.max(1, Math.ceil(total / safeLimit));
  const safePageClamped = Math.min(safePage, pageCount);

  return {
    orders: rows,
    pagination: {
      page: safePageClamped,
      limit: safeLimit,
      total,
      pageCount,
    },
    periodTotal,
  };
}
