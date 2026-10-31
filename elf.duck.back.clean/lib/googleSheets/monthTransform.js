export const REPORT_TAB_GRID_ROWS = 650;
export const REPORT_TAB_GRID_COLS = 702; // A..ZZ

const DAY_PAIR_ROW_STRIDE = 32;
const DAY_BLOCK_STARTS = [0, 11];
const MONTH_RIGHT_START_COL = 11;
const MONTH_SOLD_COL = MONTH_RIGHT_START_COL + 3;
const MONTH_TIER_COLS = [
  MONTH_RIGHT_START_COL + 4,
  MONTH_RIGHT_START_COL + 5,
  MONTH_RIGHT_START_COL + 6,
  MONTH_RIGHT_START_COL + 7,
];
const MODEL_LIST_MARKERS = new Set([
  "MODEL",
  "1500",
  "2000",
  "ELFLIQ",
  "КАССА",
]);

export function pad2(n) {
  return String(n).padStart(2, "0");
}

export function lastDayOfMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

export function reportTabTitleForMonth(year, month) {
  return `ОТЧЕТ 01.${pad2(month)}.${year}`;
}

export function monthRangeLabel(year, month) {
  const mm = pad2(month);
  const ld = lastDayOfMonth(year, month);
  return `01.${mm}-${pad2(ld)}.${mm}`;
}

export function transformCellToNextMonth(
  value,
  { sourceMonth, targetMonth, sourceLastDay, targetLastDay }
) {
  const s = String(value ?? "").trim();
  if (!s) return value;

  const sm = pad2(sourceMonth);
  const tm = pad2(targetMonth);

  const sourceRange = `01.${sm}-${pad2(sourceLastDay)}.${sm}`;
  const targetRange = `01.${tm}-${pad2(targetLastDay)}.${tm}`;

  if (s === sourceRange || s.replace(/–/g, "-") === sourceRange) {
    return targetRange;
  }

  if (s === `${pad2(sourceLastDay)}.${sm}`) {
    return `${pad2(targetLastDay)}.${tm}`;
  }

  const range = s.match(/^(\d{2})\.(\d{2})-(\d{2})\.(\d{2})$/);
  if (range && range[2] === sm && range[4] === sm) {
    return targetRange;
  }

  const day = s.match(/^(\d{2})\.(\d{2})$/);
  if (day && day[2] === sm) {
    const d = Number(day[1]);
    if (d > targetLastDay) return `${pad2(targetLastDay)}.${tm}`;
    return `${day[1]}.${tm}`;
  }

  return value;
}

function isNumericish(cell) {
  const raw = String(cell ?? "").trim();
  if (!raw) return false;
  if (/zl|zł|%/i.test(raw)) return true;
  return /^-?\d+([.,]\d+)?$/.test(raw.replace(/\s/g, ""));
}

function zeroNumericCell(cell) {
  const s = String(cell ?? "").trim();
  if (!s) return "";
  if (/zl|zł/i.test(s)) return "0,00 zł";
  return 0;
}

function ensureCell(out, rowIndex, colIndex) {
  if (!out[rowIndex]) out[rowIndex] = [];
}

function clearCell(out, rowIndex, colIndex) {
  ensureCell(out, rowIndex, colIndex);
  out[rowIndex][colIndex] = "";
}

function isModelDataRowLabel(label) {
  const text = String(label || "").trim();
  if (!text) return false;
  if (MODEL_LIST_MARKERS.has(text)) return false;
  if (/^model$/i.test(text)) return false;
  if (/^касса$/i.test(text)) return false;
  if (/^зарплата$/i.test(text)) return false;
  if (/^итого$/i.test(text)) return false;
  return true;
}

export function padReportValuesGrid(
  rows,
  rowCount = REPORT_TAB_GRID_ROWS,
  colCount = REPORT_TAB_GRID_COLS
) {
  const maxRow = Math.max(rowCount, (rows || []).length);
  let maxCol = colCount;

  for (const row of rows || []) {
    maxCol = Math.max(maxCol, row?.length || 0);
  }

  const out = [];

  for (let r = 0; r < maxRow; r += 1) {
    const src = rows?.[r] || [];
    const line = [];

    for (let c = 0; c < maxCol; c += 1) {
      const value = src[c];
      line.push(value === undefined || value === null ? "" : value);
    }

    out.push(line);
  }

  return out;
}

