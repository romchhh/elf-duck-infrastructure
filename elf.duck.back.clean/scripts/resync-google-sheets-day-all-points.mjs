/**
 * Resync ОТЧЁТ (tiers + СКИДКИ) + догнати АССОРТИМЕНТ для всіх точок з googleSheets config.
 *
 * docker compose exec api node scripts/resync-google-sheets-day-all-points.mjs --day 2026-10-06
 * docker compose exec api node scripts/resync-google-sheets-day-all-points.mjs --day 2026-10-06 --dry-run
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(backendRoot, ".env") });

import { SPREADSHEET_ID_BY_POINT_KEY } from "../lib/googleSheets/config.js";

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

const pointKeys = Object.keys(SPREADSHEET_ID_BY_POINT_KEY).sort();

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

console.log({ dayKey, dryRun, points: pointKeys.length, pointKeys });

for (const point of pointKeys) {
  console.log("\n==========", point, "==========\n");

  if (!skipAssortment) {
    const retryArgs = ["--point", point, "--day", dayKey];
    if (dryRun) retryArgs.push("--dry-run");
    try {
      await runNodeScript("retry-google-sheets-assortment.mjs", retryArgs);
    } catch (e) {
      console.error("[warn] assortment retry:", point, e.message);
    }
  }

  const resyncArgs = ["--point", point, "--day", dayKey];
  if (dryRun) resyncArgs.push("--dry-run");
  await runNodeScript("resync-google-sheets-day.mjs", resyncArgs);

  if (!skipReconcile) {
    try {
      await runNodeScript("reconcile-day-stats.mjs", ["--point", point, "--day", dayKey]);
    } catch (e) {
      console.error("[warn] reconcile:", point, e.message);
    }
  }
}

console.log("\nDone all points for", dayKey);
