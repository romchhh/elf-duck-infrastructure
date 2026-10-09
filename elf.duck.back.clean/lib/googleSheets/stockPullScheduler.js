/**
 * Щоденна синхронізація Google Таблиці → Mongo о 08:00 (Europe/Warsaw), усі склади.
 * Якщо сервер був вимкнений о 08:00 — наздоганяє після старту (того ж дня).
 * Дедуп через DailyStatsDispatch, щоб кілька інстансів / рестарти не дублювали запуск.
 */
import {
  claimDailyStatsDispatch,
  releaseDailyStatsDispatch,
} from "../server/dailyStatsDedupe.js";
import {
  getSheetStockPullCronConfig,
  isGoogleSheetsEnabled,
} from "./config.js";
import {
  pullStockFromSheets,
  pullStockFromSheetsIfChanged,
} from "./stockPull.js";

let cronLastRunAt = 0;
let cronInFlight = false;

/**
 * Викликається щохвилини з intervals.js: раз на stockPullCron.intervalMs
 * читає кожну таблицю (з паузою між ними) і пише в Mongo лише при зміні залишків.
 * intervalMs 0 = вимкнено (config/googleSheets.json).
 */
export async function processSheetStockPullCron() {
  const { intervalMs } = getSheetStockPullCronConfig();
  if (!intervalMs || intervalMs < 60000) return;
  if (!isGoogleSheetsEnabled()) return;

  const now = Date.now();
  if (now - cronLastRunAt < intervalMs) return;
  if (cronInFlight) return;

  cronInFlight = true;
  cronLastRunAt = now;
  try {
    const summary = await pullStockFromSheetsIfChanged({ reason: "cron" });
    console.log(
      `[stockPull] cron fingerprint check:`,
      JSON.stringify({
        ok: summary.ok,
        skipped: summary.totals?.skipped,
        updated: summary.totals?.updated,
        durationMs: summary.durationMs,
      })
    );
  } catch (e) {
    console.error("[stockPull] cron error:", e?.message || e);
    cronLastRunAt = 0;
  } finally {
    cronInFlight = false;
  }
}

/** @deprecated використовуй processSheetStockPullCron з intervals */
export function startSheetStockPullInterval() {
  const { intervalMs } = getSheetStockPullCronConfig();
  if (!intervalMs || intervalMs < 60000) return;
  console.log(
    `[stockPull] cron via intervals every ${Math.round(intervalMs / 1000)}s (fingerprint)`
  );
}

const TIME_ZONE = "Europe/Warsaw";
const RUN_HOUR = Number(process.env.STOCK_PULL_DAILY_HOUR ?? 8);
const RUN_MINUTE = Number(process.env.STOCK_PULL_DAILY_MINUTE ?? 0);
const MAX_ATTEMPTS_PER_DAY = 3;

const attemptsByDay = new Map();
let inFlight = false;

function warsawNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type)?.value || "";
  return {
    dayKey: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: (Number(get("hour")) % 24) * 60 + Number(get("minute")),
  };
}

export async function processDailyStockPull() {
  if (inFlight) return;

  const { dayKey, minutes } = warsawNow();
  if (minutes < RUN_HOUR * 60 + RUN_MINUTE) return;

  const attempts = attemptsByDay.get(dayKey) || 0;
  if (attempts >= MAX_ATTEMPTS_PER_DAY) return;

  const dedupeKey = `stock_pull_sheets:${dayKey}`;

  inFlight = true;
  let claimed = false;
  try {
    claimed = await claimDailyStatsDispatch(dedupeKey, {
      kind: "stock_pull_sheets",
      dayKey,
    });
    if (!claimed) return;

    attemptsByDay.set(dayKey, attempts + 1);
    const summary = await pullStockFromSheets({ reason: "daily-08:00" });

    if (!summary?.ok) {
      // якщо хоч одна таблиця впала — звільняємо слот, наступна хвилина спробує ще (до 3 разів)
      await releaseDailyStatsDispatch(dedupeKey);
    }
  } catch (e) {
    console.error("[stockPull] daily run error:", e?.message || e);
    if (claimed) {
      await releaseDailyStatsDispatch(dedupeKey).catch(() => {});
    }
  } finally {
    inFlight = false;
  }
}
