/**
 * Dry-run: перевірка матчінгу асортименту та звіту без запису в таблицю.
 *
 * node scripts/test-google-sheets-sync.mjs
 * node scripts/test-google-sheets-sync.mjs --point mokot-w --model "ELFLIQ 30 ML" --flavor "Blue Razz Ice"
 */
import { applyAssortmentDelta } from "../lib/googleSheets/assortmentGrid.js";
import { applyReportModelDelta } from "../lib/googleSheets/dailyReportGrid.js";
import { resolveSpreadsheetIdForPointKey } from "../lib/googleSheets/config.js";
import {
  normalizeSheetModelName,
  toReportModelLabel,
} from "../lib/googleSheets/normalize.js";

const args = process.argv.slice(2);
const pointKey = args.includes("--point")
  ? args[args.indexOf("--point") + 1]
  : "mokot-w";

const modelName = args.includes("--model")
  ? args[args.indexOf("--model") + 1]
  : "PUFFY 30 ML";

const flavorLabel = args.includes("--flavor")
  ? args[args.indexOf("--flavor") + 1]
  : "Grape Raspberry Plum";

const spreadsheetId = resolveSpreadsheetIdForPointKey(pointKey);
const dayKey = "2026-10-02";
const tabTitle = "ОТЧЕТ 01.10.2026";

console.log({
  pointKey,
  spreadsheetId,
  normalizedModel: normalizeSheetModelName(modelName),
  reportModel: toReportModelLabel(modelName),
});

const assortment = await applyAssortmentDelta({
  spreadsheetId,
  pointLabel: pointKey,
  dayKey,
  modelName,
  productKey: "puffy-30-ml",
  flavorLabel,
  deltaQty: 0,
  dryRun: true,
});

console.log("assortment dry-run:", assortment);

const report = await applyReportModelDelta({
  spreadsheetId,
  tabTitle,
  dayKey,
  reportModelLabel: toReportModelLabel(modelName),
  soldQty: 0,
  tierKey: "tier1",
  dryRun: true,
});

console.log("report dry-run:", report);
