import Order from "../../models/Order.js";
import PickupPoint from "../../models/PickupPoint.js";
import { getOrderKasaPlnZl, getWarsawDayKey } from "../server/helpers/chunk08.js";
import {
  getStatsSheetProductQty,
  getStatsSheetProductTitle,
  getStatsSheetTierQty,
} from "../server/helpers/chunk09.js";
function getStatsSheetTierKeyFromQty(qty) {
  const n = Math.max(0, Number(qty || 0));
  if (n >= 5) return "tier5";
  if (n >= 3) return "tier34";
  if (n >= 2) return "tier2";
  return "tier1";
}
import { applyAssortmentDelta } from "./assortmentGrid.js";
import {
  applyDayBlockTotalsDelta,
  applyMonthItogoDelta,
  applyReportModelDelta,
  reportTabTitleForDayKey,
} from "./dailyReportGrid.js";
import {
  isGoogleSheetsEnabled,
  resolveSpreadsheetIdForPointKey,
} from "./config.js";
import {
  normalizeSheetModelName,
  toReportModelLabel,
} from "./normalize.js";

async function resolveOrderPointKey(order) {
  if (!order) return "";

  const explicitKey = String(order?.pickupPointKey || "")
    .trim()
    .toLowerCase()
    .replace(/,+$/, "");
  if (explicitKey) return explicitKey;

  if (order.deliveryType === "pickup" && order.pickupPointId) {
    const point = await PickupPoint.findById(order.pickupPointId).lean();
    return String(point?.key || "")
      .trim()
      .toLowerCase()
      .replace(/,+$/, "");
  }

  if (order.deliveryType === "delivery") {
    const deliveryKey =
      order.deliveryMethod === "inpost" ? "delivery-2" : "delivery";
    return deliveryKey;
  }

  return "";
}

export async function runGoogleSheetsOrderSync(order, options = {}) {
  const direction = options?.direction === "reverse" ? "reverse" : "apply";

  if (direction === "reverse") {
    return syncOrderItems(order, { direction: "reverse", dryRun: options?.dryRun });
  }

  return syncOrderItems(order, { direction: "apply", dryRun: options?.dryRun });
}

async function syncOrderItems(order, { direction, dryRun = false }) {
  const pointKey = await resolveOrderPointKey(order);
  const spreadsheetId = resolveSpreadsheetIdForPointKey(pointKey);

  if (!spreadsheetId) {
    return { ok: false, reason: "NO_SPREADSHEET_FOR_POINT", pointKey };
  }

  let pointLabel = String(pointKey || "");

  if (!order?.pickupPointKey && pointKey) {
    const point = await PickupPoint.findOne({
      key: { $in: [pointKey, `${pointKey},`] },
    }).lean();
    pointLabel = String(point?.title || pointKey || "");
  }
  const dayKey = getWarsawDayKey(order?.stockCommittedAt || order?.createdAt);
  const tabTitle = reportTabTitleForDayKey(dayKey);
  const sign = direction === "reverse" ? 1 : -1;
  const reportSign = direction === "reverse" ? -1 : 1;

  const results = [];
  const tierDeltas = { tier1: 0, tier2: 0, tier34: 0, tier5: 0 };
  let soldUnitsDelta = 0;

  for (const row of order?.items || []) {
    const modelName = getStatsSheetProductTitle(row);
    const normalizedModel = normalizeSheetModelName(modelName);
    const reportModel = toReportModelLabel(normalizedModel);

    const soldQty = getStatsSheetProductQty(row);
    if (soldQty <= 0) continue;

    const tierQty = getStatsSheetTierQty(order, row);
    const tierKey = getStatsSheetTierKeyFromQty(tierQty);

    soldUnitsDelta += reportSign * soldQty;
    tierDeltas[tierKey] =
      Number(tierDeltas[tierKey] || 0) + reportSign * soldQty;

    const reportResult = await applyReportModelDelta({
      spreadsheetId,
      tabTitle,
      dayKey,
      reportModelLabel: reportModel,
      soldQty: reportSign * soldQty,
      tierKey,
      dryRun,
    });

    results.push({ kind: "report", reportResult });

    for (const flavor of row?.flavors || []) {
      const flavorQty = Math.max(0, Number(flavor?.qty || 0));
      if (!flavorQty) continue;

      const assortmentResult = await applyAssortmentDelta({
        spreadsheetId,
        pointLabel,
        dayKey,
        modelName,
        productKey: row?.productKey,
        flavorLabel:
          flavor?.flavorLabel || flavor?.label || flavor?.flavorKey || "",
        deltaQty: sign * flavorQty,
        dryRun,
      });

      results.push({ kind: "assortment", assortmentResult });
    }
  }

  const discountsZl = Number(
    (
      Number(order?.payment?.cashbackAppliedZl || 0) +
      Number(order?.payment?.referralFirstOrderDiscountTotalZl || 0)
    ).toFixed(2)
  );

  const kasaZl = Number(getOrderKasaPlnZl(order) || 0);

  const itogoResult = await applyMonthItogoDelta({
    spreadsheetId,
    tabTitle,
    dayKey,
    kasaDeltaZl: reportSign * kasaZl,
    discountsDeltaZl: reportSign * discountsZl,
    soldUnitsDelta,
    tierDeltas,
    dryRun,
  });

  results.push({ kind: "monthItogo", itogoResult });

  const dayTotalsResult = await applyDayBlockTotalsDelta({
    spreadsheetId,
    tabTitle,
    dayKey,
    kasaDeltaZl: reportSign * kasaZl,
    discountsDeltaZl: reportSign * discountsZl,
    soldUnitsDelta,
    tierDeltas,
    dryRun,
  });

  results.push({ kind: "dayKassa", dayTotalsResult });

  const failed = results.filter((r) => {
    const body =
      r.reportResult || r.assortmentResult || r.itogoResult || r.dayTotalsResult;
    return body && body.ok === false;
  });

  return {
    ok: failed.length === 0,
    pointKey,
    spreadsheetId,
    tabTitle,
    dayKey,
    results,
  };
}

