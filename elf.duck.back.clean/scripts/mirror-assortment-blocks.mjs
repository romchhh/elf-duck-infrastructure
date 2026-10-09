/**
 * Копіює блоки АССОРТИМЕНТ (назва смаку + кількість) з однієї таблиці в іншу
 * в ту саму колонку, де заголовок блоку (як на wola).
 *
 * Приклад (XROS 6 на delivery порожні — дані є на wola):
 *   node scripts/mirror-assortment-blocks.mjs --from wola --to delivery \
 *     --blocks "XROS 6 MINI POD,XROS 6 POD" --dry-run
 *   node scripts/mirror-assortment-blocks.mjs --from wola --to delivery \
 *     --blocks "XROS 6 MINI POD,XROS 6 POD,XROS 5 MINI POD"
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(backendRoot, ".env") });
if (!process.env.MONGODB_URI) dotenv.config({ path: path.join(backendRoot, "..", ".env") });

import {
  findAssortmentModelBlocks,
  listAssortmentFlavorsInBlock,
  loadAssortmentGrid,
} from "../lib/googleSheets/assortmentGrid.js";
import {
  ASSORTMENT_SHEET_TITLE,
  isGoogleSheetsEnabled,
  resolveSpreadsheetIdForPointKey,
} from "../lib/googleSheets/config.js";
import { batchUpdateValues, escapeSheetTitle } from "../lib/googleSheets/client.js";
import { normalizeSheetModelName } from "../lib/googleSheets/normalize.js";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
function arg(name) {
  const i = args.indexOf(name);
  return i >= 0 ? String(args[i + 1] || "").trim() : "";
}

const fromKey = arg("--from");
const toKey = arg("--to");
const blocksArg = arg("--blocks");

if (!fromKey || !toKey || !blocksArg) {
  console.error(
    "Usage: node scripts/mirror-assortment-blocks.mjs --from wola --to delivery --blocks \"XROS 6 MINI POD,XROS 6 POD\" [--dry-run]"
  );
  process.exit(1);
}

if (!isGoogleSheetsEnabled()) {
  console.error("Google Sheets disabled");
  process.exit(1);
}

const wantedHeaders = blocksArg
  .split(",")
  .map((s) => normalizeSheetModelName(s.trim()))
  .filter(Boolean);

function findBlockByHeader(rows, wanted) {
  const blocks = findAssortmentModelBlocks(rows);
  return blocks.find((b) => normalizeSheetModelName(b.header) === wanted) || null;
}

function colToA1(col) {
  let n = col + 1;
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function collectBlockRows(rows, block) {
  const out = [];
  const start = block.headerRow + 1;
  for (let r = start; r < rows.length; r++) {
    const row = rows[r] || [];
    const flavor = String(row[block.flavorCol] || "").trim();
    if (!flavor) {
      if (r > start + 1 && !row.some((c) => String(c || "").trim())) break;
      continue;
    }
    if (/^total\b/i.test(flavor)) break;
    if (/^кол-во$/i.test(flavor)) continue;
    const qty = row[block.qtyCol];
    out.push({ sheetRow: r + 1, flavor, qty });
  }
  return out;
}

const fromId = resolveSpreadsheetIdForPointKey(fromKey);
const toId = resolveSpreadsheetIdForPointKey(toKey);
if (!fromId || !toId) {
  console.error("Missing spreadsheet for", fromKey, toKey);
  process.exit(1);
}

const [fromRows, toRows] = await Promise.all([
  loadAssortmentGrid(fromId),
  loadAssortmentGrid(toId),
]);

const updates = [];

for (const wanted of wantedHeaders) {
  const src = findBlockByHeader(fromRows, wanted);
  const dst = findBlockByHeader(toRows, wanted);
  if (!src) {
    console.warn("SKIP source block not found:", wanted);
    continue;
  }
  if (!dst) {
    console.warn("SKIP dest block not found:", wanted);
    continue;
  }

  const srcData = collectBlockRows(fromRows, src);
  const dstExisting = listAssortmentFlavorsInBlock(toRows, dst).length;

  console.log(
    `\n${wanted}: ${fromKey} → ${toKey} | rows=${srcData.length} (dest had ${dstExisting} flavors) col ${colToA1(dst.flavorCol)}`
  );

  for (let i = 0; i < srcData.length; i++) {
    const targetRow = dst.headerRow + 1 + i;
    const { flavor, qty } = srcData[i];
    const flavorA1 = `${escapeSheetTitle(ASSORTMENT_SHEET_TITLE)}!${colToA1(dst.flavorCol)}${targetRow}`;
    const qtyA1 = `${escapeSheetTitle(ASSORTMENT_SHEET_TITLE)}!${colToA1(dst.qtyCol)}${targetRow}`;
    console.log(`  ${flavorA1} = ${flavor} | ${qtyA1} = ${qty}`);
    updates.push({ range: flavorA1, values: [[flavor]] });
    updates.push({ range: qtyA1, values: [[qty]] });
  }
}

if (!updates.length) {
  console.log("\nNothing to write.");
  process.exit(0);
}

if (dryRun) {
  console.log(`\nDry-run: ${updates.length} cell updates (not written).`);
  process.exit(0);
}

await batchUpdateValues(toId, updates);
console.log(`\nWrote ${updates.length} cells to ${toKey} (${toId}).`);
console.log("Then: node scripts/pull-stock-from-sheets.mjs --point delivery");
