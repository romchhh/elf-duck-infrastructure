const DAY_PAIR_ROW_STRIDE = 32;
const DAY_BLOCK_STARTS = [0, 11];
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
          for (let c = blockStart + 1; c <= blockStart + 9; c++) {
            if (isNumericish(out[r][c])) out[r][c] = zeroNumericCell(out[r][c]);
          }
          continue;
        }
        if (/^зарплата$/i.test(label)) {
          if (isNumericish(out[r]?.[blockStart + 1])) {
            out[r][blockStart + 1] = "0,00 zł";
          }
          continue;
        }

        for (let c = blockStart + 1; c <= blockStart + 8; c++) {
          if (isNumericish(out[r]?.[c])) out[r][c] = 0;
        }
      }
    }
  }

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
