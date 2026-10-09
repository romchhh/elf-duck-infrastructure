/**
 * ЗВІТ (без запису): де старий матч смаків («перший рядок-підрядок», HQD→LIQ BLACK) списав НЕ той рядок
 * для вже застосованих замовлень (googleSheetSync.appliedAt), + чисті коригування по клітинках.
 *
 * node scripts/audit-wrong-flavor-deductions.mjs --days 30
 * node scripts/audit-wrong-flavor-deductions.mjs --days 30 --json
 *
 * Коригування (нетто): «було списано зі СТАРОГО рядка» → +qty; «мало списатись з НОВОГО» → −qty.
 * Застереження: якщо продаж був при 0 (старий код не міняв клітинку), +qty на старому рядку дасть зайву одиницю — перевіряйте вручну.
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(backendRoot, "..");
dotenv.config({ path: path.join(backendRoot, ".env") });
if (!process.env.MONGODB_URI) dotenv.config({ path: path.join(repoRoot, ".env") });

import mongoose from "mongoose";
import Order from "../models/Order.js";
import {
  buildAssortmentFlavorSearchLabels,
  findAssortmentBlockForModel,
  loadAssortmentGrid,
  resolveAssortmentFlavorRow,
} from "../lib/googleSheets/assortmentGrid.js";
import { resolveSpreadsheetIdForPointKey } from "../lib/googleSheets/config.js";
import { resolveOrderPointKey } from "../lib/googleSheets/orderSync.js";
import { getAssortmentSheetModelName } from "../lib/server/helpers/chunk09.js";
import { compactSheetFlavor, flavorMatchesWanted } from "../lib/googleSheets/normalize.js";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const daysIdx = args.indexOf("--days");
const days = Math.max(1, Number(daysIdx >= 0 ? args[daysIdx + 1] : 30) || 30);

/** Старий алгоритм: перший рядок, де flavorMatchesWanted (підрядок). */
function legacyFindRow(rows, block, label) {
  const wanted = compactSheetFlavor(label);
  for (let r = block.headerRow + 1; r < rows.length; r++) {
    const cell = String((rows[r] || [])[block.flavorCol] || "").trim();
    if (!cell) {
      if (r > block.headerRow + 2 && !(rows[r] || []).some((c) => String(c || "").trim())) break;
      continue;
    }
    if (/^total\b/i.test(cell)) break;
    if (flavorMatchesWanted(cell, wanted)) return r;
  }
  return -1;
}

await mongoose.connect(process.env.MONGODB_URI);
console.log("db:", mongoose.connection.name, "| days:", days);

const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
const orders = await Order.find({
  createdAt: { $gte: since },
  "googleSheetSync.appliedAt": { $exists: true, $ne: null },
}).lean();

const cache = new Map();
async function gridFor(pointKey) {
  if (!cache.has(pointKey)) {
    const id = resolveSpreadsheetIdForPointKey(pointKey);
    cache.set(pointKey, id ? await loadAssortmentGrid(id) : null);
  }
  return cache.get(pointKey);
}

const wrongLines = [];
const corrections = {};

for (const order of orders) {
  const pointKey = await resolveOrderPointKey(order);
  const rows = await gridFor(pointKey);
  if (!rows) continue;

  for (const item of order.items || []) {
    const modelName = getAssortmentSheetModelName(item);
    const newBlock = findAssortmentBlockForModel(rows, modelName, item.productKey);
    // До виправлення HQD шукали в LIQ BLACK
    const legacyBlock =
      item.productKey === "chaser-black-30-ml"
        ? findAssortmentBlockForModel(rows, "LIQ BLACK", "chaser-black-30-ml-2")
        : newBlock;
    if (!newBlock || !legacyBlock) continue;

    for (const flavor of item.flavors || []) {
      const qty = Math.max(0, Number(flavor?.qty || 0));
      if (!qty) continue;
      const labels = buildAssortmentFlavorSearchLabels(flavor, item.productKey);

      let legacyRow = -1;
      for (const l of labels) {
        legacyRow = legacyFindRow(rows, legacyBlock, l);
        if (legacyRow >= 0) break;
      }
      const next = resolveAssortmentFlavorRow(rows, newBlock, labels);
      if (legacyRow < 0 || next.row < 0) continue; // не застосовувалось / нічого корегувати
      if (legacyBlock === newBlock && legacyRow === next.row) continue;

      const oldCell = `${legacyBlock.header} / ${String(rows[legacyRow][legacyBlock.flavorCol]).trim()}`;
      const newCell = `${newBlock.header} / ${String(rows[next.row][newBlock.flavorCol]).trim()}`;
      wrongLines.push({ orderNo: order.orderNo, pointKey, qty, deducted: oldCell, shouldBe: newCell });

      const ok = `${pointKey} | ${oldCell}`;
      const nk = `${pointKey} | ${newCell}`;
      corrections[ok] = (corrections[ok] || 0) + qty; // повернути
      corrections[nk] = (corrections[nk] || 0) - qty; // списати
    }
  }
}

const net = Object.entries(corrections).filter(([, v]) => v !== 0).sort((a, b) => a[0].localeCompare(b[0]));

if (asJson) {
  console.log(JSON.stringify({ ordersApplied: orders.length, wrongLines, net }, null, 2));
} else {
  console.log("applied orders checked:", orders.length, "| lines with wrong row:", wrongLines.length);
  for (const l of wrongLines) {
    console.log(`  #${l.orderNo} ${l.pointKey} ×${l.qty}: списано з «${l.deducted}», мало з «${l.shouldBe}»`);
  }
  console.log("\nНетто-коригування по клітинках (+ = повернути на лист, − = додатково списати):");
  for (const [k, v] of net) console.log(`  ${v > 0 ? "+" : ""}${v}  ${k}`);
  if (!net.length) console.log("  — немає");
}

await mongoose.disconnect();
