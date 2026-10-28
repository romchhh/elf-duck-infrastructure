/**
 * Запікає cardImageUrl (фон+утка → один WebP) для всіх товарів і категорій.
 *
 *   node scripts/bake-card-composites.mjs
 *   node scripts/bake-card-composites.mjs --limit 20
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import Product from "../models/Product.js";
import Category from "../models/Category.js";
import { refreshCardImageUrl } from "../lib/crm/cardComposite.js";

const root = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(root, "../../.env") });
dotenv.config({ path: path.resolve(root, "../.env") });

function parseLimit(argv) {
  const i = argv.indexOf("--limit");
  if (i >= 0 && argv[i + 1]) return Math.max(1, Number(argv[i + 1]) || 0);
  return 0;
}

async function main() {
  const uri = String(process.env.MONGODB_URI || "").trim();
  if (!uri) {
    console.error("MONGODB_URI is not set");
    process.exit(1);
  }

  const limit = parseLimit(process.argv.slice(2));
  await mongoose.connect(uri);

  let cats = await Category.find({}).sort({ sortOrder: 1 }).exec();
  let products = await Product.find({}).sort({ sortOrder: 1 }).exec();
  if (limit) {
    cats = cats.slice(0, limit);
    products = products.slice(0, limit);
  }

  let catOk = 0;
  let prodOk = 0;

  for (const cat of cats) {
    const before = cat.cardImageUrl;
    await refreshCardImageUrl(cat, { kind: "category" });
    if (cat.cardImageUrl && cat.cardImageUrl !== before) catOk += 1;
    else if (cat.cardImageUrl) catOk += 1;
    console.log(
      `category ${cat.key}: ${cat.cardImageUrl ? "ok" : "skip"}`
    );
  }

  for (const product of products) {
    const before = product.cardImageUrl;
    await refreshCardImageUrl(product, { kind: "product" });
    if (product.cardImageUrl) prodOk += 1;
    console.log(
      `product ${product.productKey}: ${product.cardImageUrl ? "ok" : "skip"}${
        product.cardImageUrl && product.cardImageUrl !== before ? " (updated)" : ""
      }`
    );
  }

  console.log(
    JSON.stringify(
      {
        categories: { total: cats.length, withImage: catOk },
        products: { total: products.length, withImage: prodOk },
      },
      null,
      2
    )
  );

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
