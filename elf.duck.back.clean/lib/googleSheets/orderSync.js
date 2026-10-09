import Order from "../../models/Order.js";
import PickupPoint from "../../models/PickupPoint.js";
import { getOrderStatsDayKey } from "../server/helpers/orderStatsDay.js";
import {
  applyAssortmentDelta,
  buildAssortmentFlavorSearchLabels,
} from "./assortmentGrid.js";
import { reportTabTitleForDayKey } from "./dailyReportGrid.js";
import {
  isGoogleSheetsEnabled,
  resolveSpreadsheetIdForPointKey,
} from "./config.js";
import { getAssortmentSheetModelName } from "../server/helpers/chunk09.js";
import { queueStockPullForPointKey } from "./stockPull.js";
import { logOrderAssortmentSyncSummary } from "./syncErrorsLog.js";

export async function resolveOrderPointKey(order) {
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
 * Per-order Google Sheets: only АССОРТИМЕНТ (склад).
 * ОТЧЁТ (tiers + СКИДКИ) — reportOrderSync.js на «виконано»; ввечері ще раз writeDayBlockFromAggregates.
 */
function assortmentStepId(productKey, flavorKey) {
  return `${String(productKey || "").trim().toLowerCase()}|${String(flavorKey || "").trim().toLowerCase()}`;
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

  const dayKey = getOrderStatsDayKey(order);
  const tabTitle = reportTabTitleForDayKey(dayKey);
  const sign = direction === "reverse" ? 1 : -1;

  const results = [];
  const newSteps = [];
  const priorSteps = Array.isArray(order?.googleSheetSync?.assortmentAppliedSteps)
    ? order.googleSheetSync.assortmentAppliedSteps
    : [];
  const doneStepIds = new Set(
    priorSteps.map((s) => assortmentStepId(s.productKey, s.flavorKey))
  );

  if (direction === "reverse" && priorSteps.length > 0) {
    for (const step of priorSteps) {
      const revQty = -Number(step.deltaQty || 0);
      if (!revQty) continue;

      const assortmentResult = await applyAssortmentDelta({
        spreadsheetId,
        pointLabel,
        dayKey,
        modelName: getAssortmentSheetModelName({
          productKey: step.productKey,
        }),
        productKey: step.productKey,
        flavorLabel: step.matchedFlavorLabel,
        deltaQty: revQty,
        dryRun,
        orderNo: order?.orderNo,
        orderId: String(order?._id || ""),
      });
      results.push({
        kind: "assortment",
        productKey: step.productKey,
        flavorKey: step.flavorKey,
        assortmentResult,
      });
    }

    const failed = results.filter(
      (r) => r.assortmentResult && r.assortmentResult.ok === false
    );

    const reverseResult = {
      ok: failed.length === 0,
      pointKey,
      spreadsheetId,
      tabTitle,
      dayKey,
      results,
      newSteps: [],
      clearAssortmentSteps: failed.length === 0 && !dryRun,
      partial: failed.length > 0,
    };

    if (!dryRun && failed.length > 0) {
      await logOrderAssortmentSyncSummary(spreadsheetId, order, reverseResult);
    }

    return reverseResult;
  }

  for (const row of order?.items || []) {
    const modelName = getAssortmentSheetModelName(row);

    for (const flavor of row?.flavors || []) {
      const flavorQty = Math.max(0, Number(flavor?.qty || 0));
      if (!flavorQty) continue;

      const stepId = assortmentStepId(row?.productKey, flavor?.flavorKey);
      if (direction === "apply" && doneStepIds.has(stepId)) {
        continue;
      }

      const flavorLabels = buildAssortmentFlavorSearchLabels(
        flavor,
        row?.productKey
      );
      const flavorLabel = flavorLabels[0] || "";
      const deltaQty = sign * flavorQty;

      const assortmentResult = await applyAssortmentDelta({
        spreadsheetId,
        pointLabel,
        dayKey,
        modelName,
        productKey: row?.productKey,
        flavorLabel,
        flavorLabelCandidates: flavorLabels.slice(1),
        deltaQty,
        dryRun,
        orderNo: order?.orderNo,
        orderId: String(order?._id || ""),
      });

      results.push({
        kind: "assortment",
        productKey: row?.productKey,
        flavorKey: flavor?.flavorKey,
        assortmentResult,
      });

      if (assortmentResult?.ok && !dryRun && direction === "apply") {
        newSteps.push({
          productKey: String(row?.productKey || ""),
          flavorKey: String(flavor?.flavorKey || ""),
          matchedFlavorLabel:
            assortmentResult.matchedFlavorLabel || flavorLabel,
          deltaQty,
        });
        doneStepIds.add(stepId);
      }
    }
  }

  const failed = results.filter(
    (r) => r.assortmentResult && r.assortmentResult.ok === false
  );

  const syncResult = {
    ok: failed.length === 0,
    partial: failed.length > 0 && newSteps.length > 0,
    pointKey,
    spreadsheetId,
    tabTitle,
    dayKey,
    results,
    newSteps,
    mergedStepCount: priorSteps.length + newSteps.length,
  };

  if (!dryRun && failed.length > 0) {
    await logOrderAssortmentSyncSummary(spreadsheetId, order, syncResult);
  }

  return syncResult;
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
    const mergedSteps = [
      ...(Array.isArray(order?.googleSheetSync?.assortmentAppliedSteps)
        ? order.googleSheetSync.assortmentAppliedSteps
        : []),
      ...(result.newSteps || []),
    ];
    await Order.updateOne(
      { _id: order._id },
      {
        $set: {
          "googleSheetSync.appliedAt": new Date(),
          "googleSheetSync.reversedAt": null,
          "googleSheetSync.syncInProgress": false,
          "googleSheetSync.lastError": "",
          "googleSheetSync.assortmentAppliedSteps": mergedSteps,
        },
      }
    );
  } else if (!options?.dryRun && !result.ok) {
    const mergedSteps = [
      ...(Array.isArray(order?.googleSheetSync?.assortmentAppliedSteps)
        ? order.googleSheetSync.assortmentAppliedSteps
        : []),
      ...(result.newSteps || []),
    ];
    await Order.updateOne(
      { _id: order._id },
      {
        $set: {
          "googleSheetSync.syncInProgress": false,
          "googleSheetSync.lastError": JSON.stringify({
            ok: false,
            partial: Boolean(result.partial),
            failed: (result.results || []).filter(
              (r) => r.assortmentResult?.ok === false
            ).map((r) => ({
              productKey: r.productKey,
              flavorKey: r.flavorKey,
              reason: r.assortmentResult?.reason,
            })),
            pointKey: result.pointKey,
            orderNo: order?.orderNo,
          }).slice(0, 2000),
          ...(mergedSteps.length
            ? { "googleSheetSync.assortmentAppliedSteps": mergedSteps }
            : {}),
        },
      }
    );
  }

  return result;
}

