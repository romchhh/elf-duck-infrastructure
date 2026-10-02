/**
 * Тестові замовлення: tier 2 / 3–4 / 5+, apply + відміна (reverse).
 * Перевіряє день (модель + КАССА), місяць (ІТОГО + модель), асортимент.
 *
 * node scripts/google-sheets-tier-orders-live.mjs
 */
import { applyAssortmentDelta } from "../lib/googleSheets/assortmentGrid.js";
import { SPREADSHEET_ID_BY_POINT_KEY } from "../lib/googleSheets/config.js";
import {
  findDayBlock,
  findKassaRowInDayBlock,
  findMonthItogoRow,
  findMonthSummaryModelRow,
  findMonthSummarySection,
  findReportModelRowInDayBlock,
  MONTH_RIGHT_COL,
  reportTabTitleForDayKey,
  warsawDayKeyToReportHeader,
} from "../lib/googleSheets/dailyReportGrid.js";
import { runGoogleSheetsOrderSync } from "../lib/googleSheets/orderSync.js";
import {
  normalizeSheetModelName,
  toReportModelLabel,
} from "../lib/googleSheets/normalize.js";
import { escapeSheetTitle, readSheetValues } from "../lib/googleSheets/client.js";
import { getWarsawDayKey } from "../lib/server/helpers/chunk08.js";

const POINT = "mokot-w";
const spreadsheetId = SPREADSHEET_ID_BY_POINT_KEY[POINT];
const dayKey = getWarsawDayKey(new Date());
const dayHeader = warsawDayKeyToReportHeader(dayKey);
const tabTitle = reportTabTitleForDayKey(dayKey);
const reportModel = toReportModelLabel(normalizeSheetModelName("ELFLIQ 30 ML"));

const TIER_COL = { tier1: 4, tier2: 5, tier34: 6, tier5: 7 };

