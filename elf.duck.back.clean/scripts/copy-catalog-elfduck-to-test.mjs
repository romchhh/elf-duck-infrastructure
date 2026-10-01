/**
 * Копіює категорії та товари (включно з URL фото) з БД elfduck → test
 * на тому ж кластері, що в MONGODB_URI.
 *
 *   cd elf.duck.back.clean && node scripts/copy-catalog-elfduck-to-test.mjs
 *   node scripts/copy-catalog-elfduck-to-test.mjs --dry-run
 *
 * Опційно: SOURCE_DB=elfduck TARGET_DB=test
 */
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { describeMongoUri } from "../lib/mongoTarget.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config();
dotenv.config({ path: path.join(scriptDir, "..", "..", ".env") });

const dryRun = process.argv.includes("--dry-run");
const sourceDb = String(process.env.SOURCE_DB || "elfduck").trim();
const targetDb = String(process.env.TARGET_DB || "test").trim();

async function copyCollection(srcConn, tgtConn, name, keyField) {
  const srcCol = srcConn.db.collection(name);
  const tgtCol = tgtConn.db.collection(name);
  const docs = await srcCol.find({}).toArray();
  let written = 0;
  for (const doc of docs) {
    if (dryRun) {
      written += 1;
      continue;
    }
    const or = [{ _id: doc._id }];
    if (keyField && doc[keyField] != null) {
      or.push({ [keyField]: doc[keyField] });
    }
    await tgtCol.deleteMany({ $or: or });
    await tgtCol.insertOne(doc);
    written += 1;
  }
  return { total: docs.length, written };
}

async function main() {
  const uri = String(process.env.MONGODB_URI || "").trim();
  if (!uri) {
    console.error("MONGODB_URI не задан (корневой .env)");
    process.exit(1);
  }

  const cluster = describeMongoUri(uri);
  console.log(
    `[copy-catalog] cluster host=${cluster.host} source=${sourceDb} → target=${targetDb}${dryRun ? " (dry-run)" : ""}`
  );

  if (sourceDb === targetDb) {
    console.error("SOURCE_DB і TARGET_DB однакові — нічого копіювати");
    process.exit(1);
  }

  const srcConn = mongoose.createConnection(uri, { dbName: sourceDb });
  const tgtConn = mongoose.createConnection(uri, { dbName: targetDb });
  await Promise.all([srcConn.asPromise(), tgtConn.asPromise()]);

  console.log(`connected source db=${srcConn.db.databaseName}`);
  console.log(`connected target db=${tgtConn.db.databaseName}`);

  const categories = await copyCollection(
    srcConn,
    tgtConn,
    "categories",
    "key"
  );
  console.log(`categories: ${categories.written}/${categories.total}`);

  const products = await copyCollection(
    srcConn,
    tgtConn,
    "products",
    "productKey"
  );
  console.log(`products: ${products.written}/${products.total}`);

  const sampleKeys = [
    "xros-6-mini-pod",
    "xros-6-pod",
    "oxva-pod",
    "oxva-30-ml-20-mg",
  ];
  for (const k of sampleKeys) {
    const p = await tgtConn.db.collection("products").findOne({ productKey: k });
    if (!p) {
      console.log(`  ${k}: (немає в target)`);
      continue;
    }
    console.log(
      `  ${k}: ${p.categoryKey} ${p.price} zł | ${String(p.cardBgUrl || "").slice(-55)}`
    );
  }

  await Promise.all([srcConn.close(), tgtConn.close()]);
  console.log(dryRun ? "Dry-run готово." : "Готово — каталог у test оновлено з elfduck.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
