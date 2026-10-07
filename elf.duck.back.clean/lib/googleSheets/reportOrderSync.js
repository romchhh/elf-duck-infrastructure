import Order from "../../models/Order.js";
import {
  isGoogleSheetsEnabled,
  resolveSpreadsheetIdForPointKey,
} from "./config.js";
import {
  applyDayBlockTotalsDelta,
  applyMonthItogoDelta,
  applyReportModelDelta,
  reportTabTitleForDayKey,
} from "./dailyReportGrid.js";
import {
  orderQualifiesForAssortmentGoogleSync,
  resolveOrderPointKey,
} from "./orderSync.js";
import { getOrderSheetsDiscountTotalZl } from "../server/helpers/chunk08.js";
import { getOrderStatsDayKey } from "../server/helpers/orderStatsDay.js";
import {
  getStatsSheetProductQty,
  getStatsSheetReportModelKey,
  getStatsSheetTierQty,
} from "../server/helpers/chunk09.js";

function tierKeyFromTierQty(qty) {
  const n = Math.max(0, Number(qty || 0));
  if (n >= 5) return "tier5";
  if (n >= 3) return "tier34";
  if (n >= 2) return "tier2";
  return "tier1";
}

async function syncOrderReportItems(order, { direction, dryRun = false }) {
  const pointKey = await resolveOrderPointKey(order);
  const spreadsheetId = resolveSpreadsheetIdForPointKey(pointKey);

  if (!spreadsheetId) {
    return { ok: false, reason: "NO_SPREADSHEET_FOR_POINT", pointKey };
  }

  const dayKey = getOrderStatsDayKey(order);
  if (!dayKey) {
    return { ok: false, reason: "NO_STATS_DAY", pointKey };
  }

  const tabTitle = reportTabTitleForDayKey(dayKey);
  const sign = direction === "reverse" ? -1 : 1;
  const tierDeltas = { tier1: 0, tier2: 0, tier34: 0, tier5: 0 };
  const results = [];

  for (const row of order?.items || []) {
    const reportModelLabel = getStatsSheetReportModelKey(row);
    const soldQty = getStatsSheetProductQty(row);
    if (!reportModelLabel || soldQty <= 0) continue;

    const tierKey = tierKeyFromTierQty(getStatsSheetTierQty(order, row));
    tierDeltas[tierKey] = Number(tierDeltas[tierKey] || 0) + soldQty;

    const modelResult = await applyReportModelDelta({
      spreadsheetId,
      tabTitle,
      dayKey,
      reportModelLabel,
      soldQty: sign * soldQty,
      tierKey,
      dryRun,
    });

    results.push({ reportModelLabel, soldQty, tierKey, modelResult });

    if (!modelResult?.ok) {
      return {
        ok: false,
        pointKey,
        dayKey,
        tabTitle,
        results,
        failed: modelResult,
      };
    }
  }

  const discountsDeltaZl = sign * Number(getOrderSheetsDiscountTotalZl(order) || 0);
  const scaledTierDeltas = {};
  for (const [key, value] of Object.entries(tierDeltas)) {
    scaledTierDeltas[key] = sign * Number(value || 0);
  }

  const hasTierMovement = Object.values(scaledTierDeltas).some((v) => v !== 0);
  const hasDiscounts = discountsDeltaZl !== 0;

  let dayKassa = { ok: true, skipped: true };
  let monthItogo = { ok: true, skipped: true };

  if (hasTierMovement || hasDiscounts) {
    dayKassa = await applyDayBlockTotalsDelta({
      spreadsheetId,
      tabTitle,
      dayKey,
      discountsDeltaZl,
      tierDeltas: scaledTierDeltas,
      dryRun,
    });

    monthItogo = await applyMonthItogoDelta({
      spreadsheetId,
      tabTitle,
      dayKey,
      discountsDeltaZl,
      tierDeltas: scaledTierDeltas,
      dryRun,
    });
  }

  const failed = [dayKassa, monthItogo].filter((r) => r?.ok === false);
  if (failed.length) {
    return {
      ok: false,
      pointKey,
      dayKey,
      tabTitle,
      results,
      dayKassa,
      monthItogo,
      failed,
    };
  }

  if (!results.length && !hasTierMovement && !hasDiscounts) {
    return { ok: false, reason: "NO_REPORTABLE_ITEMS", pointKey, dayKey };
  }

  return {
    ok: true,
    pointKey,
    spreadsheetId,
    dayKey,
    tabTitle,
    results,
    dayKassa,
    monthItogo,
  };
}

