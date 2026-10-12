/**
 * Знайти всі кошики з товаром/смаком, очистити + вирівняти reservedQty по фактичних кошиках.
 * Якщо кошиків немає — знімає «привид» резерву на складі.
 *
 * docker compose exec api node scripts/clear-carts-holding-flavor.mjs \
 *   --product puffy-30-ml --flavor cherry-ice --point mokot-w
 *
 * docker compose exec api node scripts/clear-carts-holding-flavor.mjs \
 *   --product puffy-30-ml --flavor cherry-ice --dry-run
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import Product from "../models/Product.js";
import PickupPoint from "../models/PickupPoint.js";
import Cart from "../models/Cart.js";
import { cacheInvalidate } from "../lib/server/helpers/chunk01.js";
import { getSyncedPickupPointIdsByAnyPoint } from "../lib/server/helpers/chunk04.js";
import {
  getCartItemFlavorRows,
  releaseReservedStockForCart,
} from "../lib/server/helpers/chunk08.js";
import { getCartStockContextId } from "../lib/server/helpers/chunk07.js";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(backendRoot, ".env") });
if (!process.env.MONGODB_URI) dotenv.config({ path: path.join(backendRoot, "..", ".env") });

const args = process.argv.slice(2);
function arg(name) {
  const i = args.indexOf(name);
  return i >= 0 ? String(args[i + 1] || "").trim() : "";
}

const productKey = arg("--product");
const flavorKey = arg("--flavor");
const pointKey = arg("--point");
const dryRun = args.includes("--dry-run");
const clearCarts = !args.includes("--reconcile-only");

if (!productKey || !flavorKey) {
  console.error(
    "Usage: node scripts/clear-carts-holding-flavor.mjs --product puffy-30-ml --flavor cherry-ice [--point mokot-w] [--dry-run] [--reconcile-only]"
  );
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI);

const allPoints = await PickupPoint.find({}).lean();
const pointById = new Map(allPoints.map((p) => [String(p._id), p]));

const targetPointIds = new Set();
if (pointKey) {
  const pt = await PickupPoint.findOne({
    key: new RegExp(`^${pointKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"),
  }).lean();
  if (!pt) {
    console.error("Point not found:", pointKey);
    process.exit(1);
  }
  const linked = await getSyncedPickupPointIdsByAnyPoint(pt._id);
  for (const id of linked) targetPointIds.add(String(id));
} else {
  for (const p of allPoints) targetPointIds.add(String(p._id));
}

function cartHasTargetItem(cart) {
  for (const item of cart.items || []) {
    if (String(item.productKey || "").trim() !== productKey) continue;
    const rows = getCartItemFlavorRows(item);
    if (rows.some((r) => r.flavorKey === flavorKey && r.qty > 0)) return true;
    if (String(item.flavorKey || "").trim() === flavorKey) return true;
  }
  return false;
}

function qtyInCartForFlavor(cart) {
  let n = 0;
  for (const item of cart.items || []) {
    if (String(item.productKey || "").trim() !== productKey) continue;
    for (const r of getCartItemFlavorRows(item)) {
      if (r.flavorKey === flavorKey) n += r.qty;
    }
  }
  return n;
}

async function cartAffectsTargetPoints(cart) {
  const ctx = getCartStockContextId(cart);
  if (!ctx) return false;
  const linked = await getSyncedPickupPointIdsByAnyPoint(ctx);
  return linked.some((id) => targetPointIds.has(String(id)));
}

const carts = await Cart.find({
  items: { $elemMatch: { productKey, flavorKey } },
});

const matching = [];
for (const doc of carts) {
  const cart = doc.toObject ? doc.toObject() : doc;
  if (!cartHasTargetItem(cart)) continue;
  const affects = await cartAffectsTargetPoints(cart);
  if (pointKey && !affects) continue;
  matching.push({ doc, cart, qty: qtyInCartForFlavor(cart), affects });
}

console.log({
  mongoDatabase: mongoose.connection.name,
  productKey,
  flavorKey,
  pointFilter: pointKey || "(all points)",
  cartsFound: matching.length,
  dryRun,
  clearCarts,
});

for (const { cart, qty, affects } of matching) {
  const ctx = getCartStockContextId(cart);
  console.log(
    `cart telegramId=${cart.telegramId} qty=${qty} context=${ctx} affectsPoint=${affects}`
  );
}

if (!dryRun && clearCarts) {
  for (const { doc } of matching) {
    let release = await releaseReservedStockForCart(doc);
    if (release?.ok === false && doc.checkoutPickupPointId) {
      release = await releaseReservedStockForCart({
        ...doc.toObject(),
        stockContextId: String(doc.checkoutPickupPointId),
        reservedContextId: String(doc.checkoutPickupPointId),
      });
    }
    doc.items = [];
    doc.checkout = {};
    doc.stockContextId = "";
    doc.reservedContextId = "";
    doc.cartAutoClearAt = null;
    doc.staleClearedAt = new Date();
    await doc.save();
    console.log(`cleared ${doc.telegramId} released=${release?.released ?? 0}`);
  }
}

/** Після очищення: reservedQty = сума qty у всіх кошиках (зазвичай 0). */
async function reservedFromAllCarts(pickupPointId) {
  const linked = await getSyncedPickupPointIdsByAnyPoint(pickupPointId);
  const linkedSet = new Set(linked.map(String));
  const all = await Cart.find({
    items: { $elemMatch: { productKey, flavorKey } },
  }).lean();
  let sum = 0;
  for (const cart of all) {
    const ctx = getCartStockContextId(cart);
    if (!ctx) continue;
    const cartLinked = await getSyncedPickupPointIdsByAnyPoint(ctx);
    if (!cartLinked.some((id) => linkedSet.has(String(id)))) continue;
    sum += qtyInCartForFlavor(cart);
  }
  return sum;
}

const product = await Product.findOne({ productKey });
const flavor = product?.flavors?.find((f) => f.flavorKey === flavorKey);
if (!product || !flavor) {
  console.error("Product/flavor not in catalog");
  process.exit(1);
}

const reconcileRows = [];
for (const pointId of targetPointIds) {
  const row = (flavor.stockByPickupPoint || []).find(
    (s) => String(s.pickupPointId) === String(pointId)
  );
  if (!row) continue;
  const fromCarts = await reservedFromAllCarts(pointId);
  const before = Number(row.reservedQty || 0);
  const pt = pointById.get(String(pointId));
  reconcileRows.push({
    point: pt?.key || pointId,
    reservedBefore: before,
    reservedAfter: fromCarts,
    totalQty: Number(row.totalQty || 0),
  });
  if (!dryRun && before !== fromCarts) {
    await Product.updateOne(
      { productKey, "flavors.flavorKey": flavorKey },
      {
        $set: {
          "flavors.$[f].stockByPickupPoint.$[s].reservedQty": fromCarts,
          "flavors.$[f].stockByPickupPoint.$[s].updatedAt": new Date(),
        },
      },
      {
        arrayFilters: [
          { "f.flavorKey": flavorKey },
          { "s.pickupPointId": new mongoose.Types.ObjectId(pointId) },
        ],
      }
    );
  }
}

console.log("\nreserved reconcile:", reconcileRows);

if (!dryRun) {
  cacheInvalidate("products:");
  console.log("products cache invalidated");
}

await mongoose.disconnect();
