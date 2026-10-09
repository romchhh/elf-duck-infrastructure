/**
 * Усі позиції fulfilled-замовлень за N днів → чи знайдеться блок і рядок смаку на АССОРТИМЕНТ (без запису в таблицю).
 *
 * node scripts/audit-order-items-sheet-match.mjs --days 21
 * node scripts/audit-order-items-sheet-match.mjs --days 14 --json
 *
 * Показує: OK (точно) / FUZZY (нечітко) / NOT_FOUND / AMBIGUOUS / NO_BLOCK по productKey і точці.
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
import {
  resolveSpreadsheetIdForPointKey,
} from "../lib/googleSheets/config.js";
import {
  orderQualifiesForAssortmentGoogleSync,
  resolveOrderPointKey,
} from "../lib/googleSheets/orderSync.js";
import { getAssortmentSheetModelName } from "../lib/server/helpers/chunk09.js";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const daysIdx = args.indexOf("--days");
const days = Math.max(1, Number(daysIdx >= 0 ? args[daysIdx + 1] : 21) || 21);

await mongoose.connect(process.env.MONGODB_URI);
console.log("db:", mongoose.connection.name, "| days:", days);

const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
const orders = await Order.find({
  createdAt: { $gte: since },
  status: { $in: ["completed", "done", "shipped"] },
}).lean();

const gridCache = new Map();
async function gridFor(pointKey) {
  if (gridCache.has(pointKey)) return gridCache.get(pointKey);
  const id = resolveSpreadsheetIdForPointKey(pointKey);
  const rows = id ? await loadAssortmentGrid(id) : null;
  gridCache.set(pointKey, rows);
  return rows;
}

const stats = {};
const problems = [];

function bump(productKey, kind) {
  stats[productKey] = stats[productKey] || { lines: 0, OK: 0, FUZZY: 0, NOT_FOUND: 0, AMBIGUOUS: 0, NO_BLOCK: 0, NO_SHEET: 0 };
  stats[productKey].lines += 1;
  stats[productKey][kind] += 1;
}

let considered = 0;
for (const order of orders) {
  if (!orderQualifiesForAssortmentGoogleSync(order)) continue;
  considered += 1;
  const pointKey = await resolveOrderPointKey(order);
  const rows = await gridFor(pointKey);

  for (const item of order.items || []) {
    const modelName = getAssortmentSheetModelName(item);
    for (const flavor of item.flavors || []) {
      if (!Number(flavor?.qty || 0)) continue;
      if (!rows) {
        bump(item.productKey, "NO_SHEET");
        continue;
      }
      const block = findAssortmentBlockForModel(rows, modelName, item.productKey);
      if (!block) {
        bump(item.productKey, "NO_BLOCK");
        problems.push({ kind: "NO_BLOCK", pointKey, orderNo: order.orderNo, productKey: item.productKey, flavor: flavor.flavorLabel || flavor.flavorKey });
        continue;
      }
      const labels = buildAssortmentFlavorSearchLabels(flavor, item.productKey);
      const r = resolveAssortmentFlavorRow(rows, block, labels);
      if (r.row < 0) {
        const kind = r.ambiguous ? "AMBIGUOUS" : "NOT_FOUND";
        bump(item.productKey, kind);
        problems.push({ kind, pointKey, orderNo: order.orderNo, productKey: item.productKey, block: block.header, flavor: flavor.flavorLabel || flavor.flavorKey, candidates: r.candidates });
      } else if (r.tier > 1) {
        bump(item.productKey, "FUZZY");
      } else {
        bump(item.productKey, "OK");
      }
    }
  }
}

const grouped = {};
for (const p of problems) {
  const k = `${p.kind} | ${p.pointKey} | ${p.productKey} | ${p.block || ""} | ${p.flavor}`;
  grouped[k] = grouped[k] || { count: 0, orders: [] };
  grouped[k].count += 1;
  if (grouped[k].orders.length < 3) grouped[k].orders.push(p.orderNo);
}

if (asJson) {
  console.log(JSON.stringify({ considered, stats, grouped }, null, 2));
} else {
  console.log("fulfilled orders considered:", considered);
  console.table(stats);
  console.log("\nПроблемні позиції (група → кількість, приклади замовлень):");
  for (const [k, v] of Object.entries(grouped).sort((a, b) => b[1].count - a[1].count)) {
    console.log(`  ${v.count}× ${k}  [${v.orders.join(", ")}]`);
  }
  if (!Object.keys(grouped).length) console.log("  — немає");
}

await mongoose.disconnect();
const bad = Object.values(stats).some((s) => s.NOT_FOUND || s.AMBIGUOUS || s.NO_BLOCK || s.NO_SHEET);
process.exit(bad ? 1 : 0);
