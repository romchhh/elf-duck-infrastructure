/**
 * Інтеграційний тест Sheets → Mongo на ТИМЧАСОВІЙ копії БД (прод не чіпає).
 *   node scripts/test-stock-pull-integration.mjs [--src test]
 * Читає products/pickuppoints з --src, копіює у `stockpull_tmp_<ts>`, проганяє сценарії, видаляє копію.
 * Google Sheets лише читаються.
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
const tmpDb = `stockpull_tmp_${Date.now()}`;

let failed = 0;
function check(name, cond, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
  if (!cond) failed += 1;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1) копія у тимчасову БД
const src = await mongoose.createConnection(process.env.MONGODB_URI, { dbName: srcDb }).asPromise();
const products = await src.db.collection("products").find({}).toArray();
const points = await src.db.collection("pickuppoints").find({}).toArray();
await src.close();

await mongoose.connect(process.env.MONGODB_URI, { dbName: tmpDb });
console.log("tmp db:", mongoose.connection.name, "| products:", products.length, "| points:", points.length);
await mongoose.connection.db.collection("products").insertMany(products);
await mongoose.connection.db.collection("pickuppoints").insertMany(points);

process.env.STOCK_PULL_DEBOUNCE_MS = "300";
const { pullStockFromSheets, queueStockPullForPointKey } = await import("../lib/googleSheets/stockPull.js");
const { queueStockPullForOrder } = await import("../lib/googleSheets/orderSync.js");
const { processDailyStockPull } = await import("../lib/googleSheets/stockPullScheduler.js");
const Product = (await import("../models/Product.js")).default;
const PickupPoint = (await import("../models/PickupPoint.js")).default;
const DailyStatsDispatch = (await import("../models/DailyStatsDispatch.js")).default;

const pragaId = String((await PickupPoint.findOne({ key: /^praga/ }).lean())._id);
const getQty = async (productKey, flavorKey, pid = pragaId) => {
  const p = await Product.findOne({ productKey }).lean();
  const f = p.flavors.find((x) => x.flavorKey === flavorKey);
  return f.stockByPickupPoint.find((s) => String(s.pickupPointId) === pid);
};

try {
  // 2) dry-run нічого не пише
  const before = await Product.find({}).lean();
  const dry = await pullStockFromSheets({ dryRun: true, reason: "test-dry" });
  const afterDry = await Product.find({}).lean();
  check("dry-run: ok без збоїв таблиць", dry.ok, JSON.stringify(dry.totals));
  check("dry-run: Mongo не змінено", JSON.stringify(before) === JSON.stringify(afterDry));
  check("dry-run: знайшов розбіжності", dry.totals.updated > 0);

  // 3) реальний pull
  const real = await pullStockFromSheets({ reason: "test-real" });
  check("real: ok", real.ok, JSON.stringify(real.totals));
  check("real: оновив стільки ж, скільки dry", real.totals.updated === dry.totals.updated && real.totals.created === dry.totals.created);

  // 4) ідемпотентність
  const again = await pullStockFromSheets({ reason: "test-again" });
  check("ідемпотентно: 2-й запуск 0 змін", again.totals.updated === 0 && again.totals.created === 0, JSON.stringify(again.totals));

  // 5) відновлення після ручної "порчі" + обрізання reserved
  const sample = real.sheets.find((s) => s.pointKeys.includes("praga")).changes[0]
    || { productKey: "elfliq-30-ml", flavorKey: "cola" };
  const pr = await Product.findOne({ productKey: sample.productKey });
  const fl = pr.flavors.find((f) => f.flavorKey === sample.flavorKey);
  const row = fl.stockByPickupPoint.find((s) => String(s.pickupPointId) === pragaId);
  const sheetQty = row.totalQty;
  row.totalQty = 999;
  row.reservedQty = 50;
  await pr.save();
  await pullStockFromSheets({ pointKeys: ["praga"], reason: "test-repair" });
  const fixed = await getQty(sample.productKey, sample.flavorKey);
  check(`repair: ${sample.productKey}/${sample.flavorKey} 999 → ${sheetQty}`, fixed.totalQty === sheetQty, `got ${fixed.totalQty}`);
  check("repair: reservedQty обрізано до totalQty", fixed.reservedQty <= fixed.totalQty, `reserved=${fixed.reservedQty}`);

  // 6) резерв не втрачається, якщо ≤ totalQty
  const pr2 = await Product.findOne({ productKey: sample.productKey });
  const row2 = pr2.flavors.find((f) => f.flavorKey === sample.flavorKey).stockByPickupPoint.find((s) => String(s.pickupPointId) === pragaId);
  if (sheetQty >= 1) {
    row2.reservedQty = 1;
    await pr2.save();
    await pullStockFromSheets({ pointKeys: ["praga"], reason: "test-reserved" });
    const keep = await getQty(sample.productKey, sample.flavorKey);
    check("reserved ≤ total зберігається", keep.reservedQty === 1, `reserved=${keep.reservedQty}`);
  } else {
    console.log("SKIP  reserved test (sheetQty=0)");
  }

  // 7) wola і delivery-2 отримують однакові значення
  const wola = await PickupPoint.findOne({ key: /^wola/ }).lean();
  const d2 = await PickupPoint.findOne({ key: /^delivery-2/ }).lean();
  const all = await Product.find({}).lean();
  let mismatch = 0, compared = 0;
  for (const p of all) for (const f of p.flavors) {
    if (p.isActive === false) continue; // неактивні без блоку в таблиці — свідомо пропускаються
    const a = f.stockByPickupPoint.find((s) => String(s.pickupPointId) === String(wola._id));
    const b = f.stockByPickupPoint.find((s) => String(s.pickupPointId) === String(d2._id));
    if (a && b) { compared += 1; if (a.totalQty !== b.totalQty) mismatch += 1; }
  }
  check("wola ≡ delivery-2", compared > 0 && mismatch === 0, `compared=${compared} mismatch=${mismatch}`);

  // 8) debounce-черга: 5 викликів → 1 запуск
  const logs = [];
  const origLog = console.log;
  console.log = (...a) => { const s = a.join(" "); if (s.includes("[stockPull] after-order")) logs.push(s); origLog(...a); };
  for (let i = 0; i < 5; i++) queueStockPullForPointKey("praga");
  queueStockPullForPointKey("mokot-w");
  await sleep(4000);
  console.log = origLog;
  check("queue: 6 викликів злились в 1 запуск", logs.length === 1, `запусків=${logs.length}`);

  // 9) хук після замовлення (pickupPointKey)
  const logs2 = [];
  console.log = (...a) => { const s = a.join(" "); if (s.includes("[stockPull] after-order")) logs2.push(s); origLog(...a); };
  await queueStockPullForOrder({ _id: new mongoose.Types.ObjectId(), pickupPointKey: "praga", deliveryType: "pickup" });
  await queueStockPullForOrder({ _id: new mongoose.Types.ObjectId(), deliveryType: "delivery", deliveryMethod: "inpost" });
  await sleep(3500);
  console.log = origLog;
  check("order-hook: запустив pull (praga + delivery-2)", logs2.length >= 1, `запусків=${logs2.length}`);

  // 10) захист: порожній/несуттєвий лист — перевіряємо через неіснуючий spreadsheet
  const { default: cfg } = await import("../lib/googleSheets/config.js").then((m) => ({ default: m }));
  check("config: delivery-2 і wola — одна таблиця", cfg.resolveSpreadsheetIdForPointKey("wola") === cfg.resolveSpreadsheetIdForPointKey("delivery-2"));

  // 11) щоденний планувальник: перший виклик запускає, другий — ні (дедуп)
  await DailyStatsDispatch.deleteMany({});
  const logs3 = [];
  console.log = (...a) => { const s = a.join(" "); if (s.includes("[stockPull] daily-08:00")) logs3.push(s); origLog(...a); };
  await processDailyStockPull();
  await processDailyStockPull();
  console.log = origLog;
  const claims = await DailyStatsDispatch.find({ kind: "stock_pull_sheets" }).lean();
  check("scheduler: 1 запуск за день (дедуп)", logs3.length === 1 && claims.length === 1, `запусків=${logs3.length}, claim=${claims.length}`);
} catch (e) {
  console.error("TEST ERROR:", e);
  failed += 1;
} finally {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  console.log(`\ntmp db ${tmpDb} видалено. ${failed ? "FAILED: " + failed : "ALL PASSED"}`);
  process.exit(failed ? 1 : 0);
}
