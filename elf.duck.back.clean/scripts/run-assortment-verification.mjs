/**
 * Зведена перевірка АССОРТИМЕНТ: каталог↔sheet + dry-run probe останніх fulfilled-замовлень.
 *
 * docker compose exec api node scripts/run-assortment-verification.mjs
 * docker compose exec api node scripts/run-assortment-verification.mjs --json
 *
 * VPS deploy (stats + assortment): orderStatsDay.js, deliveredAt, chunk03 InPost hooks,
 * dailyReportGrid tier reset, normalize aliases → docker compose build api && up -d api
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(backendRoot, "..");
dotenv.config({ path: path.join(backendRoot, ".env") });
if (!process.env.MONGODB_URI) {
  dotenv.config({ path: path.join(repoRoot, ".env") });
}

import mongoose from "mongoose";
import Order from "../models/Order.js";
import {
  applyAssortmentDelta,
  buildAssortmentFlavorSearchLabels,
} from "../lib/googleSheets/assortmentGrid.js";
import {
  isGoogleSheetsEnabled,
  resolveSpreadsheetIdForPointKey,
  SPREADSHEET_ID_BY_POINT_KEY,
} from "../lib/googleSheets/config.js";
import {
  orderQualifiesForAssortmentGoogleSync,
  resolveOrderPointKey,
} from "../lib/googleSheets/orderSync.js";
import { getOrderStatsDayKey } from "../lib/server/helpers/orderStatsDay.js";
import { getAssortmentSheetModelName } from "../lib/server/helpers/chunk09.js";
import { ASSORTMENT_RETRY_POINT_KEYS } from "../lib/googleSheets/statsScriptPoints.js";

const asJson = process.argv.includes("--json");
const strictCatalog = process.argv.includes("--strict-catalog");
const samplePerPoint = 5;
const lookbackDays = 14;
const syncGapLookbackDays = 3;

function runAuditAllPoints() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        path.join(backendRoot, "scripts/audit-assortment-catalog-match.mjs"),
        "--all-points",
        "--summary-json",
      ],
      {
        env: process.env,
        cwd: backendRoot,
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: 16 * 1024 * 1024,
      }
    );
    let out = "";
    child.stdout.on("data", (d) => {
      out += d;
    });
    child.stderr.on("data", (d) => {
      out += d;
    });
    child.on("close", (code) => {
      try {
        const parsed = JSON.parse(out);
        // audit exits 1 when flavor rows missing; JSON is still valid
        if (code !== 0 && code !== 1) {
          reject(new Error(`catalog audit exit ${code}: ${out.slice(0, 500)}`));
          return;
        }
        resolve(parsed);
      } catch {
        reject(
          new Error(
            `catalog audit: invalid JSON (exit ${code}): ${out.slice(0, 500)}`
          )
        );
      }
    });
  });
}

async function probeOrderDryRun(order) {
  const pointKey = await resolveOrderPointKey(order);
  const spreadsheetId = resolveSpreadsheetIdForPointKey(pointKey);
  if (!spreadsheetId) {
    return { ok: false, reason: "NO_SPREADSHEET", orderNo: order.orderNo };
  }

  const dayKey = getOrderStatsDayKey(order);
  const failures = [];

  for (const row of order.items || []) {
    const modelName = getAssortmentSheetModelName(row);
    for (const flavor of row.flavors || []) {
      const qty = Math.max(0, Number(flavor?.qty || 0));
      if (!qty) continue;
      const labels = buildAssortmentFlavorSearchLabels(flavor, row.productKey);
      const result = await applyAssortmentDelta({
        spreadsheetId,
        pointLabel: pointKey,
        dayKey,
        modelName,
        productKey: row.productKey,
        flavorLabel: labels[0] || "",
        flavorLabelCandidates: labels.slice(1),
        deltaQty: -qty,
        dryRun: true,
      });
      if (!result?.ok) {
        failures.push({
          modelName,
          flavor: labels[0],
          reason: result?.reason,
        });
      }
    }
  }

  return {
    ok: failures.length === 0,
    orderNo: order.orderNo,
    pointKey,
    failures,
  };
}

await mongoose.connect(process.env.MONGODB_URI);

const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

const catalogAudit = await runAuditAllPoints();

const probeResults = [];
const syncGaps = [];
const syncGapsRecent = [];

const recentDayCutoff = new Date();
recentDayCutoff.setDate(recentDayCutoff.getDate() - syncGapLookbackDays);
const recentDayKeyMin = recentDayCutoff.toISOString().slice(0, 10);

for (const pointKey of ASSORTMENT_RETRY_POINT_KEYS.filter(
  (k) => SPREADSHEET_ID_BY_POINT_KEY[k]
)) {
  const orders = await Order.find({
    createdAt: { $gte: since },
    status: { $nin: ["canceled", "annulled"] },
  })
    .sort({ updatedAt: -1 })
    .limit(400)
    .lean();

  const fulfilled = [];
  for (const o of orders) {
    const pk = await resolveOrderPointKey(o);
    if (pk !== pointKey && !(pointKey === "wola" && pk === "delivery-2")) continue;
    if (!orderQualifiesForAssortmentGoogleSync(o)) continue;
    fulfilled.push(o);
  }

  const needsProbe = fulfilled.filter(
    (o) =>
      !o.googleSheetSync?.appliedAt ||
      String(o.googleSheetSync?.lastError || "").trim()
  );

  for (const o of needsProbe.slice(0, samplePerPoint)) {
    probeResults.push(await probeOrderDryRun(o));
  }

  const missingSync = fulfilled.filter((o) => !o.googleSheetSync?.appliedAt).length;
  syncGaps.push({
    pointKey,
    fulfilled: fulfilled.length,
    missingAppliedAt: missingSync,
  });

  const recentFulfilled = fulfilled.filter(
    (o) => getOrderStatsDayKey(o) >= recentDayKeyMin
  );
  const recentMissing = recentFulfilled.filter(
    (o) => !o.googleSheetSync?.appliedAt
  ).length;
  syncGapsRecent.push({
    pointKey,
    sinceDayKey: recentDayKeyMin,
    fulfilled: recentFulfilled.length,
    missingAppliedAt: recentMissing,
  });
}

/** Критерій «PASS»: усі блоки моделей; смаки — див. flavorsMissing у звіті (лист ≠ каталог). */
const catalogFail = Object.values(catalogAudit || {}).reduce((sum, p) => {
  if (p?.reason) return sum + 1;
  return sum + Number(p.modelsMissing || 0);
}, 0);

