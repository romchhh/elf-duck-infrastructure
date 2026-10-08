/**
 * Догнати АССОРТИМЕНТ за діапазон днів (усі точки або одна).
 *
 * docker compose exec api node scripts/retry-google-sheets-assortment-range.mjs --from 2026-09-25 --to 2026-10-08
 * docker compose exec api node scripts/retry-google-sheets-assortment-range.mjs --from 2026-10-01 --to 2026-10-08 --point mokot-w
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
function arg(name) {
  const i = args.indexOf(name);
  return i >= 0 ? String(args[i + 1] || "").trim() : "";
}

const fromKey = arg("--from");
const toKey = arg("--to") || fromKey;
const pointFilter = arg("--point", "");
const dryRun = args.includes("--dry-run");

if (!/^\d{4}-\d{2}-\d{2}$/.test(fromKey) || !/^\d{4}-\d{2}-\d{2}$/.test(toKey)) {
  console.error(
    "Usage: node scripts/retry-google-sheets-assortment-range.mjs --from YYYY-MM-DD --to YYYY-MM-DD [--point mokot-w] [--dry-run]"
  );
  process.exit(1);
}

function dayKeysInclusive(from, to) {
  const out = [];
  const start = new Date(`${from}T12:00:00.000Z`);
  const end = new Date(`${to}T12:00:00.000Z`);
  if (end < start) return out;
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    out.push(`${y}-${m}-${dd}`);
  }
  return out;
}

const points = (pointFilter ? [pointFilter] : ASSORTMENT_RETRY_POINT_KEYS).filter(
  (k) => SPREADSHEET_ID_BY_POINT_KEY[k]
);

const days = dayKeysInclusive(fromKey, toKey);
console.log({ fromKey, toKey, days: days.length, points, dryRun });

let failures = 0;

for (const dayKey of days) {
  for (const point of points) {
    const scriptArgs = ["--point", point, "--day", dayKey];
    if (dryRun) scriptArgs.push("--dry-run");

    const r = spawnSync(
      process.execPath,
      [path.join(backendRoot, "scripts/retry-google-sheets-assortment.mjs"), ...scriptArgs],
      { cwd: backendRoot, env: process.env, stdio: "inherit" }
    );
    if (r.status !== 0) failures += 1;
  }
}

console.log({ done: true, failures });
process.exit(failures ? 1 : 0);
