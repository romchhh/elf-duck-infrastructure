import {
  batchUpdateValues,
  escapeSheetTitle,
  getSheetsApi,
  readSheetValues,
} from "./client.js";
import {
  reportTabTitleForMonth,
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
  const tgtTitle =
    targetTabTitle || reportTabTitleForMonth(targetYear, targetMonth);

  let sourceId = await getSheetIdByTitle(spreadsheetId, srcTitle);
  if (!sourceId) {
    const fallback = await findLatestReportTabTitle(spreadsheetId);
    if (!fallback) {
      return { ok: false, reason: "SOURCE_TAB_NOT_FOUND", sourceTabTitle: srcTitle };
    }
    sourceId = await getSheetIdByTitle(spreadsheetId, fallback);
    srcTitle = fallback;
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

  const raw = await readSheetValues(
    spreadsheetId,
    `${escapeSheetTitle(tgtTitle)}!A1:ZZ650`
  );

  const parseTitle = srcTitle.match(/ОТЧЕТ 01\.(\d{2})\.(\d{4})/);
  const sy = sourceYear || Number(parseTitle?.[2]);
  const sm = sourceMonth || Number(parseTitle?.[1]);

  const transformed = transformReportGridToNextMonth(raw, {
    sourceYear: sy,
    sourceMonth: sm,
    targetYear,
    targetMonth,
  });

  await batchUpdateValues(spreadsheetId, [
    {
      range: `${escapeSheetTitle(tgtTitle)}!A1`,
      values: transformed,
    },
  ]);

  return {
    ok: true,
    spreadsheetId,
    sourceTabTitle: srcTitle,
    targetTabTitle: tgtTitle,
    newSheetId,
    rows: transformed.length,
  };
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
  { key: "praga", id: "1JF6bs99j2GzstlhtDL8y2-5GwPdIPbv9REPyfs5xTUk" },
  { key: "r-dmie-cie", id: "1Ds6xx1d03tAdU8pAy4lAi0LbsyLcuUMoJaxZDn3kTL0" },
  { key: "mokot-w", id: "13YahfNpXkKKg8vN7mhius1jjr0YMRoP5-AsxB2nytKE" },
  { key: "wola", id: "1kLnMHbHwS5q-V6z4xfy6OSAEpe9IwMy3OhzTYMWydZ8" },
  { key: "delivery", id: "1OsKPgUUHJHlGHoCOlfcT3z7-13j-9zCa4my9__rY6TU" },
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
