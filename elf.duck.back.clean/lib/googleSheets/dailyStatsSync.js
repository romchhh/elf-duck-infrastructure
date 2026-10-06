import { appendSheetRow } from "./client.js";
import {
  isGoogleSheetsEnabled,
  resolveSpreadsheetIdForPointKey,
  STATS_LOG_SHEET_TITLE,
} from "./config.js";
import {
  applyMonthItogoDelta,
  applyMonthSummaryTiersFromProductRows,
  reportTabTitleForDayKey,
  writeDayBlockFromAggregates,
} from "./dailyReportGrid.js";
import {
  getOrderKasaPlnZl,
  getOrderSheetsDiscountTotalZl,
} from "../server/helpers/chunk08.js";
import {
  getStatsSheetProductQty,
  getStatsSheetReportModelKey,
  getStatsSheetTierQty,
} from "../server/helpers/chunk09.js";
function getStatsSheetTierKeyFromQty(qty) {
  const n = Math.max(0, Number(qty || 0));
  if (n >= 5) return "tier5";
  if (n >= 3) return "tier34";
  if (n >= 2) return "tier2";
  return "tier1";
}

export function buildProductAggregates(orders) {
  const productMap = new Map();

  for (const order of Array.isArray(orders) ? orders : []) {
    for (const row of Array.isArray(order?.items) ? order.items : []) {
      const modelKey = getStatsSheetReportModelKey(row);
      if (!modelKey) continue;

      if (!productMap.has(modelKey)) {
        productMap.set(modelKey, {
          model: modelKey,
          sold: 0,
          tier1: 0,
          tier2: 0,
          tier34: 0,
          tier5: 0,
        });
      }

      const item = productMap.get(modelKey);
      const soldQty = getStatsSheetProductQty(row);
      const tierQty = getStatsSheetTierQty(order, row);
      const tierKey = getStatsSheetTierKeyFromQty(tierQty);

      item.sold += soldQty;
      item[tierKey] = Number(item[tierKey] || 0) + soldQty;
    }
  }

  return Array.from(productMap.values());
}

export async function sendDailyPointStatsToGoogleSheetsApi(
  point,
  orders,
  dayKey,
  options = {}
) {
  const dryRun = Boolean(options?.dryRun);
  const skipMonthRollup = Boolean(options?.skipMonthRollup);
  if (!isGoogleSheetsEnabled()) {
    return { ok: false, reason: "DISABLED" };
  }

  const pointKey = String(point?.key || "")
    .trim()
    .toLowerCase()
    .replace(/,+$/, "");

  const spreadsheetId = resolveSpreadsheetIdForPointKey(pointKey);
  if (!spreadsheetId) {
    return {
      ok: false,
      reason: "NO_SPREADSHEET_FOR_POINT",
      pointKey,
    };
  }

  const tabTitle = reportTabTitleForDayKey(dayKey);
  const products = buildProductAggregates(orders);

  const discounts = Number(
    (Array.isArray(orders) ? orders : [])
      .reduce((sum, order) => sum + getOrderSheetsDiscountTotalZl(order), 0)
      .toFixed(2)
  );

  const kasaTotalZl = Number(
    (Array.isArray(orders) ? orders : [])
      .reduce((sum, order) => sum + Number(getOrderKasaPlnZl(order) || 0), 0)
      .toFixed(2)
  );

  const tierTotals = { tier1: 0, tier2: 0, tier34: 0, tier5: 0 };
  let soldUnitsTotal = 0;

  for (const order of Array.isArray(orders) ? orders : []) {
    for (const row of order?.items || []) {
      const soldQty = getStatsSheetProductQty(row);
      if (soldQty <= 0) continue;
      soldUnitsTotal += soldQty;
      const tierKey = getStatsSheetTierKeyFromQty(
        getStatsSheetTierQty(order, row)
      );
      tierTotals[tierKey] = Number(tierTotals[tierKey] || 0) + soldQty;
    }
  }

  const writeResult = await writeDayBlockFromAggregates({
    spreadsheetId,
    tabTitle,
    dayKey,
    productRows: products,
    discounts,
    kasaTotalZl,
    soldUnitsTotal,
    tierTotals,
    dryRun,
  });

  let monthModelResult = { ok: true, skipped: true };
  let monthItogoResult = { ok: true, skipped: true };

  if (writeResult?.ok && !skipMonthRollup) {
    monthModelResult = await applyMonthSummaryTiersFromProductRows({
      spreadsheetId,
      tabTitle,
      dayKey,
      productRows: products,
      dryRun,
    });

    monthItogoResult = await applyMonthItogoDelta({
      spreadsheetId,
      tabTitle,
      dayKey,
      discountsDeltaZl: discounts,
      soldUnitsDelta: soldUnitsTotal,
      tierDeltas: tierTotals,
      dryRun,
    });
  }

  if (writeResult?.ok) {
    try {
      await appendSheetRow(spreadsheetId, STATS_LOG_SHEET_TITLE, [
        new Date().toLocaleString("uk-UA"),
        String(point?.title || pointKey),
        String(dayKey || ""),
        `${pointKey}__${dayKey}`,
      ]);
    } catch (e) {
      console.error("[googleSheets] STATS_LOG append failed:", e);
    }
  }

  const ok =
    Boolean(writeResult?.ok) &&
    Boolean(monthModelResult?.ok !== false) &&
    Boolean(monthItogoResult?.ok !== false);

  return {
    ok,
    pointKey,
    spreadsheetId,
    tabTitle,
    response: writeResult,
    monthModelResult,
    monthItogoResult,
  };
}
