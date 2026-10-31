/**
 * Прибирає формули з листа «ОТЧЕТ 01.MM.YYYY» і лишає лише значення (як у ручних листах).
 *
 * node scripts/rebuild-month-report-tab-values.mjs --year 2026 --month 12
 * node scripts/rebuild-month-report-tab-values.mjs --year 2026 --month 12 --point wola
 */
import {
  REPORT_SPREADSHEET_IDS,
  rewriteMonthReportTabAsPlainValues,
} from "../lib/googleSheets/createMonthReportTab.js";
import { reportTabTitleForMonth } from "../lib/googleSheets/monthTransform.js";

function readArg(name) {
  const idx = process.argv.indexOf(name);
  if (idx < 0) return "";
  return String(process.argv[idx + 1] || "").trim();
}

const year = Number(readArg("--year") || new Date().getFullYear());
const month = Number(readArg("--month") || new Date().getMonth() + 1);
const pointFilter = readArg("--point");

if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
  console.error("Usage: --year YYYY --month MM [--point praga|wola|...]");
  process.exit(1);
}

const tabTitle = reportTabTitleForMonth(year, month);
const targets = REPORT_SPREADSHEET_IDS.filter(
  (row) => !pointFilter || row.key === pointFilter
);

if (!targets.length) {
  console.error("No spreadsheets matched", { pointFilter });
  process.exit(1);
}

console.log("Rebuild month tab as plain values:", { tabTitle, pointFilter: pointFilter || "all" });

let failed = 0;

for (const { key, id } of targets) {
  try {
    const res = await rewriteMonthReportTabAsPlainValues({
      spreadsheetId: id,
      tabTitle,
      year,
      month,
    });

    if (!res.ok) {
      failed += 1;
      console.error(`[FAIL] ${key}:`, res.reason || res);
      continue;
    }

    console.log(`[OK] ${key}: ${tabTitle} (${res.rows} rows)`);
  } catch (error) {
    failed += 1;
    console.error(`[FAIL] ${key}:`, error?.message || error);
  }
}

process.exit(failed ? 1 : 0);
