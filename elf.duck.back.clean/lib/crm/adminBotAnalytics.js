import User from "../../models/User.js";
import PickupPoint from "../../models/PickupPoint.js";
import {
  loadSales,
  loadCanceledCount,
  loadCanceledOrders,
} from "./sales.js";
import { getPeriodRange } from "./datetime.js";
import {
  buildMetrics,
  loadFirstSales,
  percentChange,
} from "./analytics/metrics.js";
import { collectProductSales } from "./analytics/products.js";
import { collectLocationSales } from "./analytics/locations.js";
import {
  resolveManagerAnalyticsScope,
  filterOrdersForAnalyticsScope,
} from "./adminBotAnalyticsScope.js";
import { getOrderKasaPlnZl } from "../server/helpers/chunk08.js";

const adminBotRevenueOptions = {
  getRevenue: getOrderKasaPlnZl,
};

const PERIOD_LABELS = {
  today: "Сегодня",
  week: "Текущая неделя",
  month: "Текущий месяц",
};

function productTitle(row) {
  return [row?.productTitle1, row?.productTitle2]
    .filter(Boolean)
    .join(" ")
    .trim() || row?.productKey || "—";
}

async function resolveLocationLabels() {
  const points = await PickupPoint.find({}, { title: 1, key: 1 }).lean();
  const byId = new Map();
  for (const p of points) {
    byId.set(String(p._id), String(p.title || p.key || "Точка"));
  }
  return {
    "delivery:courier": "Курьер",
    "delivery:inpost": "InPost",
    other: "Другое",
    byId,
  };
}

function locationLabel(identity, labels) {
  if (identity.startsWith("pickup:")) {
    const id = identity.slice("pickup:".length);
    return labels.byId.get(id) || `Самовывоз ${id.slice(-6)}`;
  }
  return labels[identity] || identity;
}

export async function getAdminBotAnalytics(
  period = "today",
  options = {}
) {
  const telegramId = String(options?.telegramId || "").trim();
  const scope = await resolveManagerAnalyticsScope(telegramId);

  const range = getPeriodRange(period, "", "");
  const periodKey = range.key || String(period || "today").toLowerCase();

  const firstSales = await loadFirstSales();
  const firstSaleByUser = new Map(
    firstSales.map((row) => [
      String(row?._id || "").trim(),
      row?.firstSaleAt ? new Date(row.firstSaleAt) : null,
    ])
  );

  const [
    currentOrders,
    previousOrders,
    currentCanceled,
    previousCanceled,
    usersTotal,
    usersNewInPeriod,
  ] = await Promise.all([
    loadSales(range.from, range.to),
    loadSales(range.previousFrom, range.previousTo),
    loadCanceledCount(range.from, range.to),
    loadCanceledCount(range.previousFrom, range.previousTo),
    User.countDocuments({
      telegramId: { $exists: true, $ne: "" },
    }),
    User.countDocuments({
      telegramId: { $exists: true, $ne: "" },
      createdAt: { $gte: range.from, $lt: range.to },
    }),
  ]);

  let scopedCurrentCanceled = currentCanceled;
  let scopedPreviousCanceled = previousCanceled;

  if (scope) {
    currentOrders = filterOrdersForAnalyticsScope(
      currentOrders,
      scope
    );
    previousOrders = filterOrdersForAnalyticsScope(
      previousOrders,
      scope
    );

    const [canceledCurrentRows, canceledPreviousRows] =
      await Promise.all([
        loadCanceledOrders(range.from, range.to),
        loadCanceledOrders(
          range.previousFrom,
          range.previousTo
        ),
      ]);

    scopedCurrentCanceled = filterOrdersForAnalyticsScope(
      canceledCurrentRows,
      scope
    ).length;
    scopedPreviousCanceled = filterOrdersForAnalyticsScope(
      canceledPreviousRows,
      scope
    ).length;
  }

  const metrics = buildMetrics(
    currentOrders,
    range.from,
    range.to,
    scopedCurrentCanceled,
    firstSaleByUser,
    adminBotRevenueOptions
  );

  const previousMetrics = buildMetrics(
    previousOrders,
    range.previousFrom,
    range.previousTo,
    scopedPreviousCanceled,
    firstSaleByUser,
    adminBotRevenueOptions
  );

  const productSales = collectProductSales(currentOrders);
  const topProducts = Array.from(productSales.values())
    .sort((a, b) => b.sold - a.sold)
    .slice(0, 5)
    .map((row) => ({
      title: productTitle(row),
      sold: row.sold,
      revenue: Number(row.revenue || 0).toFixed(2),
    }));

  const locationLabels = await resolveLocationLabels();
  const locationSales = collectLocationSales(
    currentOrders,
    adminBotRevenueOptions
  );
  const topLocations = Array.from(locationSales.entries())
    .map(([identity, row]) => ({
      title: locationLabel(identity, locationLabels),
      orders: row.orders,
      revenue: Number(row.revenue || 0).toFixed(2),
    }))
    .sort((a, b) => b.orders - a.orders)
    .slice(0, 5);

  return {
    period: periodKey,
    periodLabel: PERIOD_LABELS[periodKey] || PERIOD_LABELS.month,
    scope: scope
      ? {
          labels: scope.labels,
          scopedToManager: true,
        }
      : null,
    range: {
      from: range.from.toISOString(),
      to: range.to.toISOString(),
    },
    users: scope
      ? {
          total: null,
          newInPeriod: null,
          scopedToManager: true,
        }
      : {
          total: usersTotal,
          newInPeriod: usersNewInPeriod,
        },
    metrics,
    previousMetrics,
    deltas: {
      revenuePct: percentChange(metrics.revenue, previousMetrics.revenue),
      ordersPct: percentChange(metrics.orders, previousMetrics.orders),
      averageCheckPct: percentChange(
        metrics.averageCheck,
        previousMetrics.averageCheck
      ),
      customersPct: percentChange(
        metrics.customers,
        previousMetrics.customers
      ),
    },
    topProducts,
    topLocations,
  };
}
