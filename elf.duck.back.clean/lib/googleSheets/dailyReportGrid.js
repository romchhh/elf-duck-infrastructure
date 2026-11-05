import {
  batchUpdateValues,
  clearSheetValues,
  escapeSheetTitle,
  readSheetFormulas,
  readSheetValues,
} from "./client.js";
import {
  computeBotSheetDelta,
  dayKassaSnapshotKey,
  dayModelTierSnapshotKey,
  recordPerOrderBotSheetIncrement,
  setBotSheetSnapshotTotal,
} from "./dayReportBotSnapshot.js";
import { normalizeSheetModelName, toReportModelLabel } from "./normalize.js";

/** Right monthly block: MODEL + КАССА + ЗАРПЛАТА + sales columns */
export const MONTH_RIGHT_COL = {
  model: 0,
  sold: 3,
  tier1: 4,
  tier2: 5,
  tier34: 6,
  tier5: 7,
  discounts: 8,
};

/** Left month snapshot (last day): stock columns only */
export const MONTH_LEFT_COL = {
  model: 0,
  bylo: 1,
  stalo: 2,
};

function isFormulaText(value) {
  return String(value ?? "").trim().startsWith("=");
}

async function readEnteredCell(spreadsheetId, rangeA1) {
  const rows = await readSheetFormulas(spreadsheetId, rangeA1);
  return rows?.[0]?.[0] ?? "";
}

/**
 * Пише лише число продажу або знижки.
 * Формулу не чіпає. Нуль не записує: порожня клітинка лишається порожньою, а вже вписаний 0 стирається.
 */
async function writeSalesOrDiscountCell(spreadsheetId, rangeA1, nextNumber) {
  const entered = await readEnteredCell(spreadsheetId, rangeA1);
  if (isFormulaText(entered)) {
    return { ok: true, skipped: true, reason: "FORMULA" };
  }

  const next = Number(nextNumber);
  if (!Number.isFinite(next) || next === 0) {
    if (String(entered ?? "").trim() === "") {
      return { ok: true, skipped: true, reason: "EMPTY" };
    }
    await clearSheetValues(spreadsheetId, rangeA1);
    return { ok: true, cleared: true };
  }

  await batchUpdateValues(spreadsheetId, [
    { range: rangeA1, values: [[next]] },
  ]);
  return { ok: true, wrote: next };
}

