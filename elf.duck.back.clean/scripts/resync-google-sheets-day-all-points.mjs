/**
 * Resync ОТЧЁТ (tiers + СКИДКИ) + догнати АССОРТИМЕНТ для всіх точок.
 * PUFFY 50%/70% у замовленнях → рядки MODEL «PUFFY 5%» / «PUFFY 7%» (після деплою chunk09).
 *
 * docker compose exec api node scripts/resync-google-sheets-day-all-points.mjs --day 2026-10-06
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(backendRoot, ".env") });

import {
  ASSORTMENT_RETRY_POINT_KEYS,
  DAILY_STATS_RESYNC_POINT_KEYS,
} from "../lib/googleSheets/statsScriptPoints.js";

const args = process.argv.slice(2);
function arg(name) {
  const i = args.indexOf(name);
  return i >= 0 ? String(args[i + 1] || "").trim() : "";
}

const dayKey = arg("--day");
const dryRun = args.includes("--dry-run");
const skipAssortment = args.includes("--skip-assortment");
const skipReconcile = args.includes("--skip-reconcile");

if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
  console.error(
    "Usage: node scripts/resync-google-sheets-day-all-points.mjs --day YYYY-MM-DD [--dry-run] [--skip-assortment] [--skip-reconcile]"
  );
  process.exit(1);
}

function runNodeScript(scriptName, scriptArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(backendRoot, "scripts", scriptName), ...scriptArgs],
      {
        cwd: backendRoot,
        stdio: "inherit",
        env: process.env,
      }
    );
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${scriptName} exited ${code}`));
    });
  });
}

console.log({
  dayKey,
  dryRun,
  resyncPoints: DAILY_STATS_RESYNC_POINT_KEYS,
  assortmentPoints: ASSORTMENT_RETRY_POINT_KEYS,
});

if (!skipAssortment) {
  console.log("\n===== АССОРТИМЕНТ (per Mongo point) =====\n");
  for (const point of ASSORTMENT_RETRY_POINT_KEYS) {
    const retryArgs = ["--point", point, "--day", dayKey];
    if (dryRun) retryArgs.push("--dry-run");
    try {
      await runNodeScript("retry-google-sheets-assortment.mjs", retryArgs);
    } catch (e) {
      console.error("[warn] assortment retry:", point, e.message);
    }
  }
}

const failures = [];

console.log("\n===== ОТЧЁТ дня (resync) =====\n");
for (const point of DAILY_STATS_RESYNC_POINT_KEYS) {
  console.log("\n==========", point, "==========\n");

  const resyncArgs = ["--point", point, "--day", dayKey];
  if (dryRun) resyncArgs.push("--dry-run");

  try {
    await runNodeScript("resync-google-sheets-day.mjs", resyncArgs);
  } catch (e) {
    console.error("[fail] resync:", point, e.message);
    failures.push({ point, step: "resync", error: e.message });
    continue;
  }

  if (!skipReconcile) {
    try {
      await runNodeScript("reconcile-day-stats.mjs", ["--point", point, "--day", dayKey]);
    } catch (e) {
      console.error("[warn] reconcile:", point, e.message);
      failures.push({ point, step: "reconcile", error: e.message });
    }
  }
}

console.log("\nDone all points for", dayKey);
if (failures.length) {
  console.error("Failures:", failures);
  process.exit(1);
}