function parseNum(cell) {
  const raw = String(cell ?? "")
    .replace(/\s/g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function buildOrder({ qty, flavorLabel, totalZl }) {
  return {
    pickupPointKey: POINT,
    deliveryType: "pickup",
    stockCommittedAt: new Date(),
    createdAt: new Date(),
    totalZl,
    payment: {
      status: "paid",
      managerDisplayCurrency: "PLN",
      managerDisplayAmount: totalZl,
      cashbackAppliedZl: 0,
      referralFirstOrderDiscountTotalZl: 0,
    },
    items: [
      {
        productTitle1: "ELFLIQ",
        productTitle2: "30 ML",
        productKey: "elfliq-30-ml",
        flavors: [{ flavorLabel, flavorKey: flavorLabel, qty }],
      },
    ],
  };
}

const SCENARIOS = [
  {
    name: "tier2 (2шт)",
    order: buildOrder({ qty: 2, flavorLabel: "Blue Razz Ice", totalZl: 60 }),
    tierKey: "tier2",
    qty: 2,
  },
  {
    name: "tier34 (4шт)",
    order: buildOrder({ qty: 4, flavorLabel: "Blue Razz Ice", totalZl: 120 }),
    tierKey: "tier34",
    qty: 4,
  },
  {
    name: "tier5 (5шт+)",
    order: buildOrder({ qty: 5, flavorLabel: "Blue Razz Ice", totalZl: 150 }),
    tierKey: "tier5",
    qty: 5,
  },
];

async function readAssortmentQty(flavorLabel) {
  const r = await applyAssortmentDelta({
    spreadsheetId,
    pointLabel: "Mokotów",
    dayKey,
    modelName: "ELFLIQ 30 ML",
    productKey: "elfliq-30-ml",
    flavorLabel,
    deltaQty: 0,
    dryRun: true,
  });
  return r.ok ? Number(r.currentQty) : NaN;
}

async function readMetrics(flavorLabel) {
  const rows = await readSheetValues(
    spreadsheetId,
    `${escapeSheetTitle(tabTitle)}!A1:ZZ650`
  );
  const block = findDayBlock(rows, dayHeader);
  const section = findMonthSummarySection(rows, dayKey);
  const modelRow = block
    ? findReportModelRowInDayBlock(rows, block, reportModel)
    : -1;
  const kassaRow = block ? findKassaRowInDayBlock(rows, block) : -1;
  const monthModelRow = section
    ? findMonthSummaryModelRow(rows, section, reportModel)
    : -1;
  const itogoRow = section ? findMonthItogoRow(rows, section) : -1;

  const bs = block?.blockStart ?? 0;
  const rs = section?.rightStartCol ?? 11;

  const day = {
    sold: modelRow >= 0 ? parseNum(rows[modelRow][bs + 3]) : NaN,
    stalo: modelRow >= 0 ? parseNum(rows[modelRow][bs + 2]) : NaN,
    tiers: {},
    kassa: kassaRow >= 0 ? parseNum(rows[kassaRow][bs + 1]) : NaN,
    kassaTiers: {},
  };
  for (const [k, off] of Object.entries(TIER_COL)) {
    day.tiers[k] =
      modelRow >= 0 ? parseNum(rows[modelRow][bs + off]) : NaN;
    day.kassaTiers[k] =
      kassaRow >= 0 ? parseNum(rows[kassaRow][bs + off]) : NaN;
  }

  const month = {
    sold: monthModelRow >= 0
      ? parseNum(rows[monthModelRow][rs + MONTH_RIGHT_COL.sold])
      : NaN,
    tiers: {},
    itogoKassa: itogoRow >= 0 ? parseNum(rows[itogoRow][rs + 1]) : NaN,
    itogoTiers: {},
  };
  for (const [k, off] of Object.entries(MONTH_RIGHT_COL)) {
    if (!k.startsWith("tier")) continue;
    month.tiers[k] =
      monthModelRow >= 0 ? parseNum(rows[monthModelRow][rs + off]) : NaN;
    month.itogoTiers[k] =
      itogoRow >= 0 ? parseNum(rows[itogoRow][rs + off]) : NaN;
  }

  const assortment = await readAssortmentQty(flavorLabel);

  return { day, month, assortment, modelRow, block: !!block, section: !!section };
}

function diff(a, b, path = "") {
  const issues = [];
  if (typeof a === "number" && typeof b === "number") {
    if (Math.abs(a - b) > 0.02) issues.push(`${path}: ${a} !== ${b}`);
    return issues;
  }
  if (a && typeof a === "object") {
    for (const k of Object.keys(a)) {
      issues.push(...diff(a[k], b?.[k], path ? `${path}.${k}` : k));
    }
  }
  return issues;
}

function expectDelta(before, after, { qty, tierKey, kasa }) {
  const issues = [];
  const dSold = after.day.sold - before.day.sold;
  const dTier = after.day.tiers[tierKey] - before.day.tiers[tierKey];
  const dKt = after.day.kassaTiers[tierKey] - before.day.kassaTiers[tierKey];
  const dAssort = after.assortment - before.assortment;
  const dKassa = after.day.kassa - before.day.kassa;
  const dMonthSold = after.month.sold - before.month.sold;
  const dMonthTier = after.month.tiers[tierKey] - before.month.tiers[tierKey];
  const dItogoTier =
    after.month.itogoTiers[tierKey] - before.month.itogoTiers[tierKey];

  if (dSold !== qty) issues.push(`day.sold +${qty} expected, got +${dSold}`);
  if (dTier !== qty) issues.push(`day.tier.${tierKey} +${qty}, got +${dTier}`);
  if (dKt !== qty) issues.push(`day.kassaTier.${tierKey} +${qty}, got +${dKt}`);
  if (dAssort !== -qty)
    issues.push(`assortment -${qty} expected, got ${dAssort}`);
  if (Math.abs(dKassa - kasa) > 0.02)
    issues.push(`day.kassa +${kasa} expected, got +${dKassa}`);
  if (dMonthSold !== qty)
    issues.push(`month.sold +${qty}, got +${dMonthSold}`);
  if (dMonthTier !== qty)
    issues.push(`month.tier.${tierKey} +${qty}, got +${dMonthTier}`);
  if (dItogoTier !== qty)
    issues.push(`itogo.tier.${tierKey} +${qty}, got +${dItogoTier}`);

  return issues;
}

let failed = 0;

console.log("=== Tier orders live test ===", { POINT, dayKey, tabTitle, reportModel });

const baseline = await readMetrics("Blue Razz Ice");
if (!baseline.block || !baseline.section || baseline.modelRow < 0) {
  console.error("Sheet structure missing for today", baseline);
  process.exit(1);
}
console.log("Baseline assortment:", baseline.assortment);

for (const sc of SCENARIOS) {
  console.log(`\n--- ${sc.name}: apply ---`);
  const before = await readMetrics("Blue Razz Ice");
  const apply = await runGoogleSheetsOrderSync(sc.order, { dryRun: false });
  if (!apply.ok) {
    failed++;
    console.error("APPLY FAIL", apply);
    continue;
  }
  const after = await readMetrics("Blue Razz Ice");
  const issues = expectDelta(before, after, {
    qty: sc.qty,
    tierKey: sc.tierKey,
    kasa: sc.order.payment.managerDisplayAmount,
  });
  if (issues.length) {
    failed++;
    console.error("ASSERT apply:", issues);
  } else {
    console.log("OK apply: day/month/tiers/assortment/kassa");
  }

  console.log(`--- ${sc.name}: reverse (відміна) ---`);
  const beforeRev = after;
  const rev = await runGoogleSheetsOrderSync(sc.order, {
    direction: "reverse",
    dryRun: false,
  });
  if (!rev.ok) {
    failed++;
    console.error("REVERSE FAIL", rev);
    continue;
  }
  const afterRev = await readMetrics("Blue Razz Ice");
  const restoreIssues = diff(before.day, afterRev.day, "day");
  restoreIssues.push(...diff(before.month, afterRev.month, "month"));
  if (afterRev.assortment !== before.assortment) {
    restoreIssues.push(
      `assortment ${before.assortment} -> ${afterRev.assortment} (expected restore)`
    );
  }
  if (restoreIssues.length) {
    failed++;
    console.error("ASSERT reverse:", restoreIssues);
  } else {
    console.log("OK reverse: повний відкат");
  }
}

console.log("\n--- Stack: tier2 + tier5 без відміни між ними ---");
const stack2 = SCENARIOS[0];
const stack5 = SCENARIOS[2];
const b0 = await readMetrics("Blue Razz Ice");
let r1 = await runGoogleSheetsOrderSync(stack2.order, { dryRun: false });
let r2 = await runGoogleSheetsOrderSync(stack5.order, { dryRun: false });
if (!r1.ok || !r2.ok) {
  failed++;
  console.error("stack apply failed", r1, r2);
} else {
  const mid = await readMetrics("Blue Razz Ice");
  const issues = [];
  const dT2 = mid.day.tiers.tier2 - b0.day.tiers.tier2;
  const dT5 = mid.day.tiers.tier5 - b0.day.tiers.tier5;
  if (dT2 !== 2) issues.push(`stack tier2 +2 expected, got +${dT2}`);
  if (dT5 !== 5) issues.push(`stack tier5 +5 expected, got +${dT5}`);
  if (mid.day.sold - b0.day.sold !== 7)
    issues.push(`stack sold +7 expected, got +${mid.day.sold - b0.day.sold}`);
  const dKassa = mid.day.kassa - b0.day.kassa;
  const wantKassa =
    stack2.order.payment.managerDisplayAmount +
    stack5.order.payment.managerDisplayAmount;
  if (Math.abs(dKassa - wantKassa) > 0.02)
    issues.push(`stack kassa +${wantKassa}, got +${dKassa}`);
  if (mid.assortment !== b0.assortment - 7)
    issues.push(`assortment -7 expected, got ${mid.assortment - b0.assortment}`);

  if (issues.length) {
    failed++;
    console.error("ASSERT stack:", issues);
  } else {
    console.log("OK stack: 2шт + 5шт+ накопичились");
  }

  console.log("--- Stack: відміна tier5, потім tier2 ---");
  await runGoogleSheetsOrderSync(stack5.order, {
    direction: "reverse",
    dryRun: false,
  });
  const after5 = await readMetrics("Blue Razz Ice");
  if (after5.day.tiers.tier5 !== b0.day.tiers.tier5 + 0) {
    failed++;
    console.error("tier5 not reversed alone");
  }
  if (after5.day.tiers.tier2 !== b0.day.tiers.tier2 + 2) {
    failed++;
    console.error("tier2 should remain +2 after tier5 cancel");
  } else {
    console.log("OK partial cancel tier5");
  }

  await runGoogleSheetsOrderSync(stack2.order, {
    direction: "reverse",
    dryRun: false,
  });
  const end = await readMetrics("Blue Razz Ice");
  const endIssues = diff(b0.day, end.day, "day");
  endIssues.push(...diff(b0.month, end.month, "month"));
  if (end.assortment !== b0.assortment)
    endIssues.push(`assortment ${b0.assortment} vs ${end.assortment}`);
  if (endIssues.length) {
    failed++;
    console.error("ASSERT stack cleanup:", endIssues);
  } else {
    console.log("OK stack: після двох відмін — як на початку");
  }
}

console.log("\n=== RESULT ===", failed === 0 ? "PASS" : `FAIL (${failed})`);
process.exit(failed === 0 ? 0 : 1);
