/**
 * Ручний запуск того ж, що cron у processDailyPointStats (без вікна «кінець місяця»).
 *
 * node scripts/ensure-next-month-report-tabs.mjs
 * node scripts/ensure-next-month-report-tabs.mjs --force-window   # ігнорувати вікно 3 дні
 */
import {
  isEndOfMonthWindow,
  processEnsureNextMonthReportTabs,
} from "../lib/googleSheets/monthReportScheduler.js";
import { getWarsawDayKey } from "../lib/server/helpers/chunk08.js";

const forceWindow = process.argv.includes("--force-window");
const now = new Date();
const dayKey = getWarsawDayKey(now);

if (!forceWindow && !isEndOfMonthWindow(dayKey)) {
  console.log(
    `Not in end-of-month window (last 3 days). dayKey=${dayKey}. Use --force-window to run anyway.`
  );
  process.exit(0);
}

const res = await processEnsureNextMonthReportTabs(now);
console.log(JSON.stringify(res, null, 2));
process.exit(res.ok ? 0 : 1);