function colToA1(colIndex) {
  let n = colIndex + 1;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function warsawDayKeyToReportHeader(dayKey) {
  const m = String(dayKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  return `${m[3]}.${m[2]}`;
}

export function reportTabTitleForDayKey(dayKey) {
  const m = String(dayKey || "").match(/^(\d{4})-(\d{2})-/);
  if (!m) return "";
  return `ОТЧЕТ 01.${m[2]}.${m[1]}`;
}

function parseNumberCell(cell) {
  const raw = String(cell || "")
    .replace(/\s/g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export function findDayBlockStartCol(rows, dayHeader) {
  const block = findDayBlock(rows, dayHeader);
  return block?.blockStart ?? -1;
}

function headerRowHasStalo(rows, titleRow, blockStart) {
  const header = rows[titleRow + 1] || [];
  for (let offset = 0; offset < 11; offset += 1) {
    const label = String(header[blockStart + offset] || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "");
    if (label === "СТАЛО") return true;
  }
  return false;
}

/**
 * One daily mini-table: title row with DD.MM, header, models, КАССА row.
 * requireStalo skips a bare date in a calendar strip (25.10 26.10 27.10).
 */
export function findDayBlock(rows, dayHeader, { requireStalo = false } = {}) {
  const wanted = String(dayHeader || "").trim();
  if (!wanted) return null;

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] || [];

    for (let c = 0; c < row.length; c++) {
      if (String(row[c] || "").trim() !== wanted) continue;
      if (requireStalo && !headerRowHasStalo(rows, r, c)) continue;

      let endRow = rows.length;
      for (let r2 = r + 2; r2 < rows.length; r2++) {
        const next = String(rows[r2]?.[c] || "").trim();
        if (/^\d{2}\.\d{2}$/.test(next)) {
          endRow = r2;
          break;
        }
      }

      return {
        blockStart: c,
        titleRow: r,
        headerRow: r + 1,
        endRow,
      };
    }
  }

  return null;
}

export function findKassaRowInDayBlock(rows, block) {
  if (!block) return -1;

  const { blockStart, headerRow, endRow } = block;

  for (let r = headerRow + 1; r < endRow; r++) {
    const cell = String(rows[r]?.[blockStart] || "").trim();
    if (/^касса$/i.test(cell)) return r;
  }

  return -1;
}

/** Усі рядки моделей у денному блоці (до «КАССА»). */
export function listDayBlockModelRowIndexes(rows, block) {
  if (!block) return [];

  const { blockStart, headerRow, endRow } = block;
  const kassaRow = findKassaRowInDayBlock(rows, block);
  const stop = kassaRow >= 0 ? kassaRow : endRow;
  const out = [];

  for (let r = headerRow + 1; r < stop; r++) {
    const cell = String(rows[r]?.[blockStart] || "").trim();
    if (!cell) continue;
    if (/^касса$/i.test(cell)) break;
    out.push(r);
  }

  return out;
}

export function monthRangeLabelForDayKey(dayKey) {
  const m = String(dayKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";

  const year = Number(m[1]);
  const month = Number(m[2]);
  const lastDay = new Date(year, month, 0).getDate();
  const mm = m[2];

  return `01.${mm}-${String(lastDay).padStart(2, "0")}.${mm}`;
}

export function findMonthSummarySection(rows, dayKey) {
  const label = monthRangeLabelForDayKey(dayKey);
  if (!label) return null;

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] || [];

    for (let c = 0; c < row.length; c++) {
      if (String(row[c] || "").trim() !== label) continue;

      const leftStartCol = c >= 11 ? 0 : c;
      const rightStartCol = c;

      return {
        titleRow: r,
        headerRow: r + 1,
        leftStartCol,
        rightStartCol,
        monthRangeLabel: label,
      };
    }
  }

  return null;
}

export function reportModelMatches(cell, reportModelLabel) {
  const wanted = normalizeSheetModelName(reportModelLabel);
  const alt = normalizeSheetModelName(toReportModelLabel(wanted));
  const norm = normalizeSheetModelName(cell);

  if (!norm) return false;
  if (norm === wanted || norm === alt) return true;
  if (toReportModelLabel(norm) === toReportModelLabel(wanted)) return true;

  // Bare «YAMI» ↔ «YAMI 5%» / «YAMI 7%» (не змішуємо 5% з 7% між собою).
  if (wanted === "YAMI" && /^YAMI(\s+[57]%)?$/.test(norm)) return true;
  if (/^YAMI\s+[57]%$/.test(wanted) && norm === "YAMI") return true;

  // MERRY MI ↔ MERRY MI 30K
  if (/^MERRY\s+MI/.test(wanted) && /^MERRY\s+MI/.test(norm)) {
    return true;
  }

  return false;
}

export function findMonthSummaryModelRow(rows, section, reportModelLabel) {
  if (!section) return -1;

  const { headerRow, leftStartCol, rightStartCol } = section;

  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const leftModel = String(row[leftStartCol] || "").trim();
    const rightModel = String(row[rightStartCol] || "").trim();

    if (/^касса$/i.test(leftModel)) break;
    if (/^итого$/i.test(rightModel)) break;
    if (!leftModel && !rightModel) continue;

    if (
      reportModelMatches(leftModel, reportModelLabel) ||
      reportModelMatches(rightModel, reportModelLabel)
    ) {
      return r;
    }
  }

  return -1;
}

export function findMonthItogoRow(rows, section) {
  if (!section) return -1;

  const { headerRow, rightStartCol } = section;

  for (let r = headerRow + 1; r < rows.length; r++) {
    const cell = String(rows[r]?.[rightStartCol] || "")
      .trim()
      .toUpperCase();

    if (cell === "ИТОГО") return r;
    if (cell === "MODEL" && String(rows[r]?.[rightStartCol + 1] || "").includes("ПРОДАЖ")) {
      break;
    }
  }

  return -1;
}

/** @deprecated use findReportModelRowInDayBlock */
export function findReportModelRow(rows, blockStartCol, reportModelLabel, dayHeader) {
  const block = dayHeader ? findDayBlock(rows, dayHeader) : null;
  if (block && block.blockStart === blockStartCol) {
    return findReportModelRowInDayBlock(rows, block, reportModelLabel);
  }

  for (let r = 2; r < rows.length; r++) {
    const modelCell = String(rows[r]?.[blockStartCol] || "").trim();
    if (!modelCell) continue;
    if (/^касса$/i.test(modelCell)) break;
    if (/^\d{2}\.\d{2}$/.test(modelCell)) break;
    if (reportModelMatches(modelCell, reportModelLabel)) return r;
  }

  return -1;
}

