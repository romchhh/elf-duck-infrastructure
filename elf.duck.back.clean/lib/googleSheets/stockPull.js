/**
 * Google Таблиця АССОРТИМЕНТ → MongoDB (totalQty по точках).
 *
 * Джерело правди для залишків — лист АССОРТИМЕНТ. Mongo (те, що бачить міні-додаток)
 * вирівнюється по ньому:
 *  - щодня о 08:00 (Europe/Warsaw) — усі склади;
 *  - після кожного замовлення (створення, виконання, InPost-відправка, повернення) — відповідна таблиця.
 *
 * reservedQty (резерви кошиків) не змінюється, лише обрізається до totalQty.
 */
import mongoose from "mongoose";
import Product from "../../models/Product.js";
import PickupPoint from "../../models/PickupPoint.js";
import {
  buildAssortmentFlavorSearchLabels,
  findAssortmentBlockForModel,
  findAssortmentModelBlocks,
  loadAssortmentGrid,
  parseAssortmentQty,
  resolveAssortmentFlavorRow,
} from "./assortmentGrid.js";
import {
  isGoogleSheetsEnabled,
  resolveSpreadsheetIdForPointKey,
  SPREADSHEET_ID_BY_POINT_KEY,
} from "./config.js";
import { getAssortmentSheetModelName } from "../server/helpers/chunk09.js";
import { cacheInvalidate } from "../server/helpers/chunk01.js";

export const STOCK_PULL_POINT_KEYS = [
  "praga",
  "r-dmie-cie",
  "mokot-w",
  "wola",
  "delivery-2",
  "delivery",
];

/** Мінімум блоків моделей на листі: менше — вважаємо, що лист порожній/зламаний і Mongo не чіпаємо. */
const MIN_SHEET_BLOCKS = 20;
const BULK_CHUNK = 400;

function normKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/,+$/, "");
}

/** pointKey → { spreadsheetId, pointKeys[] } (wola + delivery-2 — одна таблиця). */
function groupPointKeysBySpreadsheet(pointKeys) {
  const groups = new Map();
  for (const raw of pointKeys) {
    const key = normKey(raw);
    if (!key) continue;
    const spreadsheetId = resolveSpreadsheetIdForPointKey(key);
    if (!spreadsheetId) continue;
    const g = groups.get(spreadsheetId) || { spreadsheetId, pointKeys: [] };
    if (!g.pointKeys.includes(key)) g.pointKeys.push(key);
    groups.set(spreadsheetId, g);
  }
  return [...groups.values()];
}

async function pickupPointIdsByKey() {
  const points = await PickupPoint.find({}, { _id: 1, key: 1 }).lean();
  const map = new Map();
  for (const p of points) {
    const key = normKey(p.key);
    if (key) map.set(key, String(p._id));
  }
  return map;
}

async function flushBulk(ops) {
  let modified = 0;
  for (let i = 0; i < ops.length; i += BULK_CHUNK) {
    const chunk = ops.slice(i, i + BULK_CHUNK);
    const res = await Product.bulkWrite(chunk, { ordered: false });
    modified += Number(res?.modifiedCount || 0);
  }
  return modified;
}

async function pullOneSpreadsheet({ spreadsheetId, pointKeys }, products, pointIdByKey, dryRun) {
  const result = {
    spreadsheetId,
    pointKeys,
    ok: false,
    flavorsChecked: 0,
    updated: 0,
    created: 0,
    unchanged: 0,
    missingRows: [],
    changes: [],
  };

  const pointIds = pointKeys
    .map((k) => pointIdByKey.get(k))
    .filter(Boolean)
    .map((id) => new mongoose.Types.ObjectId(id));

  if (!pointIds.length) {
    result.error = "NO_PICKUP_POINT_IN_DB";
    return result;
  }

  const rows = await loadAssortmentGrid(spreadsheetId);
  if (!rows) {
    result.error = "SHEETS_DISABLED";
    return result;
  }
  const blockCount = findAssortmentModelBlocks(rows).length;
  if (blockCount < MIN_SHEET_BLOCKS) {
    result.error = `SHEET_TOO_SMALL (blocks=${blockCount})`;
    return result;
  }

  const blockCache = new Map();
  const ops = [];

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

    const activeProduct = product.isActive !== false;

    if (!block) {
      if (activeProduct && (product.flavors || []).length) {
        result.missingRows.push({
          kind: "NO_BLOCK",
          productKey: product.productKey,
          modelName,
        });
      }
      continue;
    }

    for (const flavor of product.flavors || []) {
      result.flavorsChecked += 1;

      const labels = buildAssortmentFlavorSearchLabels(
        {
          flavorKey: flavor.flavorKey,
          flavorLabel: flavor.label,
          label: flavor.label,
        },
        product.productKey
      );
      const resolved = resolveAssortmentFlavorRow(rows, block, labels);

      if (resolved.row < 0) {
        if (activeProduct && flavor.isActive !== false) {
          result.missingRows.push({
            kind: resolved.ambiguous ? "AMBIGUOUS" : "NO_ROW",
            productKey: product.productKey,
            flavorKey: flavor.flavorKey,
            label: flavor.label,
            block: block.header,
          });
        }
        continue;
      }

      // На листі від’ємне значення = «продано більше, ніж було» → у Mongo 0.
      const sheetQty = Math.max(
        0,
        parseAssortmentQty(rows[resolved.row]?.[block.qtyCol])
      );

      for (const pointId of pointIds) {
        const existing = (flavor.stockByPickupPoint || []).find(
          (s) => String(s.pickupPointId) === String(pointId)
        );

        if (existing) {
          const total = Math.max(0, Number(existing.totalQty || 0));
          const reserved = Math.max(0, Number(existing.reservedQty || 0));
          const nextReserved = Math.min(reserved, sheetQty);

          if (total === sheetQty && reserved === nextReserved) {
            result.unchanged += 1;
            continue;
          }

          result.updated += 1;
          if (result.changes.length < 200) {
            result.changes.push({
              productKey: product.productKey,
              flavorKey: flavor.flavorKey,
              point: pointKeys.join("+"),
              from: total,
              to: sheetQty,
            });
          }

          ops.push({
            updateOne: {
              filter: { _id: product._id },
              update: {
                $set: {
                  "flavors.$[f].stockByPickupPoint.$[s].totalQty": sheetQty,
                  "flavors.$[f].stockByPickupPoint.$[s].reservedQty": nextReserved,
                  "flavors.$[f].stockByPickupPoint.$[s].updatedAt": new Date(),
                  "flavors.$[f].stockByPickupPoint.$[s].updatedByTelegramId":
                    "google-sheet-sync",
                },
              },
              arrayFilters: [{ "f._id": flavor._id }, { "s.pickupPointId": pointId }],
            },
          });
        } else {
          result.created += 1;
          ops.push({
            updateOne: {
              filter: { _id: product._id },
              update: {
                $push: {
                  "flavors.$[f].stockByPickupPoint": {
                    pickupPointId: pointId,
                    totalQty: sheetQty,
                    reservedQty: 0,
                    updatedAt: new Date(),
                    updatedByTelegramId: "google-sheet-sync",
                  },
                },
              },
              arrayFilters: [{ "f._id": flavor._id }],
            },
          });
        }
      }
    }
  }

  if (!dryRun && ops.length) {
    await flushBulk(ops);
  }

  result.ok = true;
  return result;
}

