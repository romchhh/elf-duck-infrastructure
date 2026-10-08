/**
 * Останні рядки листа SYNC_ERRORS (Google таблиця точки).
 *
 * node scripts/audit-sync-errors-sheet.mjs --point mokot-w
 * node scripts/audit-sync-errors-sheet.mjs --point mokot-w --days 14
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(backendRoot, ".env") });

import { readSheetValues } from "../lib/googleSheets/client.js";
import {
  isGoogleSheetsEnabled,
  resolveSpreadsheetIdForPointKey,
  SYNC_ERRORS_SHEET_TITLE,
} from "../lib/googleSheets/config.js";

const args = process.argv.slice(2);
function arg(name, def) {
  const i = args.indexOf(name);
  return i >= 0 ? String(args[i + 1] || "").trim() : def;
}

const pointKey = arg("--point", "mokot-w");
const days = Math.max(1, Number(arg("--days", "30")) || 30);
const filter = arg("--filter", "").toLowerCase();

if (!isGoogleSheetsEnabled()) {
  console.error("Google Sheets disabled");
  process.exit(1);
}

const spreadsheetId = resolveSpreadsheetIdForPointKey(pointKey);
if (!spreadsheetId) {
  console.error("No spreadsheet for", pointKey);
  process.exit(1);
}

const rows = await readSheetValues(
  spreadsheetId,
  `${SYNC_ERRORS_SHEET_TITLE}!A1:K500`
);

const header = rows[0] || [];
const data = rows.slice(1).filter((r) => (r || []).some((c) => String(c || "").trim()));

const since = new Date();
since.setDate(since.getDate() - days);

const parsed = data
  .map((r) => ({
    createdAt: String(r[0] || ""),
    point: String(r[1] || ""),
    dayKey: String(r[2] || ""),
    reason: String(r[3] || ""),
    model: String(r[4] || ""),
    blockOnSheet: String(r[5] || ""),
    flavorLabel: String(r[6] || ""),
    qty: String(r[8] || r[7] || ""),
    hint: String(r[9] || r[10] || ""),
    raw: r,
  }))
  .filter((row) => {
    if (filter && !row.raw.join(" ").toLowerCase().includes(filter)) return false;
    return true;
  });

console.log({
  pointKey,
  spreadsheetId,
  header,
  rows: parsed.length,
  days,
});

const byReason = {};
for (const p of parsed) {
  byReason[p.reason] = (byReason[p.reason] || 0) + 1;
}
console.log("\nBy reason:", byReason);

console.log("\nLast 20 errors:");
for (const p of parsed.slice(-20)) {
  console.log(
    [
      p.createdAt,
      p.reason,
      `block=${p.blockOnSheet || p.model}`,
      `flavor=${p.flavorLabel.slice(0, 60)}`,
      p.qty ? `qty=${p.qty}` : "",
    ]
      .filter(Boolean)
      .join(" | ")
  );
}

console.log(
  "\nМенеджеру: FLAVOR_ROW_NOT_FOUND — додати рядок смаку в АССОРТИМЕНТ під блоком (кол. block). MODEL_BLOCK_NOT_FOUND — перевірити заголовок блоку."
);
console.log(
  "Догнати замовлення: node scripts/retry-google-sheets-assortment.mjs --point",
  pointKey,
  "--day YYYY-MM-DD"
);
