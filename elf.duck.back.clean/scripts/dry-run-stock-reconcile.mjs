/**
 * Read-only stock reconcile against live sheets. Does not send Telegram.
 * node scripts/dry-run-stock-reconcile.mjs --point praga --days 2026-10-29,2026-10-30
 */
import { loadMonthlyReport, reportTabTitleForDayKey } from "../lib/googleSheets/dailyReportGrid.js";
import { loadAssortmentGrid } from "../lib/googleSheets/assortmentGrid.js";
import { buildShiftStockReconcile } from "../lib/googleSheets/shiftStockReconcile.js";
import {
  resolveServiceAccountPath,
  resolveSpreadsheetIdForPointKey,
} from "../lib/googleSheets/config.js";

function readArg(name) {
  const idx = process.argv.indexOf(name);
  if (idx < 0) return "";
  return String(process.argv[idx + 1] || "").trim();
}

const point = readArg("--point") || "praga";
const days = (readArg("--days") || "2026-10-29,2026-10-30,2026-10-31")
  .split(",")
  .map((day) => day.trim())
  .filter(Boolean);

const spreadsheetId = resolveSpreadsheetIdForPointKey(point);
const cred = resolveServiceAccountPath();
if (!cred) {
  console.error("Service account JSON not found");
  process.exit(1);
}
if (!spreadsheetId) {
  console.error("No spreadsheet for", point);
  process.exit(1);
}

console.log(JSON.stringify({ point, spreadsheetId, credentials: "found", days }));

const byTab = new Map();
for (const dayKey of days) {
  const tabTitle = reportTabTitleForDayKey(dayKey);
  if (!byTab.has(tabTitle)) byTab.set(tabTitle, []);
  byTab.get(tabTitle).push(dayKey);
}

let failed = 0;
for (const [tabTitle, tabDays] of byTab) {
  let reportRows;
  let assortmentRows;
  try {
    [reportRows, assortmentRows] = await Promise.all([
      loadMonthlyReport(spreadsheetId, tabTitle),
      loadAssortmentGrid(spreadsheetId),
    ]);
  } catch (error) {
    failed += 1;
    console.error("[READ FAIL]", tabTitle, error?.message || error);
    continue;
  }

  console.log(
    `[READ] ${tabTitle} reportRows=${reportRows?.length || 0} assortmentRows=${assortmentRows?.length || 0}`
  );

  for (const dayKey of tabDays) {
    const result = buildShiftStockReconcile({
      reportRows,
      assortmentRows,
      dayKey,
    });
    console.log(`\n=== ${dayKey} mismatches=${result.mismatches.length} errors=${result.errors.length} ===`);
    if (!result.message) {
      console.log("MATCH");
      continue;
    }
    console.log(result.message);
  }
}

process.exit(failed ? 1 : 0);