/**
 * @param {{ pointKeys?: string[], dryRun?: boolean, reason?: string }} opts
 */
export async function pullStockFromSheets(opts = {}) {
  const startedAt = Date.now();
  const dryRun = Boolean(opts.dryRun);
  const reason = String(opts.reason || "manual");

  if (!isGoogleSheetsEnabled()) {
    return { ok: false, reason: "DISABLED" };
  }

  const requested =
    Array.isArray(opts.pointKeys) && opts.pointKeys.length
      ? opts.pointKeys
      : STOCK_PULL_POINT_KEYS.filter((k) => SPREADSHEET_ID_BY_POINT_KEY[k]);

  const groups = groupPointKeysBySpreadsheet(requested);
  if (!groups.length) {
    return { ok: false, reason: "NO_SPREADSHEETS" };
  }

  const [products, pointIdByKey] = await Promise.all([
    Product.find({}).lean(),
    pickupPointIdsByKey(),
  ]);

  const sheets = [];
  for (const group of groups) {
    try {
      sheets.push(await pullOneSpreadsheet(group, products, pointIdByKey, dryRun));
    } catch (e) {
      sheets.push({
        spreadsheetId: group.spreadsheetId,
        pointKeys: group.pointKeys,
        ok: false,
        error: String(e?.message || e).slice(0, 300),
        missingRows: [],
        changes: [],
      });
    }
  }

  if (!dryRun) {
    try {
      cacheInvalidate("products:");
    } catch (_) {}
  }

  const totals = sheets.reduce(
    (acc, s) => {
      acc.updated += Number(s.updated || 0);
      acc.created += Number(s.created || 0);
      acc.unchanged += Number(s.unchanged || 0);
      acc.missing += (s.missingRows || []).length;
      if (!s.ok) acc.failedSheets += 1;
      return acc;
    },
    { updated: 0, created: 0, unchanged: 0, missing: 0, failedSheets: 0 }
  );

  const summary = {
    ok: totals.failedSheets === 0,
    reason,
    dryRun,
    durationMs: Date.now() - startedAt,
    totals,
    sheets,
  };

  console.log(
    `[stockPull] ${reason}${dryRun ? " (dry-run)" : ""}:`,
    JSON.stringify({ ...totals, durationMs: summary.durationMs })
  );
  for (const s of sheets) {
    if (!s.ok) {
      console.error("[stockPull] sheet failed:", s.pointKeys.join("+"), s.error);
    } else if ((s.missingRows || []).length) {
      console.warn(
        `[stockPull] ${s.pointKeys.join("+")}: немає рядка на листі для ${s.missingRows.length} позицій (Mongo не змінено)`
      );
    }
  }

  return summary;
}

/* ---------------- черга після замовлень (debounce + один запуск за раз) ---------------- */

const DEBOUNCE_MS = Number(process.env.STOCK_PULL_DEBOUNCE_MS || 5000);
const pendingPointKeys = new Set();
let debounceTimer = null;
let running = false;
let rerunRequested = false;

async function runQueued() {
  if (running) {
    rerunRequested = true;
    return;
  }
  running = true;
  try {
    do {
      rerunRequested = false;
      const keys = [...pendingPointKeys];
      pendingPointKeys.clear();
      if (!keys.length) break;
      try {
        await pullStockFromSheets({ pointKeys: keys, reason: "after-order" });
      } catch (e) {
        console.error("[stockPull] after-order failed:", e?.message || e);
      }
    } while (rerunRequested || pendingPointKeys.size);
  } finally {
    running = false;
  }
}

/** Заплановано оновити Mongo з таблиці точки (кілька викликів поспіль зливаються в один). */
export function queueStockPullForPointKey(pointKey) {
  if (!isGoogleSheetsEnabled()) return;
  const key = normKey(pointKey);
  if (!key || !resolveSpreadsheetIdForPointKey(key)) return;

  pendingPointKeys.add(key);
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    runQueued().catch((e) =>
      console.error("[stockPull] queue error:", e?.message || e)
    );
  }, DEBOUNCE_MS);
}
