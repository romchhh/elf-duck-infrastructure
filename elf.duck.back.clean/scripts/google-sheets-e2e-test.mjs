/**
 * Перевірка доступу до таблиць + round-trip синхронізації (apply → reverse).
 *
 * node scripts/google-sheets-e2e-test.mjs
 * node scripts/google-sheets-e2e-test.mjs --live
 */
import { readSheetValues, escapeSheetTitle } from "../lib/googleSheets/client.js";
import { SPREADSHEET_ID_BY_POINT_KEY } from "../lib/googleSheets/config.js";
import { applyAssortmentDelta } from "../lib/googleSheets/assortmentGrid.js";
import {
  findDayBlock,
  findMonthSummarySection,
  warsawDayKeyToReportHeader,
} from "../lib/googleSheets/dailyReportGrid.js";
import { runGoogleSheetsOrderSync } from "../lib/googleSheets/orderSync.js";
import { getWarsawDayKey } from "../lib/server/helpers/chunk08.js";

const live = process.argv.includes("--live");
const dayKey = getWarsawDayKey(new Date());
const dayHeader = warsawDayKeyToReportHeader(dayKey);
const tabTitle = `ОТЧЕТ 01.${dayKey.slice(5, 7)}.${dayKey.slice(0, 4)}`;

let failed = 0;

console.log("=== 1) Access + structure ===");
console.log({ dayKey, dayHeader, tabTitle });

for (const [pointKey, spreadsheetId] of Object.entries(
  SPREADSHEET_ID_BY_POINT_KEY
)) {
  try {
    const rows = await readSheetValues(
      spreadsheetId,
      `${escapeSheetTitle(tabTitle)}!A1:A5`
    );
    const full = await readSheetValues(
      spreadsheetId,
      `${escapeSheetTitle(tabTitle)}!A1:Z650`
    );
    const dayBlock = findDayBlock(full, dayHeader);
    const month = findMonthSummarySection(full, dayKey);

    console.log(
      `[OK] ${pointKey}`,
      spreadsheetId.slice(0, 8) + "…",
      dayBlock ? `day@${dayBlock.titleRow + 1}` : "NO_DAY",
      month ? `month@${month.titleRow + 1}` : "NO_MONTH"
    );

    if (!dayBlock) failed++;
    if (!month) failed++;
  } catch (e) {
    const isPraga403 =
      pointKey === "praga" && String(e.message || "").includes("permission");
    if (isPraga403) {
      console.warn(
        `[SKIP] ${pointKey} — дайте доступ elfduck@telebots-e-commerce.iam.gserviceaccount.com`
      );
    } else {
      failed++;
      console.error(`[FAIL] ${pointKey}`, e.message);
    }
  }
}

console.log("\n=== 2) Dry-run mock order (mokot-w) ===");
const mockOrder = {
  pickupPointKey: "mokot-w",
  deliveryType: "pickup",
  stockCommittedAt: new Date(),
  createdAt: new Date(),
  totalZl: 60,
  payment: {
    status: "paid",
    managerDisplayCurrency: "PLN",
    managerDisplayAmount: 60,
    cashbackAppliedZl: 0,
    referralFirstOrderDiscountTotalZl: 0,
  },
  items: [
    {
      productTitle1: "ELFLIQ",
      productTitle2: "30 ML",
      productKey: "elfliq-30-ml",
      flavors: [
        {
          flavorLabel: "Blue Razz Ice",
          flavorKey: "blue-razz-ice",
          qty: 1,
        },
      ],
    },
  ],
};

const dryApply = await runGoogleSheetsOrderSync(mockOrder, { dryRun: true });
console.log("apply dryRun:", dryApply.ok, dryApply.results?.length || 0, "steps");
if (!dryApply.ok) {
  failed++;
  console.log(dryApply);
}

const dryReverse = await runGoogleSheetsOrderSync(mockOrder, {
  direction: "reverse",
  dryRun: true,
});
console.log("reverse dryRun:", dryReverse.ok);
if (!dryReverse.ok) failed++;

if (live) {
  console.log("\n=== 3) LIVE round-trip (mokot-w, ELFLIQ Blue Razz Ice −1/+1) ===");
  const spreadsheetId = SPREADSHEET_ID_BY_POINT_KEY["mokot-w"];

  const before = await applyAssortmentDelta({
    spreadsheetId,
    pointLabel: "Mokotów",
    dayKey,
    modelName: "ELFLIQ 30 ML",
    productKey: "elfliq-30-ml",
    flavorLabel: "Blue Razz Ice",
    deltaQty: 0,
    dryRun: true,
  });
  console.log("before qty:", before.currentQty, before.a1);

  const apply = await runGoogleSheetsOrderSync(mockOrder, { dryRun: false });
  console.log("live apply:", apply.ok);
  if (!apply.ok) {
    failed++;
    console.log(apply);
  }

  const mid = await applyAssortmentDelta({
    spreadsheetId,
    pointLabel: "Mokotów",
    dayKey,
    modelName: "ELFLIQ 30 ML",
    productKey: "elfliq-30-ml",
    flavorLabel: "Blue Razz Ice",
    deltaQty: 0,
    dryRun: true,
  });
  console.log("after apply qty:", mid.currentQty);

  if (before.ok && mid.ok && mid.currentQty !== before.currentQty - 1) {
    failed++;
    console.error("assortment did not decrease by 1");
  }

  const rev = await runGoogleSheetsOrderSync(mockOrder, {
    direction: "reverse",
    dryRun: false,
  });
  console.log("live reverse:", rev.ok);

  const after = await applyAssortmentDelta({
    spreadsheetId,
    pointLabel: "Mokotów",
    dayKey,
    modelName: "ELFLIQ 30 ML",
    productKey: "elfliq-30-ml",
    flavorLabel: "Blue Razz Ice",
    deltaQty: 0,
    dryRun: true,
  });
  console.log("after reverse qty:", after.currentQty);

  if (before.ok && after.ok && after.currentQty !== before.currentQty) {
    failed++;
    console.error("assortment not restored after reverse");
  }
}

console.log("\n=== Result ===", failed === 0 ? "PASS" : `FAIL (${failed})`);
process.exit(failed === 0 ? 0 : 1);
