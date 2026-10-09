import {
  ASSORTMENT_SHEET_TITLE,
  SYNC_ERRORS_SHEET_TITLE,
} from "./config.js";
import {
  appendSheetRow,
  batchUpdateSpreadsheet,
  batchUpdateValues,
  escapeSheetTitle,
  getSpreadsheetMeta,
} from "./client.js";

const ensuredSpreadsheets = new Set();

function buildHint(payload) {
  const parts = [];
  if (payload.hint) parts.push(String(payload.hint).trim());
  if (payload.orderNo) parts.push(`замовлення ${payload.orderNo}`);
  if (payload.orderId) parts.push(`orderId ${payload.orderId}`);
  if (payload.a1) parts.push(`клітинка ${payload.a1}`);
  if (payload.deltaQty != null && payload.deltaQty !== "") {
    parts.push(`Δ ${payload.deltaQty}`);
  }
  if (payload.currentQty != null && payload.nextQty != null) {
    parts.push(`${payload.currentQty} → ${payload.nextQty}`);
  }
  if (payload.errorMessage) {
    parts.push(`помилка: ${String(payload.errorMessage).slice(0, 400)}`);
  }
  if (Array.isArray(payload.triedLabels) && payload.triedLabels.length) {
    parts.push(`кандидати: ${payload.triedLabels.join(" | ")}`);
  }
  if (payload.headerCandidates) {
    parts.push(String(payload.headerCandidates));
  }
  return parts.filter(Boolean).join(" · ").slice(0, 1500);
}

async function ensureSyncErrorsSheet(spreadsheetId) {
  if (!spreadsheetId || ensuredSpreadsheets.has(spreadsheetId)) return;

  const meta = await getSpreadsheetMeta(
    spreadsheetId,
    "sheets.properties.title"
  );
  const titles = (meta?.sheets || [])
    .map((s) => String(s?.properties?.title || ""))
    .filter(Boolean);

  if (!titles.includes(SYNC_ERRORS_SHEET_TITLE)) {
    await batchUpdateSpreadsheet(spreadsheetId, [
      {
        addSheet: { properties: { title: SYNC_ERRORS_SHEET_TITLE } },
      },
    ]);
    await batchUpdateValues(spreadsheetId, [
      {
        range: `${escapeSheetTitle(SYNC_ERRORS_SHEET_TITLE)}!A1:J1`,
        values: [
          [
            "Дата",
            "Точка",
            "День",
            "Причина",
            "Модель",
            "Блок / productKey",
            "Смак",
            "Норм. смак",
            "К-сть",
            "Деталі",
          ],
        ],
      },
    ]);
  }

  ensuredSpreadsheets.add(spreadsheetId);
}

/**
 * Запис у лист SYNC_ERRORS таблиці складу (spreadsheetId точки).
 */
export async function logAssortmentSyncError(spreadsheetId, payload = {}) {
  if (!spreadsheetId) return;

  try {
    await ensureSyncErrorsSheet(spreadsheetId);

    const now = new Date();
    const createdAt = now.toLocaleString("uk-UA", { timeZone: "Europe/Warsaw" });

    await appendSheetRow(spreadsheetId, SYNC_ERRORS_SHEET_TITLE, [
      createdAt,
      payload.pointLabel || "",
      payload.dayKey || "",
      payload.reason || "ASSORTMENT_SYNC_ERROR",
      payload.modelName || "",
      payload.normalizedModel || payload.productKey || "",
      payload.flavorLabel || "",
      payload.normalizedFlavor || "",
      payload.qty != null && payload.qty !== "" ? String(payload.qty) : "",
      buildHint(payload),
    ]);
  } catch (e) {
    console.error("[googleSheets] SYNC_ERRORS append failed:", e?.message || e);
  }
}

/** Підсумок невдалого sync замовлення (кожна позиція також логується окремо). */
export async function logOrderAssortmentSyncSummary(spreadsheetId, order, result) {
  if (!spreadsheetId || !result || result.ok) return;

  const failed = (result.results || []).filter(
    (r) => r.assortmentResult && r.assortmentResult.ok === false
  );
  if (!failed.length) return;

  const lines = failed.slice(0, 25).map((row) => {
    const ar = row.assortmentResult || {};
    const pk = row.productKey || ar.productKey || "";
    const fk = row.flavorKey || "";
    return `${pk}/${fk}: ${ar.reason || "FAIL"}${ar.matchedFlavorLabel ? ` (${ar.matchedFlavorLabel})` : ""}`;
  });

  await logAssortmentSyncError(spreadsheetId, {
    pointLabel: result.pointKey || "",
    dayKey: result.dayKey || "",
    reason: result.partial ? "ORDER_ASSORTMENT_PARTIAL" : "ORDER_ASSORTMENT_FAILED",
    modelName: "",
    productKey: String(order?.orderNo || order?._id || ""),
    flavorLabel: `${failed.length} поз.`,
    qty: "",
    orderNo: order?.orderNo,
    orderId: String(order?._id || ""),
    hint: `Не оновлено АССОРТИМЕНТ (${ASSORTMENT_SHEET_TITLE}): ${lines.join("; ")}${failed.length > 25 ? ` …+${failed.length - 25}` : ""}`,
  });
}