export async function applyOrderToGoogleSheets(order, options = {}) {
  if (!isGoogleSheetsEnabled() || !order) {
    return { ok: false, reason: "DISABLED" };
  }

  if (order?.googleSheetSync?.appliedAt && !options?.force) {
    return { ok: true, reason: "ALREADY_APPLIED" };
  }

  const result = await syncOrderItems(order, {
    direction: "apply",
    dryRun: options?.dryRun,
  });

  if (!options?.dryRun && result.ok) {
    await Order.updateOne(
      { _id: order._id },
      {
        $set: {
          googleSheetSync: {
            appliedAt: new Date(),
            reversedAt: null,
            lastError: "",
          },
        },
      }
    );
  } else if (!options?.dryRun && !result.ok) {
    await Order.updateOne(
      { _id: order._id },
      {
        $set: {
          googleSheetSync: {
            appliedAt: order?.googleSheetSync?.appliedAt || null,
            reversedAt: order?.googleSheetSync?.reversedAt || null,
            lastError: JSON.stringify(result).slice(0, 500),
          },
        },
      }
    );
  }

  return result;
}

export async function reverseOrderOnGoogleSheets(order, options = {}) {
  if (!isGoogleSheetsEnabled() || !order) {
    return { ok: false, reason: "DISABLED" };
  }

  if (!order?.googleSheetSync?.appliedAt) {
    return { ok: true, reason: "NOT_APPLIED" };
  }

  if (order?.googleSheetSync?.reversedAt && !options?.force) {
    return { ok: true, reason: "ALREADY_REVERSED" };
  }

  const result = await syncOrderItems(order, {
    direction: "reverse",
    dryRun: options?.dryRun,
  });

  if (!options?.dryRun && result.ok) {
    await Order.updateOne(
      { _id: order._id },
      {
        $set: {
          googleSheetSync: {
            appliedAt: order.googleSheetSync.appliedAt,
            reversedAt: new Date(),
            lastError: "",
          },
        },
      }
    );
  }

  return result;
}

export function queueGoogleSheetApplyForOrder(order) {
  if (!order?._id) return;

  setImmediate(() => {
    Order.findById(order._id)
      .then((fresh) => applyOrderToGoogleSheets(fresh))
      .catch((e) => {
        console.error("[googleSheets] applyOrder error:", e);
      });
  });
}

export function queueGoogleSheetReverseForOrder(order) {
  if (!order?._id) return;

  setImmediate(() => {
    Order.findById(order._id)
      .then((fresh) => reverseOrderOnGoogleSheets(fresh))
      .catch((e) => {
        console.error("[googleSheets] reverseOrder error:", e);
      });
  });
}
