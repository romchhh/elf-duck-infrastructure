/**
 * Аудит: чи кожен активний товар/смак з Mongo знайде блок і рядок на листі АССОРТИМЕНТ.
 *
 * docker compose exec api node scripts/audit-assortment-catalog-match.mjs --point mokot-w
 * docker compose exec api node scripts/audit-assortment-catalog-match.mjs --all-points
 * docker compose exec api node scripts/audit-assortment-catalog-match.mjs --point mokot-w --json
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(backendRoot, ".env") });

import mongoose from "mongoose";
import Product from "../models/Product.js";
import {
  findAssortmentBlockForModel,
  findAssortmentModelBlocks,
  listAssortmentFlavorsInBlock,
  loadAssortmentGrid,
  matchCatalogFlavorInAssortmentBlock,
} from "../lib/googleSheets/assortmentGrid.js";
import {
  isGoogleSheetsEnabled,
  resolveSpreadsheetIdForPointKey,
  SPREADSHEET_ID_BY_POINT_KEY,
} from "../lib/googleSheets/config.js";
import { normalizeSheetModelName } from "../lib/googleSheets/normalize.js";
import { getAssortmentSheetModelName } from "../lib/server/helpers/chunk09.js";
import { ASSORTMENT_RETRY_POINT_KEYS } from "../lib/googleSheets/statsScriptPoints.js";

const args = process.argv.slice(2);
function arg(name) {
  const i = args.indexOf(name);
  return i >= 0 ? String(args[i + 1] || "").trim() : "";
}

const pointKeyArg = arg("--point");
const allPoints = args.includes("--all-points");
const asJson = args.includes("--json");
const includeInactive = args.includes("--include-inactive");

if (!allPoints && !pointKeyArg) {
  console.error(
    "Usage: node scripts/audit-assortment-catalog-match.mjs --point mokot-w | --all-points [--json] [--include-inactive]"
  );
  process.exit(1);
}

if (!isGoogleSheetsEnabled()) {
  console.error("Google Sheets disabled in config");
  process.exit(1);
}

const pointKeys = allPoints
  ? ASSORTMENT_RETRY_POINT_KEYS.filter((k) => SPREADSHEET_ID_BY_POINT_KEY[k])
  : [pointKeyArg];

await mongoose.connect(process.env.MONGODB_URI);

const productFilter = includeInactive ? {} : { isActive: true };
const products = await Product.find(productFilter, {
  productKey: 1,
  title1: 1,
  title2: 1,
  categoryKey: 1,
  isActive: 1,
  flavors: 1,
})
  .sort({ sortOrder: 1, productKey: 1 })
  .lean();

const catalogItems = [];

for (const product of products) {
  const rowShape = {
    productKey: product.productKey,
    productTitle1: product.title1,
    productTitle2: product.title2,
  };
  const modelName = getAssortmentSheetModelName(rowShape);
  const flavors = (product.flavors || []).filter(
    (f) => includeInactive || f.isActive !== false
  );

  if (!flavors.length) {
    catalogItems.push({
      productKey: product.productKey,
      modelName,
      categoryKey: product.categoryKey,
      isActive: product.isActive,
      kind: "no_flavors",
    });
    continue;
  }

  for (const flavor of flavors) {
    catalogItems.push({
      productKey: product.productKey,
      modelName,
      categoryKey: product.categoryKey,
      isActive: product.isActive,
      flavorKey: flavor.flavorKey,
      flavorLabel: flavor.label,
      kind: "flavor",
    });
  }
}

const reportByPoint = {};

for (const pointKey of pointKeys) {
  const spreadsheetId = resolveSpreadsheetIdForPointKey(pointKey);
  if (!spreadsheetId) {
    reportByPoint[pointKey] = { ok: false, reason: "NO_SPREADSHEET" };
    continue;
  }

  const rows = await loadAssortmentGrid(spreadsheetId);
  if (!rows) {
    reportByPoint[pointKey] = { ok: false, reason: "SHEETS_READ_FAILED" };
    continue;
  }

  const sheetBlocks = findAssortmentModelBlocks(rows);
  const sheetHeaders = sheetBlocks.map((b) => b.header);

  const modelMissing = [];
  const modelMissingKeys = new Set();
  const flavorMissing = [];
  const modelOk = [];
  const flavorOk = [];

  const blockCache = new Map();

  for (const item of catalogItems) {
    if (item.kind === "no_flavors") continue;

    const cacheKey = `${item.productKey}::${item.modelName}`;
    let block = blockCache.get(cacheKey);
    if (block === undefined) {
      block = findAssortmentBlockForModel(rows, item.modelName, item.productKey);
      blockCache.set(cacheKey, block);
    }

    if (!block) {
      modelMissing.push(item);
      modelMissingKeys.add(cacheKey);
      continue;
    }

    if (!modelOk.some((m) => m.cacheKey === cacheKey)) {
      modelOk.push({
        cacheKey,
        productKey: item.productKey,
        modelName: item.modelName,
        sheetHeader: block.header,
      });
    }

    const match = matchCatalogFlavorInAssortmentBlock(rows, block, {
      flavorKey: item.flavorKey,
      label: item.flavorLabel,
      flavorLabel: item.flavorLabel,
    });

    if (match.ok) {
      flavorOk.push({
        productKey: item.productKey,
        flavorKey: item.flavorKey,
        flavorLabel: item.flavorLabel,
        sheetLabel: match.sheetLabel,
        matchedLabel: match.matchedLabel,
      });
    } else {
      const sheetFlavors = listAssortmentFlavorsInBlock(rows, block);
      flavorMissing.push({
        productKey: item.productKey,
        modelName: item.modelName,
        sheetHeader: block.header,
        flavorKey: item.flavorKey,
        flavorLabel: item.flavorLabel,
        triedLabels: match.triedLabels,
        sheetFlavorsSample: sheetFlavors.slice(0, 8),
        sheetFlavorCount: sheetFlavors.length,
      });
    }
  }

  const mappedHeaders = new Set(
    modelOk.map((m) => normalizeSheetModelName(m.sheetHeader))
  );
  const orphanBlocks = sheetBlocks
    .filter((b) => !mappedHeaders.has(normalizeSheetModelName(b.header)))
    .map((b) => ({
      header: b.header,
      flavorCount: listAssortmentFlavorsInBlock(rows, b).length,
    }));

  reportByPoint[pointKey] = {
    spreadsheetId,
    sheetBlockCount: sheetBlocks.length,
    catalogFlavorRows: catalogItems.filter((i) => i.kind === "flavor").length,
    modelsOk: modelOk.length,
    modelsMissing: modelMissingKeys.size,
    flavorsOk: flavorOk.length,
    flavorsMissing: flavorMissing.length,
    modelMissingUnique: dedupeByKey(
      modelMissing.map((m) => ({
        productKey: m.productKey,
        modelName: m.modelName,
      })),
      (x) => `${x.productKey}|${x.modelName}`
    ),
    flavorMissing,
    orphanSheetBlocks: orphanBlocks,
    allSheetHeaders: sheetHeaders,
  };
}

function dedupeByKey(list, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const k = keyFn(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

if (asJson) {
  console.log(JSON.stringify(reportByPoint, null, 2));
} else {
  for (const [pointKey, rep] of Object.entries(reportByPoint)) {
    if (rep.reason) {
      console.log(`\n=== ${pointKey} === FAIL: ${rep.reason}`);
      continue;
    }

    console.log(`\n=== ${pointKey} (${rep.spreadsheetId}) ===`);
    console.log(
      `Моделі: OK ${rep.modelsOk} / missing ${rep.modelsMissing} | Смаки: OK ${rep.flavorsOk} / missing ${rep.flavorsMissing} (каталог ${rep.catalogFlavorRows} рядків)`
    );

    if (rep.modelMissingUnique.length) {
      console.log("\n— MODEL_BLOCK_NOT_FOUND (товар → заголовок на листі):");
      for (const m of rep.modelMissingUnique) {
        console.log(`  • ${m.productKey} → sync model «${m.modelName}»`);
      }
    }

    if (rep.flavorMissing.length) {
      console.log("\n— FLAVOR_ROW_NOT_FOUND (перші 25):");
      for (const f of rep.flavorMissing.slice(0, 25)) {
        console.log(
          `  • ${f.productKey} / ${f.flavorKey} «${f.flavorLabel}» [${f.sheetHeader}] tried: ${f.triedLabels.join(" | ")}`
        );
        if (f.sheetFlavorsSample.length) {
          console.log(
            `      sheet sample: ${f.sheetFlavorsSample.join(" | ")}${f.sheetFlavorCount > 8 ? ` (+${f.sheetFlavorCount - 8})` : ""}`
          );
        }
      }
      if (rep.flavorMissing.length > 25) {
        console.log(`  … ще ${rep.flavorMissing.length - 25} смаків`);
      }
    }

    if (rep.orphanSheetBlocks.length) {
      console.log("\n— Блоки на листі без товару в каталозі (перші 15):");
      for (const b of rep.orphanSheetBlocks.slice(0, 15)) {
        console.log(`  • «${b.header}» (${b.flavorCount} смаків)`);
      }
    }

    if (
      !rep.modelMissingUnique.length &&
      !rep.flavorMissing.length
    ) {
      console.log("\n✅ Усі активні смаки каталогу матчаться з АССОРТИМЕНТ.");
    }
  }
}

let exitCode = 0;
for (const rep of Object.values(reportByPoint)) {
  if (rep.reason || rep.modelsMissing > 0 || rep.flavorsMissing > 0) {
    exitCode = 1;
  }
}

await mongoose.disconnect();
process.exit(exitCode);
