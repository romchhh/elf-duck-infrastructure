/**
 * Діагностика «немає в наявності» vs Google Sheets.
 *
 * docker compose exec api node scripts/diag-flavor-stock.mjs --product puffy-30-ml --flavor cherry-ice --point mokot-w
 * docker compose exec api node scripts/diag-flavor-stock.mjs --product puffy-30-ml --flavor cherry-ice --point mokot-w --fix-reserved
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import Product from "../models/Product.js";
import PickupPoint from "../models/PickupPoint.js";
import Cart from "../models/Cart.js";

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
const fixReserved = args.includes("--fix-reserved");

if (!productKey || !flavorKey || !pointKey) {
  console.error(
    "Usage: node scripts/diag-flavor-stock.mjs --product puffy-30-ml --flavor cherry-ice --point mokot-w [--fix-reserved]"
  );
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI);

const point = await PickupPoint.findOne({
  key: new RegExp(`^${pointKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"),
}).lean();

const product = await Product.findOne({ productKey }).lean();
const flavor = (product?.flavors || []).find(
  (f) => String(f.flavorKey || "").trim() === flavorKey
);

if (!point || !product || !flavor) {
  console.error({ ok: false, point: !!point, product: !!product, flavor: !!flavor });
  process.exit(1);
}

const stock =
  (flavor.stockByPickupPoint || []).find(
    (s) => String(s.pickupPointId) === String(point._id)
  ) || null;

const total = Number(stock?.totalQty || 0);
const reserved = Number(stock?.reservedQty || 0);
const available = Math.max(0, total - reserved);

const carts = await Cart.find({
  pickupPointId: point._id,
  items: { $elemMatch: { productKey, flavors: { $elemMatch: { flavorKey } } } },
}).lean();

let cartQty = 0;
for (const c of carts) {
  for (const it of c.items || []) {
    if (it.productKey !== productKey) continue;
    for (const fl of it.flavors || []) {
      if (fl.flavorKey === flavorKey) cartQty += Number(fl.qty || 0);
    }
  }
}

console.log({
  mongoDatabase: mongoose.connection.name,
  productKey,
  flavorKey,
  flavorLabel: flavor.label,
  point: point.key,
  totalQty: total,
  reservedQty: reserved,
  availableInMiniApp: available,
  activeCartsWithFlavor: carts.length,
  qtyInThoseCarts: cartQty,
  ghostReserve: reserved > cartQty,
});

if (fixReserved && reserved > 0 && cartQty === 0) {
  await Product.updateOne(
    { productKey, "flavors.flavorKey": flavorKey },
    {
      $set: {
        "flavors.$[f].stockByPickupPoint.$[s].reservedQty": 0,
        "flavors.$[f].stockByPickupPoint.$[s].updatedAt": new Date(),
      },
    },
    {
      arrayFilters: [
        { "f.flavorKey": flavorKey },
        { "s.pickupPointId": point._id },
      ],
    }
  );
  console.log("fixed: reservedQty=0 — потім: docker compose restart api");
}

if (total === 0) {
  console.log(
    "hint: totalQty=0 у Mongo — docker compose exec api node scripts/pull-stock-from-sheets.mjs --point",
    point.key
  );
}

await mongoose.disconnect();
