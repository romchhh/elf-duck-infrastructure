/**
 * Mongo listedOnAssortment vs лист АССОРТИМЕНТ (та сама логіка match, що pull-stock).
 *
 * docker compose exec api node scripts/audit-mongo-assortment-visibility.mjs --point wola
 * docker compose exec api node scripts/audit-mongo-assortment-visibility.mjs --all-points
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(backendRoot, ".env") });
if (!process.env.MONGODB_URI) dotenv.config({ path: path.join(backendRoot, "..", ".env") });

import mongoose from "mongoose";
import Product from "../models/Product.js";
import PickupPoint from "../models/PickupPoint.js";
import {
  findAssortmentBlockForModel,
  loadAssortmentGrid,
  matchCatalogFlavorInAssortmentBlock,
} from "../lib/googleSheets/assortmentGrid.js";
import {
  isGoogleSheetsEnabled,
  resolveSpreadsheetIdForPointKey,
  SPREADSHEET_ID_BY_POINT_KEY,
} from "../lib/googleSheets/config.js";
import { getAssortmentSheetModelName } from "../lib/server/helpers/chunk09.js";
import { ASSORTMENT_RETRY_POINT_KEYS } from "../lib/googleSheets/statsScriptPoints.js";

const args = process.argv.slice(2);
function arg(name) {
  const i = args.indexOf(name);
  return i >= 0 ? String(args[i + 1] || "").trim() : "";
}

const pointKeyArg = arg("--point");
const allPoints = args.includes("--all-points");
const limit = Number(arg("--limit") || 25);

if (!allPoints && !pointKeyArg) {
  console.error(
    "Usage: node scripts/audit-mongo-assortment-visibility.mjs --point wola | --all-points [--limit 25]"
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

const dbi = args.indexOf("--db");
await mongoose.connect(
  process.env.MONGODB_URI,
  dbi >= 0 && args[dbi + 1] ? { dbName: String(args[dbi + 1]).trim() } : undefined
);

const points = await PickupPoint.find({}, { _id: 1, key: 1 }).lean();
const idByKey = new Map(
  points.map((p) => [String(p.key || "").trim().toLowerCase().replace(/,+$/, ""), String(p._id)])
);

const products = await Product.find({ isActive: true }, {
  productKey: 1,
  title1: 1,
  title2: 1,
  flavors: 1,
}).lean();

for (const pointKey of pointKeys) {
  const pointId = idByKey.get(pointKey.toLowerCase());
  if (!pointId) {
    console.log(`\n=== ${pointKey} === NO_PICKUP_POINT_IN_MONGO`);
    continue;
  }

  const spreadsheetId = resolveSpreadsheetIdForPointKey(pointKey);
  const rows = await loadAssortmentGrid(spreadsheetId);
  if (!rows) {
    console.log(`\n=== ${pointKey} === SHEETS_READ_FAILED`);
    continue;
  }

  const counts = { listedTrue: 0, listedFalse: 0, unset: 0, activeFlavorRows: 0 };
  const hiddenButOnSheet = [];
  const shownButNotOnSheet = [];
  const blockCache = new Map();

  for (const product of products) {
    const modelName = getAssortmentSheetModelName({
      productKey: product.productKey,
      productTitle1: product.title1,
      productTitle2: product.title2,
    });
    const cacheKey = `${product.productKey}::${modelName}`;
    let block = blockCache.get(cacheKey);
    if (block === undefined) {
      block = findAssortmentBlockForModel(rows, modelName, product.productKey);
      blockCache.set(cacheKey, block);
    }

    for (const flavor of product.flavors || []) {
      if (flavor.isActive === false) continue;
      const stock = (flavor.stockByPickupPoint || []).find(
        (s) => String(s.pickupPointId) === pointId
      );
      if (!stock) continue;

      counts.activeFlavorRows += 1;
      if (stock.listedOnAssortment === true) counts.listedTrue += 1;
      else if (stock.listedOnAssortment === false) counts.listedFalse += 1;
      else counts.unset += 1;

      let sheetOk = false;
      if (block) {
        const match = matchCatalogFlavorInAssortmentBlock(
          rows,
          block,
          flavor,
          product.productKey
        );
        sheetOk = Boolean(match.ok);
      }

      const row = {
        productKey: product.productKey,
        flavorKey: flavor.flavorKey,
        label: flavor.label,
        totalQty: stock.totalQty,
        listedOnAssortment: stock.listedOnAssortment,
      };

      if (stock.listedOnAssortment === false && sheetOk) {
        hiddenButOnSheet.push(row);
      } else if (stock.listedOnAssortment !== false && !sheetOk && block) {
        shownButNotOnSheet.push(row);
      } else if (stock.listedOnAssortment !== false && !block) {
        shownButNotOnSheet.push({ ...row, note: "NO_MODEL_BLOCK" });
      }
    }
  }

  console.log(`\n=== ${pointKey} (db: ${mongoose.connection.name}) ===`);
  console.log("spreadsheet:", spreadsheetId);
  console.log("mongo flags:", counts);
  console.log(
    "expected after pull: listed ≈",
    counts.activeFlavorRows - shownButNotOnSheet.length,
    "| hidden (no row on sheet) ≈",
    shownButNotOnSheet.length
  );

  if (counts.unset === counts.activeFlavorRows) {
    console.log(
      "hint: усі позиції без listedOnAssortment — pull з Google ще не робили; міні-додаток показує ВСІ смаки (як раніше)."
    );
  }

  if (hiddenButOnSheet.length) {
    console.log(`\n⚠️ Mongo hidden (listed=false), але рядок Є на листі (перший ${limit}):`);
    for (const r of hiddenButOnSheet.slice(0, limit)) console.log(" ", r);
  }

  if (shownButNotOnSheet.length) {
    console.log(`\n⚠️ У міні-додатку видно (listed≠false), але рядка нема на листі (перший ${limit}):`);
    for (const r of shownButNotOnSheet.slice(0, limit)) console.log(" ", r);
  }

  if (!hiddenButOnSheet.length && !shownButNotOnSheet.length && counts.listedFalse > 0) {
    console.log("mongo listed=false збігається з відсутніми рядками на листі.");
  }
}

await mongoose.disconnect();
