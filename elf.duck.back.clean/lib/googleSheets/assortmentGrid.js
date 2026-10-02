import {
  ASSORTMENT_SHEET_TITLE,
  SYNC_ERRORS_SHEET_TITLE,
} from "./config.js";
import {
  appendSheetRow,
  batchUpdateValues,
  escapeSheetTitle,
  readSheetValues,
} from "./client.js";
import {
  compactSheetFlavor,
  flavorMatchesWanted,
  headerMatchesWanted,
  normalizeSheetModelName,
  toAssortmentHeaderCandidates,
} from "./normalize.js";

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

function parseQty(cell) {
  const n = Number(String(cell || "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

export function findAssortmentModelBlocks(rows) {
  const blocks = [];

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] || [];

    for (let c = 0; c < row.length; c += 2) {
      const header = String(row[c] || "").trim();
      if (!header) continue;
      if (/^кол-во$/i.test(header)) continue;
      if (/^total\b/i.test(header)) continue;
      if (/оборот|итого/i.test(header)) continue;

      blocks.push({
        headerRow: r,
        flavorCol: c,
        qtyCol: c + 1,
        header,
      });
    }
  }

  return blocks;
}

export function findAssortmentBlockForModel(rows, modelName, productKey = "") {
  const candidates = toAssortmentHeaderCandidates(modelName, productKey).map(
    (x) => normalizeSheetModelName(x)
  );
  const wanted = new Set(candidates);
  const blocks = findAssortmentModelBlocks(rows);

  for (const candidate of candidates) {
    for (const block of blocks) {
      if (normalizeSheetModelName(block.header) === candidate) {
        return block;
      }
    }
  }

  for (const block of blocks) {
    if (headerMatchesWanted(block.header, wanted)) {
      return block;
    }
  }

  return null;
}

export function findAssortmentFlavorRow(rows, block, flavorLabel) {
  const wanted = compactSheetFlavor(flavorLabel);
  const startRow = block.headerRow + 1;

  for (let r = startRow; r < rows.length; r++) {
    const row = rows[r] || [];
    const flavorCell = row[block.flavorCol];
    if (!String(flavorCell || "").trim()) {
      // stop at empty run only if we already passed some flavors
      if (r > startRow + 1 && !row.some((c) => String(c || "").trim())) {
        break;
      }
      continue;
    }

    if (/^total\b/i.test(String(flavorCell))) break;

    if (flavorMatchesWanted(flavorCell, wanted)) {
      return r;
    }
  }

  return -1;
}

export async function loadAssortmentGrid(spreadsheetId) {
  const range = `${escapeSheetTitle(ASSORTMENT_SHEET_TITLE)}!A1:ZZ200`;
  return readSheetValues(spreadsheetId, range);
}

export async function applyAssortmentDelta({
  spreadsheetId,
  pointLabel,
  dayKey,
  modelName,
  productKey,
  flavorLabel,
  deltaQty,
  dryRun = false,
}) {
  const rows = await loadAssortmentGrid(spreadsheetId);
  if (!rows) {
    return { ok: false, reason: "SHEETS_DISABLED" };
  }

  const block = findAssortmentBlockForModel(rows, modelName, productKey);
  if (!block) {
    await logSyncError(spreadsheetId, {
      pointLabel,
      dayKey,
      reason: "MODEL_BLOCK_NOT_FOUND",
      modelName,
      normalizedModel: normalizeSheetModelName(modelName),
      flavorLabel,
      normalizedFlavor: compactSheetFlavor(flavorLabel),
    });

    return { ok: false, reason: "MODEL_BLOCK_NOT_FOUND" };
  }

  const flavorRow = findAssortmentFlavorRow(rows, block, flavorLabel);
  if (flavorRow < 0) {
    await logSyncError(spreadsheetId, {
      pointLabel,
      dayKey,
      reason: "FLAVOR_ROW_NOT_FOUND",
      modelName,
      normalizedModel: normalizeSheetModelName(modelName),
      flavorLabel,
      normalizedFlavor: compactSheetFlavor(flavorLabel),
    });

    return { ok: false, reason: "FLAVOR_ROW_NOT_FOUND" };
  }

  const currentQty = parseQty(rows[flavorRow]?.[block.qtyCol]);
  const nextQty = Math.max(0, currentQty + deltaQty);

  const a1 = `${escapeSheetTitle(ASSORTMENT_SHEET_TITLE)}!${colToA1(block.qtyCol)}${flavorRow + 1}`;

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      a1,
      currentQty,
      nextQty,
      header: block.header,
    };
  }

  await batchUpdateValues(spreadsheetId, [
    {
      range: a1,
      values: [[nextQty]],
    },
  ]);

  return {
    ok: true,
    a1,
    currentQty,
    nextQty,
    header: block.header,
  };
}

async function logSyncError(spreadsheetId, payload) {
  try {
    const now = new Date();
    const createdAt = now.toLocaleDateString("uk-UA");

    await appendSheetRow(spreadsheetId, SYNC_ERRORS_SHEET_TITLE, [
      createdAt,
      payload.pointLabel || "",
      payload.dayKey || "",
      payload.reason || "",
      payload.modelName || "",
      payload.normalizedModel || "",
      payload.flavorLabel || "",
      payload.normalizedFlavor || "",
    ]);
  } catch (e) {
    console.error("[googleSheets] SYNC_ERRORS append failed:", e);
  }
}
