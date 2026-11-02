import {
  batchClearValues,
  batchUpdateValues,
  escapeSheetTitle,
  getSheetsApi,
  readSheetFormulas,
  readSheetValues,
} from "./client.js";
import {
  isCellRefFormula,
  isSheetFormula,
  prefixReportDateText,
  reportTabTitleForMonth,
  REPORT_TAB_GRID_ROWS,
  transformReportGridToNextMonth,
} from "./monthTransform.js";

export { reportTabTitleForMonth } from "./monthTransform.js";

export async function getSheetIdByTitle(spreadsheetId, title) {
  const sheets = getSheetsApi();
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties(sheetId,title)",
  });
  const found = (meta.data.sheets || []).find(
    (s) => String(s.properties?.title || "") === title
  );
  return found?.properties?.sheetId ?? null;
}

export async function findLatestReportTabTitle(spreadsheetId) {
  const sheets = getSheetsApi();
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties.title",
  });

  const titles = (meta.data.sheets || [])
    .map((s) => String(s.properties?.title || ""))
    .filter((t) => /^ОТЧЕТ 01\.\d{2}\.\d{4}$/.test(t));

  titles.sort((a, b) => {
    const pa = a.match(/ОТЧЕТ 01\.(\d{2})\.(\d{4})/);
    const pb = b.match(/ОТЧЕТ 01\.(\d{2})\.(\d{4})/);
    if (!pa || !pb) return 0;
    const ka = `${pb[2]}${pb[1]}`;
    const kb = `${pa[2]}${pa[1]}`;
    return kb.localeCompare(ka);
  });

  return titles[0] || "";
}

export async function createMonthReportTabFromPrevious({
  spreadsheetId,
  sourceYear,
  sourceMonth,
  targetYear,
  targetMonth,
  sourceTabTitle,
  targetTabTitle,
  replaceExisting = false,
}) {
  const sheets = getSheetsApi();
  if (!sheets) return { ok: false, reason: "SHEETS_DISABLED" };

  const srcTitle =
    sourceTabTitle || reportTabTitleForMonth(sourceYear, sourceMonth);
  let resolvedSourceTitle = srcTitle;
  const tgtTitle =
    targetTabTitle || reportTabTitleForMonth(targetYear, targetMonth);

  let sourceId = await getSheetIdByTitle(spreadsheetId, resolvedSourceTitle);
  if (!sourceId) {
    const fallback = await findLatestReportTabTitle(spreadsheetId);
    if (!fallback) {
      return { ok: false, reason: "SOURCE_TAB_NOT_FOUND", sourceTabTitle: resolvedSourceTitle };
    }
    sourceId = await getSheetIdByTitle(spreadsheetId, fallback);
    resolvedSourceTitle = fallback;
  }

  const existingTargetId = await getSheetIdByTitle(spreadsheetId, tgtTitle);

  if (existingTargetId && !replaceExisting) {
    return {
      ok: true,
      skipped: true,
      reason: "TARGET_ALREADY_EXISTS",
      targetTabTitle: tgtTitle,
    };
  }

  if (existingTargetId && replaceExisting) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ deleteSheet: { sheetId: existingTargetId } }],
      },
    });
  }

  const dup = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          duplicateSheet: {
            sourceSheetId: sourceId,
            insertSheetIndex: 0,
            newSheetName: tgtTitle,
          },
        },
      ],
    },
  });

  const newSheetId =
    dup.data.replies?.[0]?.duplicateSheet?.properties?.sheetId ?? null;

  const gridRange = `${escapeSheetTitle(tgtTitle)}!A1:ZZ${REPORT_TAB_GRID_ROWS}`;
  const formulaRaw = await readSheetFormulas(spreadsheetId, gridRange);
  const formatted = await readSheetValues(spreadsheetId, gridRange);

  const seeded = (formulaRaw || []).map((row, rowIndex) => {
    const line = [...(row || [])];
    const shownRow = formatted?.[rowIndex] || [];
    const width = Math.max(line.length, shownRow.length);
    for (let col = 0; col < width; col += 1) {
      if (isSheetFormula(line[col])) continue;
      const shown = String(shownRow[col] ?? "").trim();
      if (/^\d{2}\.\d{2}(?:-\d{2}\.\d{2})?$/.test(shown)) line[col] = shown;
    }
    return line;
  });

  const parseTitle = resolvedSourceTitle.match(/ОТЧЕТ 01\.(\d{2})\.(\d{4})/);
  const sy = sourceYear || Number(parseTitle?.[2]);
  const sm = sourceMonth || Number(parseTitle?.[1]);

  const transformed = prefixReportDateText(
    transformReportGridToNextMonth(seeded, {
      sourceYear: sy,
      sourceMonth: sm,
      targetYear,
      targetMonth,
    })
  );

  const { updates, clears } = diffReportGridEdits(
    formulaRaw || [],
    transformed,
    tgtTitle
  );

  if (clears.length) await batchClearValues(spreadsheetId, clears);
  if (updates.length) await batchUpdateValues(spreadsheetId, updates);

  return {
    ok: true,
    spreadsheetId,
    sourceTabTitle: resolvedSourceTitle,
    targetTabTitle: tgtTitle,
    newSheetId,
    rows: transformed.length,
    updatedCells: updates.length,
    clearedCells: clears.length,
  };
}

