/**
 * Створює лист «ОТЧЕТ 01.11.2026» у всіх таблицях точок (копія жовтня + дати + нулі).
 *
 * node scripts/create-november-2026-tabs.mjs
 * node scripts/create-november-2026-tabs.mjs --replace
 */
import {
  createNovember2026ReportTabsAll,
  REPORT_SPREADSHEET_IDS,
} from "../lib/googleSheets/createMonthReportTab.js";
import {
  findDayBlock,
  findMonthSummarySection,
  warsawDayKeyToReportHeader,
} from "../lib/googleSheets/dailyReportGrid.js";
import { escapeSheetTitle, readSheetValues } from "../lib/googleSheets/client.js";

const replace = process.argv.includes("--replace");

console.log("Creating November 2026 report tabs…", { replace });

const results = await createNovember2026ReportTabsAll({ replace });

for (const r of results) {
  if (r.skipped) {
    console.log(`[SKIP] ${r.key}: ${r.targetTabTitle} already exists`);
    continue;
  }
  if (!r.ok) {
    console.error(`[FAIL] ${r.key}:`, r.error || r.reason);
    continue;
  }
  console.log(`[OK] ${r.key}: ${r.targetTabTitle} (${r.rows} rows)`);
}

console.log("\n=== Structure check (01.11 + month footer) ===");

let failed = 0;

for (const { key, id: spreadsheetId } of REPORT_SPREADSHEET_IDS) {
  const r = results.find((x) => x.key === key);
  if (!r?.ok && !r?.skipped) {
    if (key === "praga") {
      console.warn(`[CHECK] ${key}: no access — share sheet with service account`);
    } else {
      failed++;
    }
    continue;
  }
  try {
    const tab = "ОТЧЕТ 01.11.2026";
    const rows = await readSheetValues(
      spreadsheetId,
      `${escapeSheetTitle(tab)}!A1:Z650`
    );

    const d1 = findDayBlock(rows, "01.11");
    const d30 = findDayBlock(rows, "30.11");
    const month = findMonthSummarySection(rows, "2026-11-15");

    const dayHeaders = [];
    for (let r = 0; r < 480; r += 32) {
      for (const c of [0, 11]) {
        const h = String(rows[r]?.[c] || "").trim();
        if (/^\d{2}\.11$/.test(h)) dayHeaders.push(h);
      }
    }

    const unique = [...new Set(dayHeaders)].sort();

    console.log(
      `[CHECK] ${key}: days=${unique.length} (${unique[0]}…${unique[unique.length - 1]})`,
      d1 ? "block01" : "NO01",
      d30 ? "block30" : "NO30",
      month?.monthRangeLabel || "NO_MONTH"
    );

    if (!d1 || !d30 || !month || unique.length < 30) failed++;
  } catch (e) {
    failed++;
    console.error(`[CHECK FAIL] ${key}`, e.message);
  }
}

console.log("\nDone.", failed ? `FAILED checks: ${failed}` : "All checks passed.");
process.exit(failed ? 1 : 0);
