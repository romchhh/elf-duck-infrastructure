/**
 * Заміна голого «MERRY MI» (жижа) → «MERRY MI 3%» на всіх листах таблиць точок.
 * Не чіпає MERRY MI 30K / BLADE та інші варіанти.
 *
 *   node scripts/rename-merry-mi-liquid-3pct-sheets.mjs --dry-run
 *   node scripts/rename-merry-mi-liquid-3pct-sheets.mjs
 */
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { SPREADSHEET_ID_BY_POINT_KEY } from "../lib/googleSheets/config.js";
import {
  batchUpdateValues,
  escapeSheetTitle,
  getSpreadsheetMeta,
  readSheetValues,
} from "../lib/googleSheets/client.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config();
dotenv.config({ path: path.join(scriptDir, "..", "..", ".env") });

const dryRun = process.argv.includes("--dry-run");
const REPLACEMENT = "MERRY MI 3%";
const SKIP_TABS = new Set(["SYNC_ERRORS", "STATS_LOG"]);

function colToA1(colIndex) {
  let n = colIndex + 1;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function isExactMerryMiLiquid(cell) {
  const t = String(cell || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
  return t === "MERRY MI";
}

const POINT_KEYS = ["praga", "r-dmie-cie", "mokot-w", "wola", "delivery"];

async function collectUpdates(spreadsheetId, sheetTitle) {
  const range = `${escapeSheetTitle(sheetTitle)}!A1:BZ500`;
  const rows = await readSheetValues(spreadsheetId, range);
  const data = [];

  for (let r = 0; r < (rows || []).length; r++) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c++) {
      if (!isExactMerryMiLiquid(row[c])) continue;
      const a1 = `${colToA1(c)}${r + 1}`;
      data.push({
        range: `${escapeSheetTitle(sheetTitle)}!${a1}`,
        values: [[REPLACEMENT]],
        sheetTitle,
        a1,
        before: String(row[c]).trim(),
      });
    }
  }

  return data;
}

async function main() {
  const seenIds = new Map();
  for (const key of POINT_KEYS) {
    const id = String(SPREADSHEET_ID_BY_POINT_KEY[key] || "").trim();
    if (!id || seenIds.has(id)) continue;
    seenIds.set(id, key);
  }

  let totalCells = 0;

  for (const [spreadsheetId, pointKey] of seenIds) {
    const meta = await getSpreadsheetMeta(spreadsheetId);
    const titles = (meta?.sheets || [])
      .map((s) => s.properties?.title)
      .filter((t) => t && !SKIP_TABS.has(t));

    console.log(`\n=== ${pointKey} (${spreadsheetId}) ===`);

    const allUpdates = [];
    for (const title of titles) {
      const part = await collectUpdates(spreadsheetId, title);
      if (part.length) {
        console.log(`  ${title}: ${part.length} cell(s)`);
        for (const u of part.slice(0, 5)) {
          console.log(`    ${u.a1}: "${u.before}" → "${REPLACEMENT}"`);
        }
        if (part.length > 5) console.log(`    ... +${part.length - 5} more`);
        allUpdates.push(...part);
      }
    }

    if (!allUpdates.length) {
      console.log("  (nothing to change)");
      continue;
    }

    totalCells += allUpdates.length;

    if (dryRun) continue;

    const chunkSize = 200;
    for (let i = 0; i < allUpdates.length; i += chunkSize) {
      const chunk = allUpdates.slice(i, i + chunkSize).map(({ range, values }) => ({
        range,
        values,
      }));
      await batchUpdateValues(spreadsheetId, chunk);
    }
    console.log(`  ✓ updated ${allUpdates.length} cells`);
  }

  console.log(
    dryRun
      ? `\nDry-run: would update ${totalCells} cells. Re-run without --dry-run to write.`
      : `\nDone: updated ${totalCells} cells across ${seenIds.size} spreadsheets.`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});