function cellText(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function isBlankInput(value) {
  const text = cellText(value);
  return text === "" || text === "0" || text === "0,00 zł" || text === "0.00";
}

/** Дати й порожні поля продажів. Формули не потрапляють у запис. */
function diffReportGridEdits(originalRows, nextRows, tabTitle) {
  const updates = [];
  const clears = [];
  const rowCount = Math.max(originalRows.length, nextRows.length);

  for (let r = 0; r < rowCount; r += 1) {
    const original = originalRows[r] || [];
    const next = nextRows[r] || [];
    const width = Math.max(original.length, next.length);
    for (let c = 0; c < width; c += 1) {
      if (isSheetFormula(original[c]) || isSheetFormula(next[c])) continue;
      const before = cellText(original[c]);
      const after = cellText(next[c]);
      if (before === after) continue;
      const range = `${escapeSheetTitle(tabTitle)}!${colToA1(c)}${r + 1}`;
      if (isBlankInput(after)) {
        if (!isBlankInput(before)) clears.push(range);
        continue;
      }
      updates.push({ range, values: [[next[c]]] });
    }
  }

  return { updates, clears };
}

/**
 * Раніше затирав формули всього листа. Формули лишаються в таблиці менеджерів.
 */
export async function rewriteMonthReportTabAsPlainValues() {
  return {
    ok: false,
    skipped: true,
    reason: "FORMULAS_OWNED_BY_SHEET",
  };
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

/**
 * Повертає на лист місяця формули СТАЛО / ПРОДАНО / КАССА з шаблону.
 * Числа, які менеджер уже вписав (БЫЛО, 1шт…), не чіпає.
 */
export async function copyMissingCellRefFormulas({
  templateSpreadsheetId,
  templateTabTitle,
  targetSpreadsheetId,
  targetTabTitle,
}) {
  const template = await readSheetFormulas(
    templateSpreadsheetId,
    `${escapeSheetTitle(templateTabTitle)}!A1:ZZ${REPORT_TAB_GRID_ROWS}`
  );
  const target = await readSheetFormulas(
    targetSpreadsheetId,
    `${escapeSheetTitle(targetTabTitle)}!A1:ZZ${REPORT_TAB_GRID_ROWS}`
  );
  if (!template || !target) return { ok: false, reason: "SHEETS_DISABLED" };

  const data = [];
  for (let r = 0; r < template.length; r += 1) {
    const row = template[r] || [];
    for (let c = 0; c < row.length; c += 1) {
      const src = String(row[c] ?? "").trim();
      if (!isCellRefFormula(src)) continue;
      const dst = String(target[r]?.[c] ?? "").trim();
      if (dst === src) continue;
      data.push({
        range: `${escapeSheetTitle(targetTabTitle)}!${colToA1(c)}${r + 1}`,
        values: [[src]],
      });
    }
  }

  const chunkSize = 800;
  for (let i = 0; i < data.length; i += chunkSize) {
    await batchUpdateValues(targetSpreadsheetId, data.slice(i, i + chunkSize));
  }

  return { ok: true, updated: data.length, targetTabTitle };
}

/** @deprecated use createMonthReportTabFromPrevious */
export async function createMonthReportTabFromOctober(opts) {
  return createMonthReportTabFromPrevious({
    spreadsheetId: opts.spreadsheetId,
    sourceYear: 2026,
    sourceMonth: 10,
    targetYear: 2026,
    targetMonth: 11,
    sourceTabTitle: opts.sourceTabTitle,
    targetTabTitle: opts.targetTabTitle,
    replaceExisting: opts.replaceExisting,
  });
}

export const REPORT_SPREADSHEET_IDS = [
  { key: "praga", id: "1iNQFLX0I3VKFcBW2SZwtLz2YkPMVNtrCMoTSq6oStSQ" },
  { key: "r-dmie-cie", id: "1_NriybCDyUR2Aj-VeNj739pTZgK097cmLN_IuYfdPtY" },
  { key: "mokot-w", id: "1iidmQHEUX20sfOxrDzFJfRevhNQYosWyK3J__GlKpKk" },
  { key: "wola", id: "1-LYkb8zbdJcIblnZskVndyhc2PdgtG_JxHcoy2kJj_w" },
  { key: "delivery", id: "1LM_5g43L8unMbW-oN5DFmUf8FvgwHuCzf2m5nxWGeQ0" },
];

export async function createNovember2026ReportTabsAll({ replace = false } = {}) {
  const results = [];

  for (const { key, id } of REPORT_SPREADSHEET_IDS) {
    try {
      const res = await createMonthReportTabFromPrevious({
        spreadsheetId: id,
        sourceYear: 2026,
        sourceMonth: 10,
        targetYear: 2026,
        targetMonth: 11,
        replaceExisting: replace,
      });
      results.push({ key, ...res });
    } catch (e) {
      results.push({
        key,
        ok: false,
        error: String(e?.message || e),
      });
    }
  }

  return results;
}
