/**
 * Puffy 5% і 7% мали однакові flavorKey (18 смаків) → ризик переплутати товар у кошику.
 * Для puffy-30-ml-70-mg додаємо префікс 70mg- (лише якщо ще немає).
 *
 * node scripts/fix-puffy-70mg-unique-flavor-keys.mjs [--dry-run]
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import Product from "../models/Product.js";

const __dir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dir, "../../.env") });

const PRODUCT_KEY = "puffy-30-ml-70-mg";
const PREFIX = "70mg-";
const dryRun = process.argv.includes("--dry-run");

function prefixedKey(flavorKey) {
  const fk = String(flavorKey || "").trim();
  if (!fk) return fk;
  if (fk.startsWith(PREFIX)) return fk;
  return `${PREFIX}${fk}`;
}

async function runDb(dbName) {
  await mongoose.connect(process.env.MONGODB_URI, { dbName });
  const product = await Product.findOne({ productKey: PRODUCT_KEY });
  if (!product) {
    console.warn(`[${dbName}] product not found:`, PRODUCT_KEY);
    await mongoose.disconnect();
    return;
  }

  let renamed = 0;
  for (const flavor of product.flavors || []) {
    const next = prefixedKey(flavor.flavorKey);
    if (next !== flavor.flavorKey) {
      renamed += 1;
      if (!dryRun) flavor.flavorKey = next;
    }
  }

  if (!dryRun && renamed) {
    product.markModified("flavors");
    await product.save();
  }

  await Product.updateOne(
    { productKey: "puffy-30-ml" },
    {
      $set: {
        titleModal: "PUFFY 30 ML / 50 MG",
      },
    }
  );

  console.log(`[${dbName}] ${PRODUCT_KEY}: renamed flavorKeys: ${renamed}${dryRun ? " (dry-run)" : ""}`);
  await mongoose.disconnect();
}

const dbs = [
  String(process.env.MONGODB_DB || "test").trim(),
  String(process.env.SOURCE_DB || "elfduck").trim(),
].filter((v, i, a) => v && a.indexOf(v) === i);

for (const dbName of dbs) {
  await runDb(dbName);
}