export function findReportModelRowInDayBlock(rows, block, reportModelLabel) {
  if (!block) return -1;

  const { blockStart, headerRow, endRow } = block;

  for (let r = headerRow + 1; r < endRow; r++) {
    const modelCell = String(rows[r]?.[blockStart] || "").trim();
    if (!modelCell) continue;
    if (/^касса$/i.test(modelCell)) break;

    if (reportModelMatches(modelCell, reportModelLabel)) return r;
  }

  return -1;
}

const TIER_COL_OFFSET = {
  tier1: 4,
  tier2: 5,
  tier34: 6,
  tier5: 7,
};

export async function loadMonthlyReport(spreadsheetId, tabTitle) {
  const range = `${escapeSheetTitle(tabTitle)}!A1:ZZ650`;
  return readSheetValues(spreadsheetId, range);
}

/** Місячний блок моделі: лише tier (1/2/3-4/5 шт). БЫЛО/СТАЛО/ПРОДАНО — формули в таблиці. */
/**
 * Місячний підсумок (MODEL / КАССА / ЗАРПЛАТА / ПРОДАНО / tiers / СКИДКИ / ІТОГО)
 * у таблиці заповнюється формулами — бот туди більше не пише.
 */
export async function applyMonthSummaryTiersFromProductRows() {
  return { ok: true, updates: 0, skipped: true, reason: "MONTH_SUMMARY_FORMULAS" };
}

/**
 * Рядок ІТОГО місячного блоку — формули в Google Sheets, бот не пише.
 */
export async function applyMonthItogoDelta() {
  return { ok: true, updates: 0, skipped: true, reason: "MONTH_ITOGO_FORMULAS" };
}

/**
 * Денний рядок КАССА: лише СКИДКИ.
 * ПРОДАНО, 1шт… і КАССА zł — формули таблиці, бот їх не пише.
 */
export async function applyDayBlockTotalsDelta({
  spreadsheetId,
  tabTitle,
  dayKey,
  kasaDeltaZl = 0,
  discountsDeltaZl = 0,
  soldUnitsDelta = 0,
  tierDeltas = {},
  dryRun = false,
}) {
  void kasaDeltaZl;
  void soldUnitsDelta;
  void tierDeltas;

  const dayHeader = warsawDayKeyToReportHeader(dayKey);
  const rows = await loadMonthlyReport(spreadsheetId, tabTitle);
  if (!rows) return { ok: false, reason: "SHEETS_DISABLED" };

  const block = findDayBlock(rows, dayHeader);
  if (!block) return { ok: false, reason: "DAY_BLOCK_NOT_FOUND", dayHeader };

  const kassaRow = findKassaRowInDayBlock(rows, block);
  if (kassaRow < 0) return { ok: false, reason: "DAY_KASSA_ROW_NOT_FOUND" };

  const discAdd = Number(discountsDeltaZl || 0);
  if (discAdd === 0) {
    return { ok: true, skipped: true, kassaRow: kassaRow + 1, reason: "NO_DISCOUNT" };
  }

  const prevDisc = parseNumberCell(rows[kassaRow]?.[block.blockStart + 8]);
  const nextDisc = Math.max(0, Number((prevDisc + discAdd).toFixed(2)));
  const range = `${escapeSheetTitle(tabTitle)}!${colToA1(block.blockStart + 8)}${kassaRow + 1}`;

  if (dryRun) {
    return { ok: true, dryRun: true, kassaRow: kassaRow + 1, updates: nextDisc === 0 ? 0 : 1 };
  }

  const written = await writeSalesOrDiscountCell(spreadsheetId, range, nextDisc);
  return { ok: true, kassaRow: kassaRow + 1, updates: written.wrote ? 1 : 0, ...written };
}

