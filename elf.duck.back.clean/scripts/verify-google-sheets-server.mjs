/**
 * Перевірка Google Sheets на VPS (у контейнері api).
 *
 *   docker compose exec api node scripts/verify-google-sheets-server.mjs
 */
import fs from "fs";
import { readSheetValues, escapeSheetTitle } from "../lib/googleSheets/client.js";
import {
  isGoogleSheetsEnabled,
  resolveServiceAccountPath,
  resolveSpreadsheetIdForPointKey,
} from "../lib/googleSheets/config.js";
import { reportTabTitleForDayKey } from "../lib/googleSheets/dailyReportGrid.js";
import { getWarsawDayKey } from "../lib/server/helpers/chunk08.js";

const saPath = resolveServiceAccountPath();
const enabled = isGoogleSheetsEnabled();
const dayKey = getWarsawDayKey(new Date());
const tabTitle = reportTabTitleForDayKey(dayKey);

console.log({
  enabled,
  serviceAccountPath: saPath,
  serviceAccountExists: fs.existsSync(saPath),
  dayKey,
  tabTitle,
  cwd: process.cwd(),
});

if (!enabled) {
  console.error("FAIL: googleSheets.json enabled=false");
  process.exit(1);
}

if (!fs.existsSync(saPath)) {
  console.error(
    "FAIL: service account JSON не знайдено. На хості: telebots-e-commerce-bc2114cbc876.json у корені репо + docker compose up -d api"
  );
  process.exit(1);
}

const spreadsheetId = resolveSpreadsheetIdForPointKey("praga");
try {
  const rows = await readSheetValues(
    spreadsheetId,
    `${escapeSheetTitle(tabTitle)}!A1:A3`
  );
  console.log("OK: read praga tab", tabTitle, "rows:", rows?.length ?? 0);
} catch (e) {
  console.error("FAIL: API read", e?.message || e);
  process.exit(1);
}

console.log("PASS — Sheets API з контейнера api працює.");