/** Чи час списувати АССОРТИМЕНТ: pickup/courier — completed; InPost — shipped. */
export function orderQualifiesForAssortmentGoogleSync(order) {
  if (!order) return false;

  const status = String(order?.status || "").trim().toLowerCase();
  const deliveryType = String(order?.deliveryType || "").trim().toLowerCase();
  const deliveryMethod = String(order?.deliveryMethod || "").trim().toLowerCase();

  if (deliveryType === "delivery" && deliveryMethod === "inpost") {
    return status === "shipped" && Boolean(order?.shippedAt);
  }

  return status === "completed" || status === "done";
}

/** Після виконання / відправлення InPost: асортимент у Google Sheets, один раз на замовлення. */
export function ensureGoogleSheetAssortmentForFulfilledOrder(order) {
  if (!order?._id || !isGoogleSheetsEnabled()) return;
  if (!orderQualifiesForAssortmentGoogleSync(order)) return;

  if (order?.googleSheetSync?.appliedAt && !order?.googleSheetSync?.reversedAt) {
    return;
  }

  queueGoogleSheetApplyForOrder(order);
}

/** @deprecated alias */
export function ensureGoogleSheetAssortmentForCompletedOrder(order) {
  ensureGoogleSheetAssortmentForFulfilledOrder(order);
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
          "googleSheetSync.reversedAt": new Date(),
          "googleSheetSync.lastError": "",
          "googleSheetSync.assortmentAppliedSteps": [],
        },
      }
    );
  } else if (!options?.dryRun && !result.ok && result.spreadsheetId) {
    await Order.updateOne(
      { _id: order._id },
      {
        $set: {
          "googleSheetSync.lastError": JSON.stringify({
            ok: false,
            direction: "reverse",
            failed: (result.results || [])
              .filter((r) => r.assortmentResult?.ok === false)
              .map((r) => ({
                productKey: r.productKey,
                flavorKey: r.flavorKey,
                reason: r.assortmentResult?.reason,
              })),
            orderNo: order?.orderNo,
          }).slice(0, 2000),
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
      })
      // таблиця щойно оновлена → вирівнюємо Mongo по ній
      .then(() => queueStockPullForOrder(order));
  });
}

/** Після замовлення: підтягнути залишки з таблиці його складу у Mongo (debounce). */
export function queueStockPullForOrder(order) {
  if (!order || !isGoogleSheetsEnabled()) return Promise.resolve();

  return resolveOrderPointKey(order)
    .then((pointKey) => {
      if (pointKey) queueStockPullForPointKey(pointKey);
    })
    .catch((e) => {
      console.error("[stockPull] queue for order failed:", e?.message || e);
    });
}

export function queueGoogleSheetReverseForOrder(order) {
  if (!order?._id) return;

  setImmediate(() => {
    Order.findById(order._id)
      .then((fresh) => reverseOrderOnGoogleSheets(fresh))
      .catch((e) => {
        console.error("[googleSheets] reverseOrder error:", e);
      })
      .then(() => queueStockPullForOrder(order));
  });
}
