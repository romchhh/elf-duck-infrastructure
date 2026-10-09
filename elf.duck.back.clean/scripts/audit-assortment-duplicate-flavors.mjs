/**
 * Дублікати рядків смаків на АССОРТИМЕНТ (списання йде в перший рядок — можливі «зайві» мінуси).
 *
 * docker compose exec api node scripts/audit-assortment-duplicate-flavors.mjs --all-points
 * docker compose exec api node scripts/audit-assortment-duplicate-flavors.mjs --point mokot-w
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(backendRoot, ".env") });

import {
  findAssortmentModelBlocks,
  listAssortmentDuplicateFlavorsInBlock,
  loadAssortmentGrid,
} from "../lib/googleSheets/assortmentGrid.js";
import {
  isGoogleSheetsEnabled,
  resolveSpreadsheetIdForPointKey,
  SPREADSHEET_ID_BY_POINT_KEY,
} from "../lib/googleSheets/config.js";
import { ASSORTMENT_RETRY_POINT_KEYS } from "../lib/googleSheets/statsScriptPoints.js";

const args = process.argv.slice(2);
function arg(name) {
  const i = args.indexOf(name);
  return i >= 0 ? String(args[i + 1] || "").trim() : "";
}

const pointKeyArg = arg("--point");
const allPoints = args.includes("--all-points");
const asJson = args.includes("--json");

if (!allPoints && !pointKeyArg) {
  console.error(
    "Usage: node scripts/audit-assortment-duplicate-flavors.mjs --point mokot-w | --all-points [--json]"
  );
  process.exit(1);
}

if (!isGoogleSheetsEnabled()) {
  console.error("Google Sheets disabled");
  process.exit(1);
}

const pointKeys = allPoints
  ? ASSORTMENT_RETRY_POINT_KEYS.filter((k) => SPREADSHEET_ID_BY_POINT_KEY[k])
  : [pointKeyArg];

const report = {};

for (const pointKey of pointKeys) {
  const spreadsheetId = resolveSpreadsheetIdForPointKey(pointKey);
  if (!spreadsheetId) {
    report[pointKey] = { ok: false, reason: "NO_SPREADSHEET" };
    continue;
  }

  const rows = await loadAssortmentGrid(spreadsheetId);
  if (!rows) {
    report[pointKey] = { ok: false, reason: "GRID_LOAD_FAILED" };
    continue;
  }

  const blocks = findAssortmentModelBlocks(rows);
  const issues = [];

  for (const block of blocks) {
    const dups = listAssortmentDuplicateFlavorsInBlock(rows, block);
    for (const d of dups) {
      issues.push({
        blockHeader: block.header,
        flavorKey: d.key,
        rows: d.entries,
      });
    }
  }

  report[pointKey] = {
    ok: issues.length === 0,
    duplicateGroups: issues.length,
    issues,
  };
}

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  for (const [pk, r] of Object.entries(report)) {
    if (!r.ok && r.reason) {
      console.log(pk, r);
      continue;
    }
    console.log(`\n=== ${pk} === duplicate groups: ${r.duplicateGroups}`);
    for (const issue of r.issues || []) {
      console.log(
        `  ${issue.blockHeader}: ${issue.rows.map((x) => `ряд ${x.row} «${x.label}»`).join(" | ")}`
      );
    }
  }
}

const fail = Object.values(report).some((r) => r.duplicateGroups > 0 || r.reason);
process.exit(fail ? 1 : 0);
