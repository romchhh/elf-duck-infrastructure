/**
 * Статус googleSheetSync для fulfilled-замовлень за останні N днів по точках асортименту.
 *
 * node scripts/audit-recent-assortment-sync.mjs --days 14
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(backendRoot, "..");
dotenv.config({ path: path.join(backendRoot, ".env") });
if (!process.env.MONGODB_URI) {
  dotenv.config({ path: path.join(repoRoot, ".env") });
}

import mongoose from "mongoose";
import Order from "../models/Order.js";
import {
  orderQualifiesForAssortmentGoogleSync,
  resolveOrderPointKey,
} from "../lib/googleSheets/orderSync.js";
import { ASSORTMENT_RETRY_POINT_KEYS } from "../lib/googleSheets/statsScriptPoints.js";
import { SPREADSHEET_ID_BY_POINT_KEY } from "../lib/googleSheets/config.js";

const days = Number(
  (() => {
    const i = process.argv.indexOf("--days");
    return i >= 0 ? process.argv[i + 1] : 14;
  })()
);

await mongoose.connect(process.env.MONGODB_URI);
const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

const orders = await Order.find({
  updatedAt: { $gte: since },
  status: { $nin: ["canceled", "annulled"] },
})
  .select(
    "orderNo status deliveryType deliveryMethod shippedAt completedAt googleSheetSync updatedAt"
  )
  .sort({ updatedAt: -1 })
  .limit(2000)
  .lean();

const byPoint = {};

for (const pointKey of ASSORTMENT_RETRY_POINT_KEYS.filter(
  (k) => SPREADSHEET_ID_BY_POINT_KEY[k]
)) {
  byPoint[pointKey] = {
    fulfilled: 0,
    applied: 0,
    missing: 0,
    withError: 0,
    inProgress: 0,
    sampleMissing: [],
    sampleErrors: [],
  };
}

for (const o of orders) {
  if (!orderQualifiesForAssortmentGoogleSync(o)) continue;
  const pk = await resolveOrderPointKey(o);
  const bucket = byPoint[pk];
  if (!bucket) continue;

  bucket.fulfilled += 1;
  const gs = o.googleSheetSync || {};
  if (gs.appliedAt && !gs.reversedAt) bucket.applied += 1;
  else {
    bucket.missing += 1;
    if (bucket.sampleMissing.length < 5) {
      bucket.sampleMissing.push(o.orderNo);
    }
  }
  if (String(gs.lastError || "").trim()) {
    bucket.withError += 1;
    if (bucket.sampleErrors.length < 3) {
      bucket.sampleErrors.push({
        orderNo: o.orderNo,
        lastError: String(gs.lastError).slice(0, 120),
      });
    }
  }
  if (gs.syncInProgress) bucket.inProgress += 1;
}

console.log({ days, since: since.toISOString() });
for (const [k, v] of Object.entries(byPoint)) {
  const pct =
    v.fulfilled > 0
      ? Number(((100 * v.applied) / v.fulfilled).toFixed(1))
      : null;
  console.log(k, { ...v, appliedPct: pct });
}

await mongoose.disconnect();