/** Денна модель: лише колонка tier (1/2/3-4/5 шт). БЫЛО/СТАЛО/ПРОДАНО — формули. */
export async function applyReportModelDelta({
  spreadsheetId,
  tabTitle,
  dayKey,
  reportModelLabel,
  soldQty,
  tierKey,
  discountsDelta = 0,
  dryRun = false,
}) {
  void discountsDelta;

  const dayHeader = warsawDayKeyToReportHeader(dayKey);
  const rows = await loadMonthlyReport(spreadsheetId, tabTitle);
  if (!rows) return { ok: false, reason: "SHEETS_DISABLED" };

  const block = findDayBlock(rows, dayHeader);
  if (!block) {
    return { ok: false, reason: "DAY_BLOCK_NOT_FOUND", dayHeader };
  }

  const blockStart = block.blockStart;
  const modelRow = findReportModelRowInDayBlock(rows, block, reportModelLabel);
  if (modelRow < 0) {
    return { ok: false, reason: "REPORT_MODEL_ROW_NOT_FOUND", reportModelLabel };
  }

  const tierCol = blockStart + (TIER_COL_OFFSET[tierKey] ?? 4);
  const prevTier = parseNumberCell(rows[modelRow]?.[tierCol]);
  const nextTier = Math.max(0, prevTier + soldQty);
  const range = `${escapeSheetTitle(tabTitle)}!${colToA1(tierCol)}${modelRow + 1}`;

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      dayHeader,
      reportModelLabel,
      prevTier,
      nextTier,
      tierKey,
      monthUpdates: 0,
    };
  }

  await writeSalesOrDiscountCell(spreadsheetId, range, nextTier);

  if (!dryRun) {
    await recordPerOrderBotSheetIncrement({
      spreadsheetId,
      dayKey,
      snapshotKey: dayModelTierSnapshotKey(reportModelLabel, tierKey),
      soldQty,
    });
  }

  return {
    ok: true,
    dayHeader,
    reportModelLabel,
    nextTier,
    tierKey,
  };
}

/**
 * Вечірній sync дня: лише колонки продажів (1шт / 2шт / 3–4шт / 5шт)
 * і СКИДКИ в рядку КАССА. ПРОДАНО, БЫЛО, СТАЛО, КАССА zł — формули.
 */
