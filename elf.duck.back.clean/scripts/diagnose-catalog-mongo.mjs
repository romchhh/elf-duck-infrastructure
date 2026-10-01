/**
 * Чи збігається Mongo (MONGODB_URI) з тим, що віддає prod API міні-додатку.
 *
 *   cd elf.duck.back.clean && node scripts/diagnose-catalog-mongo.mjs
 */
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import mongoose from "mongoose";
import Product from "../models/Product.js";
import { describeMongoUri } from "../lib/mongoTarget.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config();
dotenv.config({ path: path.join(scriptDir, "..", "..", ".env") });

const PROD_API = String(
  process.env.PROD_API_URL || "https://elfduck-api.telebots.site"
).replace(/\/+$/, "");

const KEYS = [
  "xros-6-mini-pod",
  "xros-6-pod",
  "oxva-pod",
  "oxva-30-ml-20-mg",
];

function brief(p) {
  if (!p) return null;
  return {
    _id: String(p._id || ""),
    categoryKey: p.categoryKey,
    price: p.price,
    cardBgUrl: String(p.cardBgUrl || "").slice(-60),
  };
}

async function loadProd() {
  const r = await fetch(`${PROD_API}/products?active=1`);
  const d = await r.json();
  if (!r.ok) throw new Error(`prod HTTP ${r.status}`);
  const list = Array.isArray(d) ? d : d.products || [];
  const map = new Map();
  for (const p of list) map.set(String(p.productKey || ""), p);
  return map;
}

async function main() {
  const uri = String(process.env.MONGODB_URI || "").trim();
  const target = describeMongoUri(uri);
  console.log("--- MONGODB_URI (masked) ---");
  console.log(
    `kind=${target.kind} host=${target.host} db=${target.db} set=${Boolean(uri)}`
  );

  let ping = null;
  try {
    const pr = await fetch(`${PROD_API}/ping`);
    ping = await pr.json();
  } catch (e) {
    console.warn("prod /ping failed:", e?.message || e);
  }
  if (ping) {
    console.log("--- prod API /ping ---");
    console.log(JSON.stringify(ping));
  }

  const prod = await loadProd();
  console.log(`--- prod API products (${PROD_API}) ---`);

  if (!uri) {
    console.error("MONGODB_URI не задан");
    for (const k of KEYS) console.log(k, brief(prod.get(k)));
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log(
    `--- Mongo connected (database: ${mongoose.connection?.db?.databaseName || "?"}) ---`
  );

  let mismatch = 0;
  for (const k of KEYS) {
    const fromApi = prod.get(k);
    const fromDb = await Product.findOne({ productKey: k }).lean();
    const a = brief(fromApi);
    const b = brief(fromDb);
    const sameId = a?._id && b?._id && String(a._id) === String(b._id);
    const flag = sameId ? "OK same _id" : "MISMATCH _id";
    if (!sameId) mismatch += 1;
    console.log(`\n${k} [${flag}]`);
    console.log("  prod API:", a);
    console.log("  your Mongo:", b);
  }

  await mongoose.disconnect();

  console.log("\n--- verdict ---");
  if (mismatch > 0) {
    console.log(
      "Міні-додаток читає prod API. Ваш MONGODB_URI — інша база (Atlas на ноуті vs mongo:27017 на VPS)."
    );
    console.log(
      "На VPS і в локальному .env має бути однаковий шлях БД (.../test або .../elfduck); потім catalog-sync; docker compose restart api"
    );
    process.exit(2);
  }
  console.log(
    "Prod API і ваша Mongo збігаються по _id. Якщо каталог старий — кеш API або старий shop build."
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