function resetMonthSummaryFormulaColumns(out, rangeLabel) {
  let titleRow = -1;

  for (let r = 480; r < out.length; r += 1) {
    if (String(out[r]?.[MONTH_RIGHT_START_COL] || "").trim() === rangeLabel) {
      titleRow = r;
      break;
    }
  }

  if (titleRow < 0) return;

  for (let r = titleRow + 2; r < out.length; r += 1) {
    const leftLabel = String(out[r]?.[0] || "").trim();
    const rightLabel = String(out[r]?.[MONTH_RIGHT_START_COL] || "").trim();

    if (
      String(out[r]?.[0] || "").trim() === "MODEL" &&
      String(out[r]?.[1] || "").includes("ПРОДАЖ")
    ) {
      break;
    }

    if (/^итого$/i.test(rightLabel)) {
      for (let c = 0; c < (out[r] || []).length; c += 1) {
        if (c === 0 || c === MONTH_RIGHT_START_COL) continue;
        const label = String(out[r]?.[c] || "").trim();
        if (MODEL_LIST_MARKERS.has(label) || /^model$/i.test(label)) continue;
        if (MONTH_TIER_COLS.includes(c)) {
          out[r][c] = 0;
          continue;
        }
        if (isNumericish(out[r]?.[c])) out[r][c] = zeroNumericCell(out[r][c]);
      }
      break;
    }

    if (/^касса$/i.test(leftLabel) || /^касса$/i.test(rightLabel)) {
      for (let c = 1; c <= 9; c += 1) {
        if (c === 8) {
          out[r][c] = 0;
          continue;
        }
        clearCell(out, r, c);
      }
      for (const c of [MONTH_SOLD_COL, ...MONTH_TIER_COLS, MONTH_RIGHT_START_COL + 8]) {
        if (c === MONTH_RIGHT_START_COL + 8) {
          out[r][c] = 0;
          continue;
        }
        clearCell(out, r, c);
      }
      continue;
    }

    if (/^зарплата$/i.test(rightLabel)) {
      clearCell(out, r, MONTH_RIGHT_START_COL + 1);
      continue;
    }

    if (isModelDataRowLabel(leftLabel)) {
      clearCell(out, r, 1);
      clearCell(out, r, 2);
    }

    if (isModelDataRowLabel(rightLabel)) {
      clearCell(out, r, MONTH_SOLD_COL);
      for (const c of MONTH_TIER_COLS) {
        out[r][c] = 0;
      }
    }
  }
}

export function resetReportStatsInGrid(
  rows,
  targetYear,
  targetMonth,
  targetLastDay
) {
  const tm = pad2(targetMonth);
  const footerLeft = `${pad2(targetLastDay)}.${tm}`;
  const rangeLabel = monthRangeLabel(targetYear, targetMonth);

  const out = rows.map((row) => (row ? [...row] : []));

  for (let titleRow = 0; titleRow < 480; titleRow += DAY_PAIR_ROW_STRIDE) {
    for (const blockStart of DAY_BLOCK_STARTS) {
      const header = String(out[titleRow]?.[blockStart] || "").trim();
      if (!new RegExp(`^\\d{2}\\.${tm}$`).test(header)) continue;

      for (let r = titleRow + 2; r < titleRow + DAY_PAIR_ROW_STRIDE - 1; r++) {
        const label = String(out[r]?.[blockStart] || "").trim();
        if (!label) continue;
        if (/^касса$/i.test(label)) {
          for (let c = blockStart + 1; c <= blockStart + 7; c += 1) {
            clearCell(out, r, c);
          }
          out[r][blockStart + 8] = 0;
          clearCell(out, r, blockStart + 9);
          continue;
        }
        if (/^зарплата$/i.test(label)) {
          clearCell(out, r, blockStart + 1);
          continue;
        }

        if (!isModelDataRowLabel(label)) continue;

        clearCell(out, r, blockStart + 1);
        clearCell(out, r, blockStart + 2);
        clearCell(out, r, blockStart + 3);
        for (let c = blockStart + 4; c <= blockStart + 7; c += 1) {
          out[r][c] = 0;
        }
        if (isNumericish(out[r]?.[blockStart + 8])) {
          out[r][blockStart + 8] = 0;
        }
      }
    }
  }

  resetMonthSummaryFormulaColumns(out, rangeLabel);

  for (let r = 480; r < out.length; r++) {
    const row = out[r] || [];
    const left = String(row[0] || "").trim();
    const right = String(row[11] || "").trim();

    if (
      left === footerLeft ||
      right === rangeLabel ||
      /^итого$/i.test(right)
    ) {
      for (let c = 0; c < row.length; c++) {
        if (c === 0 || c === 11) continue;
        const label = String(row[c] || "").trim();
        if (MODEL_LIST_MARKERS.has(label) || /^model$/i.test(label)) continue;
        if (isNumericish(row[c])) row[c] = zeroNumericCell(row[c]);
      }
    }

    if (
      String(row[0] || "").trim() === "MODEL" &&
      String(row[1] || "").includes("ПРОДАЖ")
    ) {
      break;
    }
  }

  return out;
}

export function transformReportGridToNextMonth(
  rows,
  { sourceYear, sourceMonth, targetYear, targetMonth }
) {
  const sourceLastDay = lastDayOfMonth(sourceYear, sourceMonth);
  const targetLastDay = lastDayOfMonth(targetYear, targetMonth);

  const mapped = (rows || []).map((row) =>
    (row || []).map((cell) =>
      transformCellToNextMonth(cell, {
        sourceMonth,
        targetMonth,
        sourceLastDay,
        targetLastDay,
      })
    )
  );

  return resetReportStatsInGrid(
    mapped,
    targetYear,
    targetMonth,
    targetLastDay
  );
}