export async function writeDayBlockFromAggregates({
  spreadsheetId,
  tabTitle,
  dayKey,
  productRows,
  discounts = 0,
  kasaTotalZl = 0,
  soldUnitsTotal = 0,
  tierTotals = {},
  dryRun = false,
  forceAbsolute = false,
}) {
  void kasaTotalZl;
  void soldUnitsTotal;
  void tierTotals;

  const dayHeader = warsawDayKeyToReportHeader(dayKey);
  const rows = await loadMonthlyReport(spreadsheetId, tabTitle);
  if (!rows) return { ok: false, reason: "SHEETS_DISABLED" };

  const block = findDayBlock(rows, dayHeader);
  if (!block) {
    return { ok: false, reason: "DAY_BLOCK_NOT_FOUND", dayHeader };
  }

  const blockStart = block.blockStart;
  const data = [];

  const productByLabel = new Map(
    (productRows || []).map((product) => [
      toReportModelLabel(String(product.model || "")),
      product,
    ])
  );

  if (forceAbsolute) {
    const tierEntries = [
      ["tier1", 4, "tier1"],
      ["tier2", 5, "tier2"],
      ["tier34", 6, "tier34"],
      ["tier5", 7, "tier5"],
    ];

    /** @type {Array<{ meta: object }>} */
    const touched = [];
    let updates = 0;

    for (const modelRow of listDayBlockModelRowIndexes(rows, block)) {
      const cellLabel = String(rows[modelRow]?.[blockStart] || "").trim();
      const product =
        productByLabel.get(toReportModelLabel(cellLabel)) ||
        productByLabel.get(cellLabel);

      for (const [tierKey, colOff, field] of tierEntries) {
        const mongoTotal = Math.max(0, Number(product?.[field] || 0));
        const range = `${escapeSheetTitle(tabTitle)}!${colToA1(blockStart + colOff)}${modelRow + 1}`;
        const meta = {
          tierKey,
          cellLabel: toReportModelLabel(cellLabel) || cellLabel,
          mongoTotal,
        };

        if (dryRun) {
          if (mongoTotal > 0) {
            touched.push({ meta });
            updates += 1;
          }
          continue;
        }

        const written = await writeSalesOrDiscountCell(
          spreadsheetId,
          range,
          mongoTotal
        );
        if (written.wrote || written.cleared) {
          touched.push({ meta });
          updates += 1;
        }
      }
    }

    const kassaRow = findKassaRowInDayBlock(rows, block);
    if (kassaRow >= 0) {
      const mongoDisc = Math.max(0, Number(discounts || 0));
      const range = `${escapeSheetTitle(tabTitle)}!${colToA1(blockStart + 8)}${kassaRow + 1}`;
      const meta = { kassaDiscounts: true, mongoTotal: mongoDisc };

      if (dryRun) {
        if (mongoDisc > 0) {
          touched.push({ meta });
          updates += 1;
        }
      } else {
        const written = await writeSalesOrDiscountCell(
          spreadsheetId,
          range,
          mongoDisc
        );
        if (written.wrote || written.cleared) {
          touched.push({ meta });
          updates += 1;
        }
      }
    }

    if (dryRun) {
      return { ok: true, updates, forceAbsolute: true, dryRun: true };
    }

    for (const modelRow of listDayBlockModelRowIndexes(rows, block)) {
      const cellLabel = String(rows[modelRow]?.[blockStart] || "").trim();
      const product =
        productByLabel.get(toReportModelLabel(cellLabel)) ||
        productByLabel.get(cellLabel);

      for (const [tierKey, , field] of tierEntries) {
        const mongoTotal = Math.max(0, Number(product?.[field] || 0));
        await setBotSheetSnapshotTotal({
          spreadsheetId,
          dayKey,
          snapshotKey: dayModelTierSnapshotKey(
            toReportModelLabel(cellLabel) || cellLabel,
            tierKey
          ),
          totalQty: mongoTotal,
        });
      }
    }

    if (kassaRow >= 0) {
      await setBotSheetSnapshotTotal({
        spreadsheetId,
        dayKey,
        snapshotKey: dayKassaSnapshotKey("discounts"),
        totalQty: Math.max(0, Number(discounts || 0)),
      });
    }

    return {
      ok: true,
      updates,
      forceAbsolute: true,
    };
  }

  for (const product of productRows || []) {
    const label = toReportModelLabel(product.model);
    const modelRow = findReportModelRowInDayBlock(rows, block, label);
    if (modelRow < 0) {
      if (process.env.GOOGLE_SHEETS_LOG_SKIPPED_MODELS === "1") {
        console.warn("[googleSheets] skip model (row not found):", label);
      }
      continue;
    }

    const tierEntries = [
      ["tier1", 4, Number(product.tier1 || 0)],
      ["tier2", 5, Number(product.tier2 || 0)],
      ["tier34", 6, Number(product.tier34 || 0)],
      ["tier5", 7, Number(product.tier5 || 0)],
    ];

    for (const [tierKey, colOff, mongoTotal] of tierEntries) {
      if (mongoTotal <= 0) continue;

      const prev = parseNumberCell(rows[modelRow]?.[blockStart + colOff]);

      const { delta } = await computeBotSheetDelta({
        spreadsheetId,
        dayKey,
        snapshotKey: dayModelTierSnapshotKey(label, tierKey),
        mongoTotalQty: mongoTotal,
        prevCellQty: prev,
        persist: !dryRun,
      });

      if (delta <= 0) continue;
      data.push({
        range: `${escapeSheetTitle(tabTitle)}!${colToA1(blockStart + colOff)}${modelRow + 1}`,
        values: [[prev + delta]],
      });
    }
  }

  const kassaRow = findKassaRowInDayBlock(rows, block);
  if (kassaRow >= 0) {
    const mongoDisc = Number(discounts || 0);
    if (mongoDisc > 0) {
      const prevDisc = parseNumberCell(rows[kassaRow]?.[blockStart + 8]);

      const { delta: discDelta } = await computeBotSheetDelta({
        spreadsheetId,
        dayKey,
        snapshotKey: dayKassaSnapshotKey("discounts"),
        mongoTotalQty: mongoDisc,
        prevCellQty: prevDisc,
        persist: !dryRun,
      });

      if (discDelta > 0) {
        const nextDisc = Number((prevDisc + discDelta).toFixed(2));
        if (nextDisc > 0) {
          data.push({
            range: `${escapeSheetTitle(tabTitle)}!${colToA1(blockStart + 8)}${kassaRow + 1}`,
            values: [[nextDisc]],
          });
        }
      }
    }
  }

  if (!data.length) {
    return { ok: true, updates: 0, skipped: true, reason: "NOTHING_TO_WRITE" };
  }

  const safe = [];
  for (const item of data) {
    const next = Number(item.values?.[0]?.[0]);
    if (!Number.isFinite(next) || next === 0) continue;
    if (!dryRun) {
      const entered = await readEnteredCell(spreadsheetId, item.range);
      if (isFormulaText(entered)) continue;
    }
    safe.push(item);
  }

  if (!safe.length) {
    return { ok: true, updates: 0, skipped: true, reason: "NOTHING_TO_WRITE" };
  }

  if (dryRun) {
    return { ok: true, dryRun: true, updates: safe.length };
  }

  await batchUpdateValues(spreadsheetId, safe);

  return { ok: true, updates: safe.length, discounts };
}
