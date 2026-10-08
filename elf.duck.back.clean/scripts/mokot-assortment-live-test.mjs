/**
 * Тестовий «продаж» на листі АССОРТИМЕНТ (Mokotów): мінус qty, потім restore.
 *
 * docker compose exec api node scripts/mokot-assortment-live-test.mjs sale
 * docker compose exec api node scripts/mokot-assortment-live-test.mjs restore
 * docker compose exec api node scripts/mokot-assortment-live-test.mjs status
 *
 * Опції:
 *   --qty 2
 *   --product-key elfliq-30-ml --flavor-key blue-razz-ice --flavor-label "Blue Razz Ice"
 *   --force   (sale: перезаписати state, якщо вже є pending restore)
 */
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(backendRoot, ".env") });

import {
  applyAssortmentDelta,
  buildAssortmentFlavorSearchLabels,
} from "../lib/googleSheets/assortmentGrid.js";
import {
  isGoogleSheetsEnabled,
  SPREADSHEET_ID_BY_POINT_KEY,
} from "../lib/googleSheets/config.js";
import { getAssortmentSheetModelName } from "../lib/server/helpers/chunk09.js";
import { getWarsawDayKey } from "../lib/server/helpers/chunk08.js";

const POINT_KEY = "mokot-w";
const STATE_PATH = path.join(
  backendRoot,
  "data/mokot-assortment-live-test-state.json"
);

const args = process.argv.slice(2);
function arg(name, def = "") {
  const i = args.indexOf(name);
  return i >= 0 ? String(args[i + 1] || "").trim() : def;
}

const mode = (args.find((a) => !a.startsWith("-")) || "sale").toLowerCase();
const qty = Math.max(1, Number(arg("--qty", "1")) || 1);
const force = args.includes("--force");

const productKey = arg("--product-key", "elfliq-30-ml");
const flavorKey = arg("--flavor-key", "blue-razz-ice");
const flavorLabel = arg("--flavor-label", "Blue Razz Ice");

if (!isGoogleSheetsEnabled()) {
  console.error("Google Sheets вимкнено (credentials / config).");
  process.exit(1);
}

const spreadsheetId = SPREADSHEET_ID_BY_POINT_KEY[POINT_KEY];
if (!spreadsheetId) {
  console.error("Немає spreadsheet для", POINT_KEY);
  process.exit(1);
}

const modelName = getAssortmentSheetModelName({
  productKey,
  productTitle1: "",
  productTitle2: "",
});
const flavor = { flavorKey, flavorLabel };
const flavorLabelCandidates = buildAssortmentFlavorSearchLabels(
  flavor,
  productKey
).slice(1);
const dayKey = getWarsawDayKey(new Date());

async function readQty() {
  return applyAssortmentDelta({
    spreadsheetId,
    pointLabel: "Mokotów test",
    dayKey,
    modelName,
    productKey,
    flavorLabel,
    flavorLabelCandidates,
    deltaQty: 0,
    dryRun: true,
  });
}

function loadState() {
  if (!fs.existsSync(STATE_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
  } catch {
    return null;
  }
}

function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + "\n", "utf8");
}

function clearState() {
  if (fs.existsSync(STATE_PATH)) fs.unlinkSync(STATE_PATH);
}

if (mode === "status") {
  const pending = loadState();
  const snap = await readQty();
  console.log({
    pointKey: POINT_KEY,
    spreadsheetId,
    productKey,
    flavorKey,
    flavorLabel,
    modelName,
    pendingRestore: Boolean(pending),
    pending: pending
      ? {
          qty: pending.qty,
          beforeQty: pending.beforeQty,
          afterQty: pending.afterQty,
          appliedAt: pending.appliedAt,
        }
      : null,
    current: snap.ok
      ? {
          qty: snap.currentQty,
          a1: snap.a1,
          matchedFlavorLabel: snap.matchedFlavorLabel,
        }
      : { error: snap.reason },
  });
  process.exit(snap.ok ? 0 : 1);
}

if (mode === "restore") {
  const state = loadState();
  if (!state) {
    console.error(
      "Немає файлу стану — спочатку запусти sale:\n",
      "  node scripts/mokot-assortment-live-test.mjs sale"
    );
    process.exit(1);
  }

  const before = await readQty();
  console.log("Перед restore:", {
    currentQty: before.currentQty,
    a1: before.a1,
    expectedAfter: state.beforeQty,
  });

  const restore = await applyAssortmentDelta({
    spreadsheetId: state.spreadsheetId || spreadsheetId,
    pointLabel: "Mokotów test restore",
    dayKey,
    modelName: state.modelName,
    productKey: state.productKey,
    flavorLabel: state.flavorLabel,
    flavorLabelCandidates: state.flavorLabelCandidates || [],
    deltaQty: state.qty,
    dryRun: false,
  });

  if (!restore.ok) {
    console.error("Restore FAIL:", restore);
    process.exit(1);
  }

  const after = await readQty();
  console.log("Після restore:", {
    currentQty: after.currentQty,
    wrote: restore.a1,
    nextQty: restore.nextQty,
  });

  if (
    state.beforeQty != null &&
    after.ok &&
    after.currentQty !== state.beforeQty
  ) {
    console.warn(
      `Увага: qty ${after.currentQty} ≠ збережений beforeQty ${state.beforeQty} (можливо ручні зміни на листі).`
    );
  }

  clearState();
  console.log("\n✅ Відновлено (+", state.qty, "). State видалено:", STATE_PATH);
  process.exit(0);
}

if (mode !== "sale") {
  console.error("Невідома команда:", mode, "(sale | restore | status)");
  process.exit(1);
}

const existing = loadState();
if (existing && !force) {
  console.error(
    "Вже є незавершений тест (потрібен restore). State:",
    STATE_PATH,
    "\nВикористай restore або --force для нового sale."
  );
  process.exit(1);
}

const before = await readQty();
if (!before.ok) {
  console.error("Не вдалось знайти рядок:", before);
  process.exit(1);
}

console.log("=== Mokotów АССОРТИМЕНТ — тестовий продаж ===");
console.log({
  modelName,
  flavorLabel,
  flavorKey,
  qtySold: qty,
  beforeQty: before.currentQty,
  cell: before.a1,
  matchedFlavorLabel: before.matchedFlavorLabel,
});

if (before.currentQty < qty) {
  console.error(
    `Недостатньо на листі: ${before.currentQty} < ${qty}. Обери інший смак або --qty.`
  );
  process.exit(1);
}

const sale = await applyAssortmentDelta({
  spreadsheetId,
  pointLabel: "Mokotów test sale",
  dayKey,
  modelName,
  productKey,
  flavorLabel,
  flavorLabelCandidates,
  deltaQty: -qty,
  dryRun: false,
});

if (!sale.ok) {
  console.error("Sale FAIL:", sale);
  process.exit(1);
}

const after = await readQty();
const state = {
  pointKey: POINT_KEY,
  spreadsheetId,
  dayKey,
  modelName,
  productKey,
  flavorKey,
  flavorLabel,
  flavorLabelCandidates,
  qty,
  beforeQty: before.currentQty,
  afterQty: after.currentQty,
  a1: sale.a1,
  matchedFlavorLabel: sale.matchedFlavorLabel || before.matchedFlavorLabel,
  appliedAt: new Date().toISOString(),
};

saveState(state);

console.log({
  afterQty: after.currentQty,
  nextQtyWritten: sale.nextQty,
  delta: -qty,
});
console.log("\n✅ Списано з листа. State:", STATE_PATH);
console.log(
  "Відновити: docker compose exec api node scripts/mokot-assortment-live-test.mjs restore"
);
