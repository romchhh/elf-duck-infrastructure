/**
 * Тестовий запис продажу в Google Таблицю (без замовлення в Mongo).
 *
 *   node scripts/google-sheets-mark-test-sale.mjs --point praga
 *   node scripts/google-sheets-mark-test-sale.mjs --point praga --reverse
 *
 * За замовчуванням: 1× PUFFY 30 ML / Grape Raspberry Plum, tier1, каса 30 zł.
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dir, "../../.env") });
dotenv.config({ path: path.join(__dir, "../../../.env") });

import { applyAssortmentDelta } from "../lib/googleSheets/assortmentGrid.js";
import {
  applyDayBlockTotalsDelta,
  applyMonthItogoDelta,
  applyReportModelDelta,
  reportTabTitleForDayKey,
} from "../lib/googleSheets/dailyReportGrid.js";
import {
  isGoogleSheetsEnabled,
  resolveServiceAccountPath,
  resolveSpreadsheetIdForPointKey,
} from "../lib/googleSheets/config.js";
import { toReportModelLabel } from "../lib/googleSheets/normalize.js";
import { getWarsawDayKey } from "../lib/server/helpers/chunk08.js";

const args = process.argv.slice(2);
const reverse = args.includes("--reverse");
const pointKey = args.includes("--point")
  ? args[args.indexOf("--point") + 1]
  : "praga";
const modelName = args.includes("--model")
  ? args[args.indexOf("--model") + 1]
  : "PUFFY 30 ML";
const flavorLabel = args.includes("--flavor")
  ? args[args.indexOf("--flavor") + 1]
  : "Grape Raspberry Plum";
const kasaZl = args.includes("--kasa")
  ? Number(args[args.indexOf("--kasa") + 1])
  : 30;

const dayKey = getWarsawDayKey(new Date());
const tabTitle = reportTabTitleForDayKey(dayKey);
const spreadsheetId = resolveSpreadsheetIdForPointKey(pointKey);
const reportModel = toReportModelLabel(modelName);
const sign = reverse ? -1 : 1;
const tag = reverse ? "REVERSE" : "MARK";

if (!isGoogleSheetsEnabled()) {
  console.error("Google Sheets вимкнено (googleSheets.json enabled: false)");
  process.exit(1);
}

console.log(`[${tag}]`, {
  pointKey,
  spreadsheetId,
  serviceAccount: resolveServiceAccountPath(),
  dayKey,
  tabTitle,
  modelName,
  reportModel,
  flavorLabel,
  kasaZl: sign * kasaZl,
});

const report = await applyReportModelDelta({
  spreadsheetId,
  tabTitle,
  dayKey,
  reportModelLabel: reportModel,
  soldQty: sign * 1,
  tierKey: "tier1",
  dryRun: false,
});

const assortment = await applyAssortmentDelta({
  spreadsheetId,
  pointLabel: pointKey,
  dayKey,
  modelName,
  productKey: "puffy-30-ml",
  flavorLabel,
  deltaQty: sign * -1,
  dryRun: false,
});

const itogo = await applyMonthItogoDelta({
  spreadsheetId,
  tabTitle,
  dayKey,
  kasaDeltaZl: sign * kasaZl,
  discountsDeltaZl: 0,
  soldUnitsDelta: sign * 1,
  tierDeltas: { tier1: sign * 1 },
  dryRun: false,
});

const dayKassa = await applyDayBlockTotalsDelta({
  spreadsheetId,
  tabTitle,
  dayKey,
  kasaDeltaZl: sign * kasaZl,
  discountsDeltaZl: 0,
  soldUnitsDelta: sign * 1,
  tierDeltas: { tier1: sign * 1 },
  dryRun: false,
});

const results = { report, assortment, itogo, dayKassa };
const failed = Object.entries(results).filter(([, v]) => v?.ok === false);

console.log(JSON.stringify(results, null, 2));

if (failed.length) {
  console.error("Помилки:", failed);
  process.exit(1);
}

console.log(
  reverse
    ? "Тестовий продаж знято з таблиці."
    : "Тестовий продаж записано. Зняти: node scripts/google-sheets-mark-test-sale.mjs --point praga --reverse"
);