const catalogFlavorMissing = Object.values(catalogAudit || {}).reduce(
  (sum, p) => sum + Number(p?.flavorsMissing || 0),
  0
);

const probeFail = probeResults.filter((p) => !p.ok).length;

const syncGapFail = syncGapsRecent.some((g) => {
  if (!g.fulfilled) return false;
  const missing = Number(g.missingAppliedAt || 0);
  return missing > 0;
});

const catalogFlavorFail = strictCatalog && catalogFlavorMissing > 0;

const summary = {
  sheetsEnabled: isGoogleSheetsEnabled(),
  catalogAudit,
  catalogFlavorMissing,
  strictCatalog,
  syncGaps,
  syncGapsRecent,
  syncGapFail,
  probeSampled: probeResults.length,
  probeFailures: probeResults.filter((p) => !p.ok),
  ok: catalogFail === 0 && probeFail === 0 && !syncGapFail && !catalogFlavorFail,
};

if (asJson) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log("=== run-assortment-verification ===");
  console.log({
    ok: summary.ok,
    catalogModelMissing: catalogFail,
    catalogFlavorMissing,
    probeFail,
    syncGapFail,
    syncGapsRecent,
    syncGaps14d: syncGaps,
  });
  if (!summary.ok) {
    console.log(
      "\nFAIL: моделі / probe / немає appliedAt за останні",
      syncGapLookbackDays,
      "дні (див. syncGapsRecent). 186 catalog flavors — лише з --strict-catalog."
    );
    console.log(
      "Догнати асортимент:",
      "node scripts/retry-google-sheets-assortment-range.mjs --from 2026-09-25 --to",
      new Date().toISOString().slice(0, 10)
    );
  } else if (catalogFlavorMissing > 0) {
    console.log(
      "\nWARN: catalogFlavorMissing =",
      catalogFlavorMissing,
      "(CHASER BLACK тощо на листі — SYNC_ERRORS при продажу цих смаків)."
    );
  }
  if (summary.probeFailures.length) {
    console.log("\nProbe failures:", summary.probeFailures);
  }
  for (const [key, p] of Object.entries(catalogAudit || {})) {
    if (p.flavorMissing > 0 || p.modelMissingUnique > 0) {
      console.log(`\nCatalog ${key}:`, {
        flavorMissing: p.flavorMissing,
        modelMissingUnique: p.modelMissingUnique,
      });
    }
  }
}

await mongoose.disconnect();
process.exit(summary.ok ? 0 : 1);
