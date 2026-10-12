import SheetDayReportBotSnapshot from "../../models/SheetDayReportBotSnapshot.js";

function tierMap(doc) {
  if (!doc?.tiers) return new Map();
  if (doc.tiers instanceof Map) return doc.tiers;
  return new Map(Object.entries(doc.tiers || {}));
}

async function loadSnapshot(spreadsheetId, dayKey) {
  const sid = String(spreadsheetId || "").trim();
  const dk = String(dayKey || "").trim();
  if (!sid || !dk) return null;

  return SheetDayReportBotSnapshot.findOne({ spreadsheetId: sid, dayKey: dk });
}

async function saveSnapshot(doc, tiers) {
  doc.tiers = tiers;
  doc.markModified("tiers");
  await doc.save();
}

/**
 * @returns {{ delta: number, nextBotSynced: number }}
 */
export async function computeBotSheetDelta({
  spreadsheetId,
  dayKey,
  snapshotKey,
  mongoTotalQty,
  /** Поточне значення в Google Sheet (для першого sync після деплою — без подвійного нарахування). */
  prevCellQty = null,
  persist = true,
}) {
  const sid = String(spreadsheetId || "").trim();
  const dk = String(dayKey || "").trim();
  const key = String(snapshotKey || "").trim();
  const mongoTotal = Math.max(0, Number(mongoTotalQty || 0));

  if (!sid || !dk || !key) {
    return { delta: mongoTotal, nextBotSynced: mongoTotal, bootstrapped: false };
  }

  let doc = await loadSnapshot(sid, dk);
  if (!doc) {
    doc = new SheetDayReportBotSnapshot({ spreadsheetId: sid, dayKey: dk, tiers: {} });
  }

  const tiers = tierMap(doc);
  const hadKey = tiers.has(key);
  const lastSynced = Math.max(0, Number(tiers.get(key) || 0));

  let delta;
  let bootstrapped = false;

  if (!hadKey && prevCellQty !== null && prevCellQty !== undefined) {
    const prevCell = Math.max(0, Number(prevCellQty || 0));
    bootstrapped = true;
    const prevRounded = Number(prevCell.toFixed(2));
    const mongoRounded = Number(mongoTotal.toFixed(2));
    if (prevRounded >= mongoRounded) {
      // У таблиці вже є бот + ручні правки — лише фіксуємо знімок, клітинку не чіпаємо.
      delta = 0;
    } else {
      // Ручні / часткові: додаємо повний обсяг продажів з Mongo поверх поточного значення.
      delta = mongoTotal;
    }
  } else {
    delta = mongoTotal - lastSynced;
    // Per-order вже оновив sheet, але знімок відстає (перший день після деплою).
    if (prevCellQty !== null && prevCellQty !== undefined) {
      const prevRounded = Number(Math.max(0, Number(prevCellQty || 0)).toFixed(2));
      const mongoRounded = Number(mongoTotal.toFixed(2));
      if (prevRounded >= mongoRounded && lastSynced < mongoRounded) {
        delta = 0;
      }
    }
  }

  delta = Math.max(0, Number(delta || 0));

  const nextBotSynced = mongoTotal;

  if (persist) {
    tiers.set(key, nextBotSynced);
    await saveSnapshot(doc, tiers);
  }

  return { delta, nextBotSynced, lastSynced, bootstrapped };
}

/** Після per-order +N у таблицю — збільшуємо «вже синхронізовано з Mongo». */
export async function recordPerOrderBotSheetIncrement({
  spreadsheetId,
  dayKey,
  snapshotKey,
  soldQty,
}) {
  const sid = String(spreadsheetId || "").trim();
  const dk = String(dayKey || "").trim();
  const key = String(snapshotKey || "").trim();
  const qty = Math.max(0, Number(soldQty || 0));

  if (!sid || !dk || !key || qty <= 0) return;

  let doc = await loadSnapshot(sid, dk);
  if (!doc) {
    doc = new SheetDayReportBotSnapshot({ spreadsheetId: sid, dayKey: dk, tiers: {} });
  }

  const tiers = tierMap(doc);
  const prev = Math.max(0, Number(tiers.get(key) || 0));
  tiers.set(key, prev + qty);
  await saveSnapshot(doc, tiers);
}

export function dayModelTierSnapshotKey(reportModelLabel, tierKey) {
  return `day:${String(reportModelLabel || "").trim()}:${String(tierKey || "").trim()}`;
}

export function monthModelTierSnapshotKey(reportModelLabel, tierKey) {
  return `month:${String(reportModelLabel || "").trim()}:${String(tierKey || "").trim()}`;
}

export function dayKassaSnapshotKey(kind) {
  return `day:kassa:${String(kind || "").trim()}`;
}

export function monthItogoSnapshotKey(kind) {
  return `month:itogo:${String(kind || "").trim()}`;
}
