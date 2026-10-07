/**
 * Зведений аудит fulfilled-замовлень за останні N днів по всіх точках ASSORTMENT_RETRY_POINT_KEYS.
 *
 * node scripts/run-assortment-order-probes.mjs
 * node scripts/run-assortment-order-probes.mjs --days 7
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(backendRoot, ".env") });

import { ASSORTMENT_RETRY_POINT_KEYS } from "../lib/googleSheets/statsScriptPoints.js";
import { SPREADSHEET_ID_BY_POINT_KEY } from "../lib/googleSheets/config.js";

const args = process.argv.slice(2);
function arg(name, def) {
  const i = args.indexOf(name);
  return i >= 0 ? String(args[i + 1] || "").trim() : def;
}

const days = Math.max(1, Number(arg("--days", "14")) || 14);

function dayKeysBack(n) {
  const out = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    out.push(`${y}-${m}-${dd}`);
  }
  return out;
}

const pointKeys = ASSORTMENT_RETRY_POINT_KEYS.filter((k) => SPREADSHEET_ID_BY_POINT_KEY[k]);
const dayKeys = dayKeysBack(days);

const totals = {};

for (const pointKey of pointKeys) {
  totals[pointKey] = { days: 0, orders: 0, syncOk: 0, failAssort: 0 };
}

for (const pointKey of pointKeys) {
  for (const dayKey of dayKeys) {
    const r = spawnSync(
      process.execPath,
      [
        path.join(backendRoot, "scripts/audit-point-day-orders.mjs"),
        "--point",
        pointKey,
        "--day",
        dayKey,
        "--only-fail",
      ],
      { env: process.env, cwd: backendRoot, encoding: "utf8" }
    );

    const text = `${r.stdout || ""}${r.stderr || ""}`;
    const ordersMatch = text.match(/\borders:\s*(\d+)/);
    const dayOrders = ordersMatch ? Number(ordersMatch[1]) : 0;
    const failMatch = text.match(/assortmentSyncFail:\s*(\d+)/);
    const okMatch = text.match(/assortmentSyncOk:\s*(\d+)/);

    totals[pointKey].days += 1;
    totals[pointKey].orders += dayOrders;
    totals[pointKey].failAssort += failMatch ? Number(failMatch[1]) : 0;
    totals[pointKey].syncOk += okMatch ? Number(okMatch[1]) : 0;
  }
}

console.log({ days, dayRange: [dayKeys[dayKeys.length - 1], dayKeys[0]], totals });
console.log(
  "\nДеталі по дню: node scripts/audit-point-day-orders.mjs --point <key> --day YYYY-MM-DD"
);
console.log("Probe одного: node scripts/probe-order-assortment-sync.mjs --order ED-XXXXX");
console.log("Retry: node scripts/retry-google-sheets-assortment.mjs --point <key> --day YYYY-MM-DD");
