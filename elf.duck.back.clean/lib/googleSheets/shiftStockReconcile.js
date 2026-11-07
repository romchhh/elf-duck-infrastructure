import {
  ASSORTMENT_SHEET_TITLE,
  isGoogleSheetsEnabled,
  isOrderAssortmentSyncDisabledForPointKey,
  resolveSpreadsheetIdForPointKey,
} from "./config.js";
import { readSheetValues } from "./client.js";
import {
  findDayBlock,
  listDayBlockModelRowIndexes,
  loadMonthlyReport,
  reportTabTitleForDayKey,
  warsawDayKeyToReportHeader,
} from "./dailyReportGrid.js";
import {
  listAssortmentModelStock,
  loadAssortmentGrid,
  readStrictSheetQty,
} from "./assortmentGrid.js";
import { normalizeSheetModelName, toReportModelLabel } from "./normalize.js";

const DAY_BLOCK_WIDTH = 11;

/** Ключ звірки. MERRY MI і MERRY MI 30K лишаються різними, якщо на листі є обидва. */
export function reconcileModelKey(value) {
  const raw = String(value || "")
    .toUpperCase()
    .replace(/🦆/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (/\bMERRY\s+MI\s*(30\s*K|30000)\b/.test(raw)) return "MERRY MI 30K";
  return normalizeSheetModelName(value);
}

function yamiGeneric(key) {
  return key === "YAMI";
}

function yamiTier(key) {
  return key === "YAMI 5%" || key === "YAMI 7%";
}

/**
 * 2 — той самий підпис (LIQ ETHEREUM = ETHEREUM, LIQ YAMI 7% = YAMI 7%, LIQ OXVA = OXVA).
 * 1 — запасний збіг, лише якщо точного блоку немає: YAMI 30ML ↔ YAMI 5%/7%, MERRY MI ↔ MERRY MI 30K.
 * YAMI 5% і YAMI 7% між собою не збігаються.
 */
function exactKeys(value) {
  const key = reconcileModelKey(value);
  const keys = new Set();
  if (!key) return keys;
  keys.add(key);
  if (key !== "MERRY MI 30K") {
    const report = normalizeSheetModelName(toReportModelLabel(key));
    if (report) keys.add(report);
  }
  return keys;
}

export function sheetModelMatchRank(left, right) {
  const a = reconcileModelKey(left);
  const b = reconcileModelKey(right);
  if (!a || !b) return 0;
  const leftKeys = exactKeys(left);
  for (const key of exactKeys(right)) {
    if (leftKeys.has(key)) return 2;
  }
  if ((yamiGeneric(a) && yamiTier(b)) || (yamiTier(a) && yamiGeneric(b))) return 1;
  if (
    (a === "MERRY MI" && b === "MERRY MI 30K") ||
    (a === "MERRY MI 30K" && b === "MERRY MI")
  ) {
    return 1;
  }
  return 0;
}

export function sameSheetModel(left, right) {
  return sheetModelMatchRank(left, right) > 0;
}

function bestModelHits(name, candidates) {
  let best = 0;
  const hits = [];
  for (const item of candidates || []) {
    const rank = sheetModelMatchRank(item?.name, name);
    if (!rank) continue;
    if (rank > best) {
      best = rank;
      hits.length = 0;
      hits.push(item);
    } else if (rank === best) {
      hits.push(item);
    }
  }
  return hits;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function findDayColumnOffset(header, blockStart, wantedLabel) {
  for (let offset = 0; offset < DAY_BLOCK_WIDTH; offset += 1) {
    const label = String(header[blockStart + offset] || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "");
    if (label === wantedLabel) return offset;
  }
  return -1;
}

function resolveReportModelDayStockQty(rows, rowIndex, block, header) {
  const staloOffset = findDayColumnOffset(header, block.blockStart, "СТАЛО");
  if (staloOffset < 0) {
    return {
      ok: false,
      qty: 0,
      reason: "не удалось прочитать количество в колонке «Стало».",
    };
  }

  const byloOffset = findDayColumnOffset(header, block.blockStart, "БЫЛО");
  const prodanoOffset = findDayColumnOffset(header, block.blockStart, "ПРОДАНО");

  const staloParsed = readStrictSheetQty(
    rows[rowIndex]?.[block.blockStart + staloOffset]
  );
  const byloParsed =
    byloOffset >= 0
      ? readStrictSheetQty(rows[rowIndex]?.[block.blockStart + byloOffset])
      : { ok: false };
  const prodanoParsed =
    prodanoOffset >= 0
      ? readStrictSheetQty(rows[rowIndex]?.[block.blockStart + prodanoOffset])
      : { ok: false };

  if (staloParsed.ok) {
    let qty = staloParsed.qty;
    if (
      byloParsed.ok &&
      prodanoParsed.ok &&
      prodanoParsed.qty > 0 &&
      qty === byloParsed.qty
    ) {
      const computed = byloParsed.qty - prodanoParsed.qty;
      if (computed !== qty) {
        qty = computed;
      }
    }
    return { ok: true, qty, reason: "" };
  }

  if (byloParsed.ok && prodanoParsed.ok && prodanoParsed.qty > 0) {
    return {
      ok: true,
      qty: byloParsed.qty - prodanoParsed.qty,
      reason: "",
    };
  }

  return {
    ok: false,
    qty: 0,
    reason: "не удалось прочитать количество в колонке «Стало».",
  };
}

export function listReportDayModelStock(rows, dayKey) {
  const dayHeader = warsawDayKeyToReportHeader(dayKey);
  if (!dayHeader) {
    return {
      ok: false,
      reason: "Некорректная дата смены.",
      models: [],
      dayHeader: "",
    };
  }

  const block = findDayBlock(rows, dayHeader, { requireStalo: true });
  if (!block) {
    return {
      ok: false,
      reason: `Отчёт за ${dayHeader} отсутствует.`,
      models: [],
      dayHeader,
    };
  }

  const header = rows[block.headerRow] || [];
  const staloOffset = findDayColumnOffset(header, block.blockStart, "СТАЛО");

  if (staloOffset < 0) {
    return {
      ok: false,
      reason: `В отчёте за ${dayHeader} не найдена колонка «Стало».`,
      models: [],
      dayHeader,
    };
  }

  const models = [];
  for (const rowIndex of listDayBlockModelRowIndexes(rows, block)) {
    const name = String(rows[rowIndex]?.[block.blockStart] || "").trim();
    if (!name) continue;
    const parsed = resolveReportModelDayStockQty(
      rows,
      rowIndex,
      block,
      header
    );
    models.push({
      name,
      ok: parsed.ok,
      qty: parsed.qty,
      reason: parsed.ok
        ? ""
        : parsed.reason ||
          "не удалось прочитать количество в колонке «Стало».",
    });
  }

  if (!models.length) {
    return {
      ok: false,
      reason: `В отчёте за ${dayHeader} нет строк моделей.`,
      models: [],
      dayHeader,
    };
  }

  return { ok: true, dayHeader, models };
}

export function compareShiftStock({ reportModels, assortmentModels }) {
  const mismatches = [];
  const errors = [];
  const usedAssortment = new Set();

  const reportNames = new Map();
  for (const model of reportModels || []) {
    const key = String(model?.name || "").trim();
    if (!key) continue;
    const prev = reportNames.get(key) || [];
    prev.push(model);
    reportNames.set(key, prev);
  }

  /** @type {Map<object, { assortment: object, reports: object[] }>} */
  const groups = new Map();

  for (const [name, rows] of reportNames) {
    if (rows.length > 1) {
      errors.push({
        model: name,
        reason: "в отчёте несколько строк этой модели.",
      });
      continue;
    }

    const report = rows[0];
    const hits = bestModelHits(name, assortmentModels);

    if (hits.length === 0) {
      errors.push({
        model: name,
        reason: "модель не найдена во вкладке «Ассортимент».",
      });
      continue;
    }

    if (hits.length > 1) {
      errors.push({
        model: name,
        reason: "во вкладке «Ассортимент» несколько блоков этой модели.",
      });
      for (const hit of hits) usedAssortment.add(hit);
      continue;
    }

    const assortment = hits[0];
    usedAssortment.add(assortment);
    if (!groups.has(assortment)) {
      groups.set(assortment, { assortment, reports: [] });
    }
    groups.get(assortment).reports.push(report);
  }

  for (const { assortment, reports } of groups.values()) {
    const displayName =
      reports.length === 1
        ? String(reports[0]?.name || "").trim()
        : reports.map((row) => String(row?.name || "").trim()).filter(Boolean).join(" + ");

    for (const report of reports) {
      if (!report.ok) {
        errors.push({
          model: String(report?.name || displayName).trim(),
          reason: report.reason,
        });
      }
    }
    if (reports.some((report) => !report.ok)) continue;

    if (!assortment.ok) {
      errors.push({
        model: displayName,
        reason:
          assortment.reason ||
          "не удалось прочитать количество во вкладке «Ассортимент».",
      });
      continue;
    }

    const reportQty = reports.reduce(
      (sum, report) => sum + Number(report.qty || 0),
      0
    );
    const assortmentQty = Number(assortment.qty || 0);
    if (reportQty !== assortmentQty) {
      mismatches.push({
        name: displayName,
        reportQty,
        assortmentQty,
      });
    }
  }

  for (const item of assortmentModels || []) {
    if (usedAssortment.has(item)) continue;
    const inReport = (reportModels || []).some((model) => {
      const rank = sheetModelMatchRank(model?.name, item?.name);
      if (!rank) return false;
      if (rank === 2) return true;
      const exactElsewhere = (assortmentModels || []).some(
        (other) => sheetModelMatchRank(other?.name, model?.name) === 2
      );
      return !exactElsewhere;
    });
    if (inReport) continue;
    errors.push({
      model: String(item?.name || "").trim(),
      reason: "модель не найдена во вкладке «Отчёт».",
    });
  }

  return { mismatches, errors };
}

export function formatShiftStockReconcileMessage({
  dateLabel,
  mismatches = [],
  errors = [],
}) {
  const blocks = [];

  if (mismatches.length) {
    const lines = [`⚠️ Расхождения остатков за ${dateLabel}`];
    mismatches.forEach((row, index) => {
      if (index > 0) lines.push("");
      const diff = Number(row.assortmentQty) - Number(row.reportQty);
      const direction = diff > 0 ? "больше" : "меньше";
      lines.push(
        `▫️${escapeHtml(row.name)}:`,
        `• Отчёт — ${row.reportQty} шт.`,
        `• Ассортимент — ${row.assortmentQty} шт.`,
        `‼️ Результат: в ассортименте на ${Math.abs(diff)} шт. ${direction}. Проверить!!!`
      );
    });
    blocks.push(lines.join("\n"));
  }

  if (errors.length) {
    const lines = [
      mismatches.length
        ? "⚠️ Ошибки проверки"
        : `⚠️ Ошибка сверки остатков за ${dateLabel}`,
    ];
    for (const error of errors) {
      const model = String(error?.model || "").trim();
      const reason = String(error?.reason || "не удалось выполнить сверку.").trim();
      lines.push(model ? `▫️${escapeHtml(model)}: ${escapeHtml(reason)}` : escapeHtml(reason));
    }
    blocks.push(lines.join("\n"));
  }

  return blocks.join("\n\n").trim();
}

export function buildShiftStockReconcile({ reportRows, assortmentRows, dayKey }) {
  const report = listReportDayModelStock(reportRows, dayKey);
  if (!report.ok) {
    return {
      dateLabel: report.dayHeader || warsawDayKeyToReportHeader(dayKey),
      mismatches: [],
      errors: [{ model: "", reason: report.reason }],
      message: formatShiftStockReconcileMessage({
        dateLabel: report.dayHeader || warsawDayKeyToReportHeader(dayKey),
        errors: [{ model: "", reason: report.reason }],
      }),
    };
  }

  let assortmentModels = [];
  if (!assortmentRows) {
    return {
      dateLabel: report.dayHeader,
      mismatches: [],
      errors: [
        {
          model: "",
          reason: `Не удалось прочитать вкладку «${ASSORTMENT_SHEET_TITLE}».`,
        },
      ],
      message: formatShiftStockReconcileMessage({
        dateLabel: report.dayHeader,
        errors: [
          {
            model: "",
            reason: `Не удалось прочитать вкладку «${ASSORTMENT_SHEET_TITLE}».`,
          },
        ],
      }),
    };
  }

  assortmentModels = listAssortmentModelStock(assortmentRows);
  const compared = compareShiftStock({
    reportModels: report.models,
    assortmentModels,
  });
  const message = formatShiftStockReconcileMessage({
    dateLabel: report.dayHeader,
    ...compared,
  });

  return {
    dateLabel: report.dayHeader,
    ...compared,
    message,
  };
}

const TELEGRAM_TEXT_LIMIT = 3900;

/** Telegram rejects a message longer than 4096 characters. */
export function splitShiftStockMessages(message) {
  const text = String(message || "").trim();
  if (!text) return [];
  if (text.length <= TELEGRAM_TEXT_LIMIT) return [text];

  const chunks = [];
  let current = "";

  for (const line of text.split("\n")) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length <= TELEGRAM_TEXT_LIMIT) {
      current = next;
      continue;
    }

    if (current) chunks.push(current);
    current = line;

    while (current.length > TELEGRAM_TEXT_LIMIT) {
      chunks.push(current.slice(0, TELEGRAM_TEXT_LIMIT));
      current = current.slice(TELEGRAM_TEXT_LIMIT);
    }
  }

  if (current) chunks.push(current);

  return chunks.map((chunk, index) =>
    index === 0 || chunk.startsWith("⚠️")
      ? chunk
      : `⚠️ Продолжение сверки\n\n${chunk}`
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function assortmentWritesSettled(point) {
  const Order = (await import("../../models/Order.js")).default;
  const inProgress = await Order.countDocuments({
    "googleSheetSync.syncInProgress": true,
  });
  if (inProgress > 0) return false;

  const pointKey = String(point?.key || "")
    .trim()
    .toLowerCase()
    .replace(/,+$/, "");
  if (isOrderAssortmentSyncDisabledForPointKey(pointKey)) return true;

  const { getOrderPointMatch } = await import("../server/helpers/chunk08.js");
  const since = new Date(Date.now() - 2 * 60 * 1000);
  const recentOpen = await Order.countDocuments({
    ...getOrderPointMatch(point),
    status: { $in: ["completed", "done", "shipped"] },
    $or: [{ completedAt: { $gte: since } }, { shippedAt: { $gte: since } }],
    $and: [
      {
        $or: [
          { "googleSheetSync.appliedAt": null },
          { "googleSheetSync.appliedAt": { $exists: false } },
        ],
      },
      { "googleSheetSync.assortmentSyncDisabled": { $ne: true } },
    ],
  });

  return recentOpen === 0;
}

async function waitForAssortmentWrites(point) {
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    if (await assortmentWritesSettled(point)) return true;
    await sleep(1500);
  }
  return assortmentWritesSettled(point);
}

async function listAssortmentSyncIssuesForShift(point, dayKey) {
  const pointKey = String(point?.key || "")
    .trim()
    .toLowerCase()
    .replace(/,+$/, "");
  if (isOrderAssortmentSyncDisabledForPointKey(pointKey)) {
    return { pending: [], failed: [] };
  }

  const Order = (await import("../../models/Order.js")).default;
  const { getOrderPointMatch } = await import("../server/helpers/chunk08.js");
  const {
    buildStatsOrdersMongoFilter,
    orderBelongsToStatsDay,
  } = await import("../server/helpers/orderStatsDay.js");

  const since = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
  const orders = await Order.find(
    buildStatsOrdersMongoFilter(getOrderPointMatch(point), since),
    {
      orderNo: 1,
      status: 1,
      completedAt: 1,
      shippedAt: 1,
      googleSheetSync: 1,
    }
  ).lean();

  const dayOrders = orders.filter((order) =>
    orderBelongsToStatsDay(order, dayKey)
  );

  const pending = dayOrders.filter(
    (order) =>
      !order?.googleSheetSync?.assortmentSyncDisabled &&
      !order?.googleSheetSync?.appliedAt
  );

  const failed = dayOrders.filter((order) => {
    const err = String(order?.googleSheetSync?.lastError || "").trim();
    return (
      err &&
      !order?.googleSheetSync?.assortmentSyncDisabled &&
      !order?.googleSheetSync?.appliedAt
    );
  });

  return { pending, failed };
}

export function buildAssortmentSyncWarningLines(issues = {}) {
  const lines = [];
  const pending = Array.isArray(issues.pending) ? issues.pending : [];
  const failed = Array.isArray(issues.failed) ? issues.failed : [];

  if (pending.length) {
    const sample = pending
      .slice(0, 6)
      .map((order) => `#${String(order?.orderNo || "").trim()}`)
      .filter(Boolean)
      .join(", ");
    const tail =
      pending.length > 6 ? ` и ещё ${pending.length - 6}` : "";
    lines.push(
      `⚠️ «Ассортимент» не записан по заказам: ${sample}${tail}. Проверьте sync-errors / retry-google-sheets-assortment.`
    );
  }

  if (failed.length) {
    const sample = failed
      .slice(0, 4)
      .map((order) => `#${String(order?.orderNo || "").trim()}`)
      .filter(Boolean)
      .join(", ");
    const tail = failed.length > 4 ? ` и ещё ${failed.length - 4}` : "";
    lines.push(
      `⚠️ Ошибка записи в «Ассортимент» (отчёт мог обновиться): ${sample}${tail}.`
    );
  }

  return lines;
}

/**
 * После смены: «Стало» отчёта за этот день против текущего ассортимента.
 * В канал статистики пишет только расхождения и ошибки. Остатки не меняет.
 */
export async function publishShiftStockReconcile({
  point,
  dayKey,
  dryRun = false,
} = {}) {
  if (!isGoogleSheetsEnabled()) {
    return { ok: true, skipped: true, reason: "SHEETS_DISABLED" };
  }

  const pointKey = String(point?.key || "")
    .trim()
    .toLowerCase()
    .replace(/,+$/, "");
  const spreadsheetId = resolveSpreadsheetIdForPointKey(
    pointKey === "wola-inpost" ? "wola" : pointKey
  );
  if (!spreadsheetId) {
    return { ok: true, skipped: true, reason: "NO_SPREADSHEET" };
  }

  const { getPointStatsChatId } = await import("../server/helpers/chunk08.js");
  const chatId = getPointStatsChatId(point);
  if (!chatId) {
    return { ok: true, skipped: true, reason: "NO_STATS_CHAT" };
  }

  const dedupeKey = `stock_reconcile:${spreadsheetId}:${dayKey}:${chatId}`;
  const {
    claimDailyStatsDispatch,
    isDailyStatsDispatchRecorded,
    releaseDailyStatsDispatch,
  } = await import("../server/dailyStatsDedupe.js");

  if (!dryRun && (await isDailyStatsDispatchRecorded(dedupeKey))) {
    return { ok: true, skipped: true, reason: "ALREADY_CHECKED" };
  }

  if (!dryRun) {
    await waitForAssortmentWrites(point);
  }
  const syncIssues = dryRun
    ? { pending: [], failed: [] }
    : await listAssortmentSyncIssuesForShift(point, dayKey);
  const syncWarnings = buildAssortmentSyncWarningLines(syncIssues);

  const tabTitle = reportTabTitleForDayKey(dayKey);
  let reportRows;
  let assortmentRows;
  try {
    [reportRows, assortmentRows] = await Promise.all([
      loadMonthlyReport(spreadsheetId, tabTitle),
      loadAssortmentGrid(spreadsheetId),
    ]);
  } catch (error) {
    console.error("[STOCK RECONCILE][READ]", pointKey, error?.message || error);
    return { ok: false, reason: "READ_FAILED" };
  }

  if (!reportRows) {
    return { ok: false, reason: "SHEETS_DISABLED" };
  }

  if (!assortmentRows) {
    assortmentRows = null;
  } else if (!assortmentRows.length) {
    try {
      assortmentRows = await readSheetValues(
        spreadsheetId,
        `'${ASSORTMENT_SHEET_TITLE}'!A1:ZZ200`
      );
    } catch {
      assortmentRows = null;
    }
  }

  const result = buildShiftStockReconcile({
    reportRows,
    assortmentRows,
    dayKey,
  });

  const outboundMessage = [result.message, ...syncWarnings]
    .filter(Boolean)
    .join("\n\n");

  const hasNews =
    result.mismatches.length > 0 ||
    result.errors.length > 0 ||
    syncWarnings.length > 0;

  if (!hasNews) {
    if (!dryRun) {
      await claimDailyStatsDispatch(dedupeKey, {
        kind: "stock_reconcile",
        dayKey,
        pointKey,
      });
    }
    return {
      ok: true,
      matched: true,
      mismatches: 0,
      errors: 0,
    };
  }

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      message: outboundMessage,
      mismatches: result.mismatches.length,
      errors: result.errors.length,
      syncWarnings: syncWarnings.length,
    };
  }

  const claimed = await claimDailyStatsDispatch(dedupeKey, {
    kind: "stock_reconcile",
    dayKey,
    pointKey,
  });
  if (!claimed) {
    return { ok: true, skipped: true, reason: "ALREADY_CHECKED" };
  }

  let sentCount = 0;
  try {
    const { bot } = await import("../server/botRegistry.js");
    if (!bot?.telegram) {
      await releaseDailyStatsDispatch(dedupeKey);
      return { ok: false, reason: "NO_BOT" };
    }
    const parts = splitShiftStockMessages(outboundMessage);
    for (const part of parts) {
      await bot.telegram.sendMessage(chatId, part, {
        parse_mode: "HTML",
        disable_web_page_preview: true,
      });
      sentCount += 1;
    }
    return {
      ok: true,
      sent: true,
      mismatches: result.mismatches.length,
      errors: result.errors.length,
    };
  } catch (error) {
    if (sentCount === 0) await releaseDailyStatsDispatch(dedupeKey);
    console.error("[STOCK RECONCILE][SEND]", pointKey, error?.message || error);
    return { ok: false, reason: "SEND_FAILED" };
  }
}
