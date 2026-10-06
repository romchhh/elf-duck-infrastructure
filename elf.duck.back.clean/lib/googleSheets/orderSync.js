import Order from "../../models/Order.js";
import PickupPoint from "../../models/PickupPoint.js";
import { getOrderStatsDayKey } from "../server/helpers/orderStatsDay.js";
import { applyAssortmentDelta } from "./assortmentGrid.js";
import { reportTabTitleForDayKey } from "./dailyReportGrid.js";
import {
  isGoogleSheetsEnabled,
  resolveSpreadsheetIdForPointKey,
} from "./config.js";
import {
  getStatsSheetProductTitle,
} from "../server/helpers/chunk09.js";

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

/**
 * Per-order Google Sheets: only АССОРТИМЕНТ.
 * Day/month tier columns and СКИДКИ — evening sync (writeDayBlockFromAggregates).
 */
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

  const dayKey = getOrderStatsDayKey(order);
  const tabTitle = reportTabTitleForDayKey(dayKey);
  const sign = direction === "reverse" ? 1 : -1;

  const results = [];

  for (const row of order?.items || []) {
    const modelName = getStatsSheetProductTitle(row);

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

  const failed = results.filter((r) => r.assortmentResult && r.assortmentResult.ok === false);

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

  if (!options?.dryRun && !options?.force) {
    const claimed = await Order.findOneAndUpdate(
      {
        _id: order._id,
        $or: [
          { googleSheetSync: { $exists: false } },
          { "googleSheetSync.appliedAt": { $exists: false } },
          { "googleSheetSync.appliedAt": null },
        ],
        "googleSheetSync.syncInProgress": { $ne: true },
      },
      {
        $set: {
          "googleSheetSync.syncInProgress": true,
          "googleSheetSync.lastError": "",
        },
      }
    );
    if (!claimed) {
      const fresh = await Order.findById(order._id).lean();
      if (fresh?.googleSheetSync?.appliedAt) {
        return { ok: true, reason: "ALREADY_APPLIED" };
      }
      return { ok: false, reason: "SYNC_IN_PROGRESS_OR_CLAIM_FAILED" };
    }
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
            syncInProgress: false,
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
            syncInProgress: false,
            lastError: JSON.stringify(result).slice(0, 500),
          },
        },
      }
    );
  }

  return result;
}

/** Після «виконано»: асортимент (склад) у Google Sheets, один раз на замовлення. */
export function ensureGoogleSheetAssortmentForCompletedOrder(order) {
  if (!order?._id || !isGoogleSheetsEnabled()) return;

  const status = String(order?.status || "")
    .trim()
    .toLowerCase();
  if (status !== "completed" && status !== "done") return;

  if (order?.googleSheetSync?.appliedAt && !order?.googleSheetSync?.reversedAt) {
    return;
  }

  queueGoogleSheetApplyForOrder(order);
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
      })
      .then((result) => {
        if (result && result.ok === false) {
          console.error("[googleSheets] applyOrder failed:", {
            orderId: String(order._id || ""),
            orderNo: String(order?.orderNo || ""),
            result,
          });
        }
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