export async function applyOrderReportToGoogleSheets(order, options = {}) {
  if (!isGoogleSheetsEnabled() || !order) {
    return { ok: false, reason: "DISABLED" };
  }

  if (order?.googleSheetSync?.reportAppliedAt && !options?.force) {
    return { ok: true, reason: "ALREADY_APPLIED" };
  }

  if (!options?.dryRun && !options?.force) {
    const claimed = await Order.findOneAndUpdate(
      {
        _id: order._id,
        $or: [
          { "googleSheetSync.reportAppliedAt": { $exists: false } },
          { "googleSheetSync.reportAppliedAt": null },
        ],
        "googleSheetSync.reportSyncInProgress": { $ne: true },
      },
      {
        $set: {
          "googleSheetSync.reportSyncInProgress": true,
          "googleSheetSync.reportLastError": "",
        },
      }
    );
    if (!claimed) {
      const fresh = await Order.findById(order._id).lean();
      if (fresh?.googleSheetSync?.reportAppliedAt) {
        return { ok: true, reason: "ALREADY_APPLIED" };
      }
      return { ok: false, reason: "REPORT_SYNC_IN_PROGRESS_OR_CLAIM_FAILED" };
    }
  }

  const result = await syncOrderReportItems(order, {
    direction: "apply",
    dryRun: options?.dryRun,
  });

  if (!options?.dryRun && result.ok) {
    await Order.updateOne(
      { _id: order._id },
      {
        $set: {
          "googleSheetSync.reportAppliedAt": new Date(),
          "googleSheetSync.reportReversedAt": null,
          "googleSheetSync.reportSyncInProgress": false,
          "googleSheetSync.reportLastError": "",
        },
      }
    );
  } else if (!options?.dryRun && !result.ok) {
    await Order.updateOne(
      { _id: order._id },
      {
        $set: {
          "googleSheetSync.reportSyncInProgress": false,
          "googleSheetSync.reportLastError": JSON.stringify(result).slice(0, 500),
        },
      }
    );
  }

  return result;
}

export async function reverseOrderReportOnGoogleSheets(order, options = {}) {
  if (!isGoogleSheetsEnabled() || !order) {
    return { ok: false, reason: "DISABLED" };
  }

  if (!order?.googleSheetSync?.reportAppliedAt) {
    return { ok: true, reason: "NOT_APPLIED" };
  }

  if (order?.googleSheetSync?.reportReversedAt && !options?.force) {
    return { ok: true, reason: "ALREADY_REVERSED" };
  }

  const result = await syncOrderReportItems(order, {
    direction: "reverse",
    dryRun: options?.dryRun,
  });

  if (!options?.dryRun && result.ok) {
    await Order.updateOne(
      { _id: order._id },
      {
        $set: {
          "googleSheetSync.reportAppliedAt": null,
          "googleSheetSync.reportReversedAt": new Date(),
          "googleSheetSync.reportLastError": "",
        },
      }
    );
  }

  return result;
}

/** Після виконання / InPost shipped: tiers + СКИДКИ в ОТЧЁТ (окремо від АССОРТИМЕНТ). */
export function ensureGoogleSheetReportForFulfilledOrder(order) {
  if (!order?._id || !isGoogleSheetsEnabled()) return;
  if (!orderQualifiesForAssortmentGoogleSync(order)) return;

  if (
    order?.googleSheetSync?.reportAppliedAt &&
    !order?.googleSheetSync?.reportReversedAt
  ) {
    return;
  }

  queueGoogleSheetReportApplyForOrder(order);
}

/** @deprecated alias */
export function ensureGoogleSheetReportForCompletedOrder(order) {
  ensureGoogleSheetReportForFulfilledOrder(order);
}

export function queueGoogleSheetReportApplyForOrder(order) {
  if (!order?._id) return;

  setImmediate(() => {
    Order.findById(order._id)
      .then((fresh) => applyOrderReportToGoogleSheets(fresh))
      .catch((e) => {
        console.error("[googleSheets] applyOrderReport error:", e);
      })
      .then((result) => {
        if (result && result.ok === false) {
          console.error("[googleSheets] applyOrderReport failed:", {
            orderId: String(order._id || ""),
            orderNo: String(order?.orderNo || ""),
            result,
          });
        }
      });
  });
}

export function queueGoogleSheetReportReverseForOrder(order) {
  if (!order?._id) return;

  setImmediate(() => {
    Order.findById(order._id)
      .then((fresh) => reverseOrderReportOnGoogleSheets(fresh))
      .catch((e) => {
        console.error("[googleSheets] reverseOrderReport error:", e);
      });
  });
}
