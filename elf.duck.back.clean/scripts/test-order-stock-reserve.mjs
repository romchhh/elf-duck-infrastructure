/**
 * Перевірка reserve → release → commit для замовлень (тимчасова копія БД).
 *   node scripts/test-order-stock-reserve.mjs [--src test]
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(backendRoot, ".env") });
if (!process.env.MONGODB_URI) dotenv.config({ path: path.join(backendRoot, "..", ".env") });

const args = process.argv.slice(2);
const si = args.indexOf("--src");
const srcDb = si >= 0 ? args[si + 1] : "test";
const tmpDb = `stock_reserve_tmp_${Date.now()}`;

let failed = 0;
function check(name, cond, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
  if (!cond) failed += 1;
}

function readReserved(product, flavorKey, pointId) {
  const fl = (product?.flavors || []).find(
    (f) => String(f.flavorKey || "").trim() === String(flavorKey).trim()
  );
  const row = (fl?.stockByPickupPoint || []).find(
    (s) => String(s.pickupPointId) === String(pointId)
  );
  return {
    total: Number(row?.totalQty || 0),
    reserved: Number(row?.reservedQty || 0),
  };
}

if (!process.env.MONGODB_URI) {
  console.error("MONGODB_URI missing");
  process.exit(1);
}

const src = await mongoose.createConnection(process.env.MONGODB_URI, { dbName: srcDb }).asPromise();
const products = await src.db.collection("products").find({}).toArray();
const points = await src.db.collection("pickuppoints").find({}).toArray();
await src.close();

await mongoose.connect(process.env.MONGODB_URI, { dbName: tmpDb });
await mongoose.connection.db.collection("products").insertMany(products);
await mongoose.connection.db.collection("pickuppoints").insertMany(points);

const Product = (await import("../models/Product.js")).default;
const PickupPoint = (await import("../models/PickupPoint.js")).default;
const {
  reserveOrderReservedStock,
  releaseOrderReservedStock,
  commitOrderStock,
} = await import("../lib/server/helpers/chunk12.js");

const pickup = await PickupPoint.findOne({ key: /^wola/i }).lean();
check("pickup point wola", Boolean(pickup?._id));

let probe = null;
let probeFlavorKey = "";
let probePointId = String(pickup?._id || "");

for (const p of await Product.find({}, { productKey: 1, flavors: 1 }).lean()) {
  for (const f of p.flavors || []) {
    const row = (f.stockByPickupPoint || []).find(
      (s) => String(s.pickupPointId) === probePointId && Number(s.totalQty || 0) >= 2
    );
    if (row) {
      probe = p;
      probeFlavorKey = String(f.flavorKey || "").trim();
      break;
    }
  }
  if (probe) break;
}

check("probe product with stock>=2", Boolean(probe), probe?.productKey || "none");

if (probe && probePointId) {
  await Product.updateOne(
    { productKey: probe.productKey, "flavors.flavorKey": probeFlavorKey },
    {
      $set: {
        "flavors.$[f].stockByPickupPoint.$[s].totalQty": 3,
        "flavors.$[f].stockByPickupPoint.$[s].reservedQty": 0,
      },
    },
    {
      arrayFilters: [
        { "f.flavorKey": probeFlavorKey },
        { "s.pickupPointId": new mongoose.Types.ObjectId(probePointId) },
      ],
    }
  );

  const baseOrder = {
    deliveryType: "pickup",
    pickupPointId: new mongoose.Types.ObjectId(probePointId),
    items: [
      {
        productKey: probe.productKey,
        flavors: [{ flavorKey: probeFlavorKey, qty: 1 }],
      },
    ],
    stockReservedAt: null,
    stockReleasedAt: null,
    stockCommittedAt: null,
  };

  const before = readReserved(
    await Product.findOne({ productKey: probe.productKey }).lean(),
    probeFlavorKey,
    probePointId
  );
  check("baseline total=3 reserved=0", before.total === 3 && before.reserved === 0, JSON.stringify(before));

  const r1 = await reserveOrderReservedStock(baseOrder);
  check("reserve ok", r1?.ok === true, JSON.stringify(r1));
  baseOrder.stockReservedAt = new Date();

  const afterReserve = readReserved(
    await Product.findOne({ productKey: probe.productKey }).lean(),
    probeFlavorKey,
    probePointId
  );
  check("reserved +1 after reserve", afterReserve.reserved === 1, JSON.stringify(afterReserve));

  const rSkip = await reserveOrderReservedStock(baseOrder);
  check("reserve idempotent skip", rSkip?.ok && rSkip?.skipped);

  const afterSkip = readReserved(
    await Product.findOne({ productKey: probe.productKey }).lean(),
    probeFlavorKey,
    probePointId
  );
  check("reserved unchanged after skip", afterSkip.reserved === 1);

  const order2 = {
    ...baseOrder,
    stockReservedAt: null,
    stockReleasedAt: null,
    items: [
      {
        productKey: probe.productKey,
        flavors: [{ flavorKey: probeFlavorKey, qty: 3 }],
      },
    ],
  };
  const rOos = await reserveOrderReservedStock(order2);
  check("second order OUT_OF_STOCK", rOos?.ok === false && rOos?.reason === "OUT_OF_STOCK");

  await releaseOrderReservedStock(baseOrder);
  baseOrder.stockReleasedAt = new Date();

  const afterRelease = readReserved(
    await Product.findOne({ productKey: probe.productKey }).lean(),
    probeFlavorKey,
    probePointId
  );
  check("reserved 0 after release", afterRelease.reserved === 0, JSON.stringify(afterRelease));

  baseOrder.stockReleasedAt = null;
  baseOrder.stockReservedAt = null;
  const r2 = await reserveOrderReservedStock(baseOrder);
  check("re-reserve ok", r2?.ok === true);
  baseOrder.stockReservedAt = new Date();

  const commitOrder = { ...baseOrder };
  const committed = await commitOrderStock(commitOrder);
  check("commit ok", committed === true);

  const afterCommit = readReserved(
    await Product.findOne({ productKey: probe.productKey }).lean(),
    probeFlavorKey,
    probePointId
  );
  check("total 2 reserved 0 after commit", afterCommit.total === 2 && afterCommit.reserved === 0, JSON.stringify(afterCommit));
}

// aggregate logic (min total, max reserved)
const fakeFlavor = {
  stockByPickupPoint: [
    { pickupPointId: "a", totalQty: 5, reservedQty: 1 },
    { pickupPointId: "b", totalQty: 3, reservedQty: 2 },
  ],
};
const totals = fakeFlavor.stockByPickupPoint.map((r) => r.totalQty);
const reserveds = fakeFlavor.stockByPickupPoint.map((r) => r.reservedQty);
const avail = Math.max(0, Math.min(...totals) - Math.max(...reserveds));
check("aggregate math available=1", avail === 1);

await mongoose.connection.dropDatabase();
await mongoose.disconnect();

console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
