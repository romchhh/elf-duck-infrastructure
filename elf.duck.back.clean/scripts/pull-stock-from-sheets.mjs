/**
 * Google Таблиця АССОРТИМЕНТ → Mongo (те саме, що щодня о 08:00 і після замовлень).
 *
 * Пробний запуск (нічого не пише):
 *   docker compose exec api node scripts/pull-stock-from-sheets.mjs --dry-run
 * Реальний:
 *   docker compose exec api node scripts/pull-stock-from-sheets.mjs
 * Лише одна точка:
 *   docker compose exec api node scripts/pull-stock-from-sheets.mjs --point praga --dry-run
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(backendRoot, ".env") });
if (!process.env.MONGODB_URI) dotenv.config({ path: path.join(backendRoot, "..", ".env") });

const { pullStockFromSheets } = await import("../lib/googleSheets/stockPull.js");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const pi = args.indexOf("--point");
const pointKeys = pi >= 0 && args[pi + 1] ? [String(args[pi + 1]).trim()] : undefined;

const dbi = args.indexOf("--db");
await mongoose.connect(
  process.env.MONGODB_URI,
  dbi >= 0 && args[dbi + 1] ? { dbName: String(args[dbi + 1]).trim() } : undefined
);
console.log("db:", mongoose.connection.name, "| dryRun:", dryRun);

const summary = await pullStockFromSheets({
  pointKeys,
  dryRun,
  reason: "script",
});

for (const s of summary.sheets || []) {
  console.log(
    `\n== ${s.pointKeys.join("+")} ${s.ok ? "OK" : "FAILED: " + s.error}` +
      ` | checked=${s.flavorsChecked || 0} updated=${s.updated || 0} created=${s.created || 0} unchanged=${s.unchanged || 0}`
  );
  for (const c of s.changes || []) {
    console.log(`  ${c.productKey} / ${c.flavorKey}: ${c.from} -> ${c.to}`);
  }
  for (const m of s.missingRows || []) {
    console.log(
      `  [нема рядка] ${m.kind} ${m.productKey}${m.flavorKey ? " / " + m.flavorKey : ""}${m.modelName ? " (блок " + m.modelName + ")" : ""}`
    );
  }
}

console.log("\nTOTALS", JSON.stringify(summary.totals));
await mongoose.disconnect();
process.exit(summary.ok ? 0 : 1);
