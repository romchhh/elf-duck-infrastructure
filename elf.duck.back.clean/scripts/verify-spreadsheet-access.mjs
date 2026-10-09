/**
 * Перевірка доступу service account до бойових таблиць (читання АССОРТИМЕНТ + мета).
 *
 * node scripts/verify-spreadsheet-access.mjs
 */
import fs from "fs";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(backendRoot, ".env") });
dotenv.config({ path: path.join(backendRoot, "..", ".env") });

import {
  ASSORTMENT_SHEET_TITLE,
  SYNC_ERRORS_SHEET_TITLE,
  SPREADSHEET_ID_BY_POINT_KEY,
  resolveServiceAccountPath,
  isGoogleSheetsEnabled,
} from "../lib/googleSheets/config.js";
import { escapeSheetTitle, getSheetsApi, readSheetValues } from "../lib/googleSheets/client.js";
import { findAssortmentModelBlocks } from "../lib/googleSheets/assortmentGrid.js";
import { ASSORTMENT_RETRY_POINT_KEYS } from "../lib/googleSheets/statsScriptPoints.js";

if (!isGoogleSheetsEnabled()) {
  console.error("Google Sheets disabled");
  process.exit(1);
}

const sa = resolveServiceAccountPath();
let clientEmail = "";
try {
  clientEmail = JSON.parse(fs.readFileSync(sa, "utf8")).client_email;
} catch {
  clientEmail = "(unknown)";
}

console.log("Service account:", clientEmail);
console.log("Key file:", sa, "\n");

const points = ASSORTMENT_RETRY_POINT_KEYS.filter((k) => SPREADSHEET_ID_BY_POINT_KEY[k]);
let failed = 0;

for (const pointKey of points) {
  const spreadsheetId = SPREADSHEET_ID_BY_POINT_KEY[pointKey];
  const row = { pointKey, spreadsheetId, ok: false };

  try {
    const sheets = getSheetsApi();
    const meta = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: "properties.title,sheets.properties.title",
    });
    row.title = meta.data.properties?.title || "";
    const titles = (meta.data.sheets || []).map((s) => s.properties?.title);
    row.hasAssortment = titles.includes(ASSORTMENT_SHEET_TITLE);
    row.hasSyncErrors = titles.includes(SYNC_ERRORS_SHEET_TITLE);

    const range = `${escapeSheetTitle(ASSORTMENT_SHEET_TITLE)}!A1:B5`;
    const values = await readSheetValues(spreadsheetId, range);
    row.sampleRows = values?.length || 0;

    const full = await readSheetValues(
      spreadsheetId,
      `${escapeSheetTitle(ASSORTMENT_SHEET_TITLE)}!A1:ZZ50`
    );
    const blocks = full ? findAssortmentModelBlocks(full) : [];
    row.modelBlocks = blocks.length;

    row.ok = row.hasAssortment && row.sampleRows > 0 && row.modelBlocks > 0;
  } catch (e) {
    row.error = String(e?.message || e).slice(0, 200);
    failed += 1;
  }

  if (!row.ok) failed += 1;
  console.log(row);
}

console.log(failed ? `\nFAIL: ${failed} point(s)` : "\nOK: доступ до всіх таблиць");
process.exit(failed ? 1 : 0);
