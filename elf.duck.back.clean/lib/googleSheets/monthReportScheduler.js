import {
  claimDailyStatsDispatch,
  isDailyStatsDispatchRecorded,
} from "../server/dailyStatsDedupe.js";
import { getWarsawDayKey } from "../server/helpers/chunk08.js";
import { isGoogleSheetsEnabled } from "./config.js";
import {
  createMonthReportTabFromPrevious,
  REPORT_SPREADSHEET_IDS,
} from "./createMonthReportTab.js";
import { lastDayOfMonth, reportTabTitleForMonth } from "./monthTransform.js";

function parseDayKey(dayKey) {
  const m = String(dayKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

function nextCalendarMonth(year, month) {
  if (month >= 12) return { year: year + 1, month: 1 };
  return { year, month: month + 1 };
}

/** Останні 3 дні місяця (Europe/Warsaw). */
export function isEndOfMonthWindow(dayKey) {
  const p = parseDayKey(dayKey);
  if (!p) return false;
  const last = lastDayOfMonth(p.year, p.month);
  return p.day >= last - 2;
}

/**
 * Створює лист «ОТЧЕТ 01.{nextMonth}.{year}» у всіх таблицях (один раз на місяць).
 * Викликається з processDailyPointStats.
 */
export async function processEnsureNextMonthReportTabs(now = new Date()) {
  if (!isGoogleSheetsEnabled()) {
    return { ok: false, reason: "DISABLED" };
  }

  const dayKey = getWarsawDayKey(now);
  if (!isEndOfMonthWindow(dayKey)) {
    return { ok: true, skipped: "NOT_END_OF_MONTH_WINDOW", dayKey };
  }

  const p = parseDayKey(dayKey);
  const next = nextCalendarMonth(p.year, p.month);
  const dedupeKey = `google_sheet_next_month:${next.year}-${String(next.month).padStart(2, "0")}`;

  if (await isDailyStatsDispatchRecorded(dedupeKey)) {
    return { ok: true, skipped: "ALREADY_DONE", dedupeKey };
  }

  const sourceTabTitle = reportTabTitleForMonth(p.year, p.month);
  const targetTabTitle = reportTabTitleForMonth(next.year, next.month);

  const claimed = await claimDailyStatsDispatch(dedupeKey, {
    kind: "google_sheet_next_month",
    dayKey,
    pointKey: "all",
  });

  if (!claimed) {
    return { ok: true, skipped: "CLAIM_LOST", dedupeKey };
  }

  const results = [];

  for (const { key, id } of REPORT_SPREADSHEET_IDS) {
    try {
      const res = await createMonthReportTabFromPrevious({
        spreadsheetId: id,
        sourceYear: p.year,
        sourceMonth: p.month,
        targetYear: next.year,
        targetMonth: next.month,
        sourceTabTitle,
        targetTabTitle,
        replaceExisting: false,
      });
      results.push({ key, ...res });
    } catch (e) {
      results.push({ key, ok: false, error: String(e?.message || e) });
    }
  }

  const failed = results.filter((r) => !r.ok && !r.skipped);

  console.log(
    "[GOOGLE SHEET][NEXT MONTH TABS]",
    JSON.stringify(
      {
        dayKey,
        sourceTabTitle,
        targetTabTitle,
        created: results.filter((r) => r.ok && !r.skipped).length,
        skipped: results.filter((r) => r.skipped).length,
        failed: failed.length,
      },
      null,
      2
    )
  );

  if (failed.length) {
    console.error(
      "[GOOGLE SHEET][NEXT MONTH TABS] failures:",
      failed
    );
  }

  return {
    ok: failed.length === 0,
    dedupeKey,
    sourceTabTitle,
    targetTabTitle,
    results,
  };
}
