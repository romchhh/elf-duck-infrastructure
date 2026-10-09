import { ASSORTMENT_SHEET_TITLE } from "./config.js";
import { logAssortmentSyncError } from "./syncErrorsLog.js";
import {
  batchUpdateSpreadsheet,
  batchUpdateValues,
  getSpreadsheetMeta,
  escapeSheetTitle,
  readSheetValues,
} from "./client.js";
import {
  compactSheetFlavor,
  flavorMatchTier,
  flavorWordsMatch,
  headerMatchesWanted,
  normalizeSheetModelName,
  getAssortmentFlavorAliasLabels,
  toAssortmentHeaderCandidates,
} from "./normalize.js";

const WEAK_FLAVOR_SLUG_SEGMENTS = new Set([
  "ice",
  "cream",
  "mint",
  "lime",
  "tea",
  "cola",
  "bear",
  "berry",
  "peach",
  "cherry",
  "energy",
  "mojito",
  "menthol",
  "grape",
  "apple",
  "banana",
  "tobacco",
  "raspberry",
  "blueberry",
  "strawberry",
  "watermelon",
  "blackberry",
]);

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

/** Ціле значення клітинки залишку (може бути від’ємним). */
export function parseAssortmentQty(cell) {
  return parseQty(cell);
}

function parseQty(cell) {
  const n = Number(String(cell || "").replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(n)) return 0;
  // Дозволяємо від’ємний залишок на листі (−1, −2…), інакше наступне списання знову «бачить» 0.
  return Math.floor(n);
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

function pickBestAssortmentBlock(rows, hits) {
  if (!hits.length) return null;
  if (hits.length === 1) return hits[0];
  return hits
    .map((block) => ({
      block,
      n: listAssortmentFlavorsInBlock(rows, block).length,
    }))
    .sort((a, b) => b.n - a.n)[0].block;
}

export function findAssortmentBlockForModel(rows, modelName, productKey = "") {
  const candidates = toAssortmentHeaderCandidates(modelName, productKey).map(
    (x) => normalizeSheetModelName(x)
  );
  const wanted = new Set(candidates);
  const blocks = findAssortmentModelBlocks(rows);
  const exactHits = [];

  for (const candidate of candidates) {
    for (const block of blocks) {
      if (normalizeSheetModelName(block.header) === candidate) {
        exactHits.push(block);
      }
    }
  }
  if (exactHits.length) {
    return pickBestAssortmentBlock(rows, exactHits);
  }

  const fuzzyHits = blocks.filter((block) =>
    headerMatchesWanted(block.header, wanted)
  );
  return pickBestAssortmentBlock(rows, fuzzyHits);
}

function flavorSlugToTitleLabel(slug = "") {
  return String(slug || "")
    .split(/[-_/]/)
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase();
      if (lower.length <= 2) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ")
    .trim();
}

/** Labels to try when matching a flavor row (order field variants + slug from flavorKey). */
export function buildAssortmentFlavorSearchLabels(flavor = {}, productKey = "") {
  const candidates = [];
  const push = (v) => {
    const s = String(v || "").trim();
    if (s && !candidates.some((c) => compactSheetFlavor(c) === compactSheetFlavor(s))) {
      candidates.push(s);
    }
  };

  push(flavor?.flavorLabel);
  push(flavor?.label);
  push(flavor?.flavorKey);

  for (const alias of getAssortmentFlavorAliasLabels(productKey, flavor?.flavorKey)) {
    push(alias);
  }

  const fk = String(flavor?.flavorKey || "").trim();
  if (fk) {
    push(flavorSlugToTitleLabel(fk));

    const segments = fk.split(/[-_/]/).filter(Boolean);
    const last = segments[segments.length - 1];
    if (
      last &&
      last.length > 2 &&
      (segments.length === 1 ||
        !WEAK_FLAVOR_SLUG_SEGMENTS.has(last.toLowerCase()))
    ) {
      push(last.replace(/-/g, " "));
      push(flavorSlugToTitleLabel(last));
    }
    push(fk.replace(/[-_]/g, " "));
  }

  return candidates;
}

/** Рядки смаків блоку: { row (0-based), cell }. */
function collectBlockFlavorRows(rows, block) {
  const out = [];
  const startRow = block.headerRow + 1;

  for (let r = startRow; r < rows.length; r++) {
    const row = rows[r] || [];
    const flavorCell = String(row[block.flavorCol] || "").trim();
    if (!flavorCell) {
      // stop at empty run only if we already passed some flavors
      if (r > startRow + 1 && !row.some((c) => String(c || "").trim())) {
        break;
      }
      continue;
    }
    if (/^кол-во$/i.test(flavorCell)) continue;
    if (/^total\b/i.test(flavorCell)) break;
    out.push({ row: r, cell: flavorCell });
  }

  return out;
}

function countAssortmentFlavorMatches(rows, block, flavorLabel) {
  const wanted = compactSheetFlavor(flavorLabel);
  return collectBlockFlavorRows(rows, block).filter(
    (x) => flavorMatchTier(x.cell, wanted) === 1
  ).length;
}

/**
 * Пошук рядка смаку по списку кандидатів (label, alias, slug…).
 * Спочатку точний збіг по БУДЬ-ЯКОМУ кандидату, потім banana/banan, потім підрядок —
 * але лише якщо кандидат у блоці один (ніколи не «перший схожий»).
 */
export function resolveAssortmentFlavorRow(rows, block, labels = []) {
  const entries = collectBlockFlavorRows(rows, block);
  const wantedList = labels
    .map((label) => ({ label, wanted: compactSheetFlavor(label) }))
    .filter((x) => x.wanted);

  for (const tier of [1, 2, 3, 4]) {
    for (const { label, wanted } of wantedList) {
      const hits = entries.filter((e) =>
        tier === 4
          ? flavorMatchTier(e.cell, wanted) === 0 && flavorWordsMatch(e.cell, label)
          : flavorMatchTier(e.cell, wanted) === tier
      );
      if (tier === 1 && hits.length >= 1) {
        return { row: hits[0].row, label, tier, ambiguous: false };
      }
      if (hits.length === 1) {
        return { row: hits[0].row, label, tier, ambiguous: false };
      }
      if (hits.length > 1) {
        return {
          row: -1,
          label,
          tier,
          ambiguous: true,
          candidates: hits.map((h) => h.cell),
        };
      }
    }
  }

  return { row: -1, label: "", tier: 0, ambiguous: false };
}

export function findAssortmentFlavorRow(rows, block, flavorLabel) {
  return resolveAssortmentFlavorRow(rows, block, [flavorLabel]).row;
}

/** Усі рядки смаків у блоці моделі (як у sync). */
export function listAssortmentFlavorsInBlock(rows, block) {
  const flavors = [];
  const startRow = block.headerRow + 1;

  for (let r = startRow; r < rows.length; r++) {
    const row = rows[r] || [];
    const flavorCell = String(row[block.flavorCol] || "").trim();
    if (!flavorCell) {
      if (r > startRow + 1 && !row.some((c) => String(c || "").trim())) {
        break;
      }
      continue;
    }
    if (/^total\b/i.test(flavorCell)) break;
    flavors.push(flavorCell);
  }

  return flavors;
}

/** Дублікати смаків у одному блоці (різні рядки, той самий compactSheetFlavor). */
export function listAssortmentDuplicateFlavorsInBlock(rows, block) {
  const startRow = block.headerRow + 1;
  const groups = new Map();

  for (let r = startRow; r < rows.length; r++) {
    const row = rows[r] || [];
    const flavorCell = String(row[block.flavorCol] || "").trim();
    if (!flavorCell) {
      if (r > startRow + 1 && !row.some((c) => String(c || "").trim())) {
        break;
      }
      continue;
    }
    if (/^total\b/i.test(flavorCell)) break;

    const key = compactSheetFlavor(flavorCell);
    if (!key || key.length < 3 || /^\d+$/.test(key)) continue;
    const list = groups.get(key) || [];
    list.push({ row: r + 1, label: flavorCell });
    groups.set(key, list);
  }

  const duplicates = [];
  for (const [key, entries] of groups) {
    if (entries.length > 1) {
      duplicates.push({ key, entries });
    }
  }
  return duplicates;
}

/** Чи знайде sync рядок для смаку з каталогу (ті самі кандидати, що в orderSync). */
export function matchCatalogFlavorInAssortmentBlock(
  rows,
  block,
  flavor = {},
  productKey = ""
) {
  const labels = buildAssortmentFlavorSearchLabels(
    {
      flavorKey: flavor.flavorKey,
      flavorLabel: flavor.flavorLabel || flavor.label,
      label: flavor.label,
    },
    productKey
  );

  const resolved = resolveAssortmentFlavorRow(rows, block, labels);
  if (resolved.row >= 0) {
    return {
      ok: true,
      matchedLabel: resolved.label,
      sheetLabel: String(rows[resolved.row]?.[block.flavorCol] || "").trim(),
      rowIndex: resolved.row,
      tier: resolved.tier,
    };
  }

  return {
    ok: false,
    triedLabels: labels,
    ambiguous: resolved.ambiguous,
    candidates: resolved.candidates,
  };
}

const negativeHighlightEnsured = new Set();

/**
 * Один раз на таблицю: умовне форматування на АССОРТИМЕНТ (NUMBER_LESS 0, не залежить від локалі) — будь-яке число < 0 (залишок −1, −2…) червоним.
 * Ідемпотентно: якщо правило вже є, нічого не додає.
 */
export async function ensureNegativeStockHighlight(spreadsheetId) {
  if (!spreadsheetId || negativeHighlightEnsured.has(spreadsheetId)) {
    return { ok: true, skipped: true };
  }

  const meta = await getSpreadsheetMeta(
    spreadsheetId,
    "sheets(properties(sheetId,title),conditionalFormats(booleanRule(condition(type,values))))"
  );
  if (!meta) return { ok: false, reason: "SHEETS_DISABLED" };

  const sheet = (meta.sheets || []).find(
    (s) => s?.properties?.title === ASSORTMENT_SHEET_TITLE
  );
  if (!sheet) return { ok: false, reason: "ASSORTMENT_SHEET_NOT_FOUND" };

  const exists = (sheet.conditionalFormats || []).some((rule) => {
    const cond = rule?.booleanRule?.condition;
    return (
      cond?.type === "NUMBER_LESS" &&
      (cond.values || []).some((v) => String(v?.userEnteredValue) === "0")
    );
  });

  if (!exists) {
    await batchUpdateSpreadsheet(spreadsheetId, [
      {
        addConditionalFormatRule: {
          index: 0,
          rule: {
            ranges: [
              {
                sheetId: sheet.properties.sheetId,
                startRowIndex: 0,
                endRowIndex: 200,
                startColumnIndex: 0,
                endColumnIndex: 702,
              },
            ],
            booleanRule: {
              condition: {
                type: "NUMBER_LESS",
                values: [{ userEnteredValue: "0" }],
              },
              format: {
                backgroundColor: { red: 0.92, green: 0.2, blue: 0.2 },
                textFormat: {
                  bold: true,
                  foregroundColor: { red: 1, green: 1, blue: 1 },
                },
              },
            },
          },
        },
      },
    ]);
  }

  negativeHighlightEnsured.add(spreadsheetId);
  return { ok: true, added: !exists };
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
  flavorLabelCandidates = [],
  deltaQty,
  dryRun = false,
  orderNo = "",
  orderId = "",
}) {
  const baseLog = {
    pointLabel,
    dayKey,
    modelName,
    productKey: productKey || "",
    flavorLabel,
    qty: Math.abs(Number(deltaQty || 0)),
    deltaQty,
    orderNo,
    orderId,
  };

  let rows;
  try {
    rows = await loadAssortmentGrid(spreadsheetId);
  } catch (e) {
    await logAssortmentSyncError(spreadsheetId, {
      ...baseLog,
      reason: "ASSORTMENT_READ_FAILED",
      errorMessage: e?.message || e,
      hint: "Не вдалося прочитати лист АССОРТИМЕНТ",
    });
    return { ok: false, reason: "ASSORTMENT_READ_FAILED" };
  }

  if (!rows) {
    await logAssortmentSyncError(spreadsheetId, {
      ...baseLog,
      reason: "SHEETS_DISABLED",
      hint: "Google Sheets вимкнено або немає доступу API",
    });
    return { ok: false, reason: "SHEETS_DISABLED" };
  }

  const headerCandidates = toAssortmentHeaderCandidates(modelName, productKey);

  const block = findAssortmentBlockForModel(rows, modelName, productKey);
  if (!block) {
    await logAssortmentSyncError(spreadsheetId, {
      ...baseLog,
      reason: "MODEL_BLOCK_NOT_FOUND",
      headerCandidates: headerCandidates.join(" | "),
      normalizedModel: normalizeSheetModelName(modelName),
      normalizedFlavor: compactSheetFlavor(flavorLabel),
      hint: `Заголовок блока на АССОРТИМЕНТ: один из «${headerCandidates.slice(0, 4).join(" / ")}»`,
    });

    return { ok: false, reason: "MODEL_BLOCK_NOT_FOUND" };
  }

  const flavorLabels = [
    ...new Set(
      [flavorLabel, ...flavorLabelCandidates].map((x) => String(x || "").trim()).filter(Boolean)
    ),
  ];
  const resolved = resolveAssortmentFlavorRow(rows, block, flavorLabels);
  const flavorRow = resolved.row;
  const matchedFlavorLabel = resolved.label || flavorLabels[0] || "";

  if (flavorRow >= 0 && resolved.tier > 1 && !dryRun) {
    await logAssortmentSyncError(spreadsheetId, {
      ...baseLog,
      reason: "ASSORTMENT_FUZZY_MATCH",
      headerCandidates: headerCandidates.join(" | "),
      normalizedModel: block.header,
      flavorLabel: flavorLabels.join(" | "),
      normalizedFlavor: compactSheetFlavor(matchedFlavorLabel),
      hint: `Нечіткий збіг: «${matchedFlavorLabel}» → «${String(rows[flavorRow]?.[block.flavorCol] || "").trim()}» — перевірте назву на листі`,
    });
  }

  if (flavorRow < 0) {
    const sheetFlavors = listAssortmentFlavorsInBlock(rows, block);
    await logAssortmentSyncError(spreadsheetId, {
      ...baseLog,
      reason: resolved.ambiguous ? "FLAVOR_ROW_AMBIGUOUS" : "FLAVOR_ROW_NOT_FOUND",
      headerCandidates: headerCandidates.join(" | "),
      normalizedModel: block.header,
      flavorLabel: flavorLabels.join(" | "),
      normalizedFlavor: flavorLabels.map((l) => compactSheetFlavor(l)).join(" | "),
      triedLabels: flavorLabels,
      hint: resolved.ambiguous
        ? `Неоднозначно: кілька схожих рядків у «${block.header}»: ${(resolved.candidates || []).join(" | ")} — уточніть назву на листі`
        : sheetFlavors.length
          ? `Блок «${block.header}»: додайте рядок як у каталозі або скопіюйте з листа: ${sheetFlavors.slice(0, 6).join(" | ")}`
          : `Блок «${block.header}» без рядків смаків`,
    });

    return {
      ok: false,
      reason: resolved.ambiguous ? "FLAVOR_ROW_AMBIGUOUS" : "FLAVOR_ROW_NOT_FOUND",
      triedLabels: flavorLabels,
    };
  }

  const duplicateFlavorRows = countAssortmentFlavorMatches(
    rows,
    block,
    matchedFlavorLabel
  );
  if (duplicateFlavorRows > 1 && !dryRun) {
    await logAssortmentSyncError(spreadsheetId, {
      ...baseLog,
      reason: "ASSORTMENT_DUPLICATE_FLAVOR_ROW",
      headerCandidates: headerCandidates.join(" | "),
      normalizedModel: block.header,
      flavorLabel: matchedFlavorLabel,
      normalizedFlavor: compactSheetFlavor(matchedFlavorLabel),
      hint: `У блоці «${block.header}» ${duplicateFlavorRows} рядків для цього смаку — списання йде в перший; приберіть дублікати на листі`,
    });
  }

  const currentQty = parseQty(rows[flavorRow]?.[block.qtyCol]);
  const rawNext = currentQty + deltaQty;
  // Продаж (мінус): дозволяємо від’ємний залишок (−1, −2…), щоб 0 не «залипав».
  // Повернення / корекція в плюс — не нижче 0.
  const nextQty =
    deltaQty < 0 ? rawNext : Math.max(0, rawNext);

  const soldAtZeroOrBelow = deltaQty < 0 && currentQty <= 0;
  const noDeductionEffect = deltaQty < 0 && nextQty === currentQty;

  if (noDeductionEffect) {
    await logAssortmentSyncError(spreadsheetId, {
      ...baseLog,
      reason: "ASSORTMENT_NO_DEDUCT",
      headerCandidates: headerCandidates.join(" | "),
      normalizedModel: block.header,
      flavorLabel: matchedFlavorLabel,
      normalizedFlavor: compactSheetFlavor(matchedFlavorLabel),
      currentQty,
      nextQty,
      hint: `Залишок ${currentQty} не змінився після списання ${Math.abs(deltaQty)}`,
    });

    return {
      ok: false,
      reason: "ASSORTMENT_NO_DEDUCT",
      currentQty,
      nextQty,
      header: block.header,
      matchedFlavorLabel,
    };
  }

  const a1 = `${escapeSheetTitle(ASSORTMENT_SHEET_TITLE)}!${colToA1(block.qtyCol)}${flavorRow + 1}`;

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      a1,
      currentQty,
      nextQty,
      header: block.header,
      matchedFlavorLabel,
      stockSoldAtZero: soldAtZeroOrBelow,
    };
  }

  try {
    const writeRes = await batchUpdateValues(spreadsheetId, [
      {
        range: a1,
        values: [[nextQty]],
      },
    ]);
    if (!writeRes) {
      await logAssortmentSyncError(spreadsheetId, {
        ...baseLog,
        reason: "ASSORTMENT_WRITE_FAILED",
        normalizedModel: block.header,
        flavorLabel: matchedFlavorLabel,
        normalizedFlavor: compactSheetFlavor(matchedFlavorLabel),
        a1,
        currentQty,
        nextQty,
        errorMessage: "batchUpdateValues повернув null (API недоступний)",
      });
      return { ok: false, reason: "ASSORTMENT_WRITE_FAILED", a1 };
    }
  } catch (e) {
    await logAssortmentSyncError(spreadsheetId, {
      ...baseLog,
      reason: "ASSORTMENT_WRITE_FAILED",
      normalizedModel: block.header,
      flavorLabel: matchedFlavorLabel,
      normalizedFlavor: compactSheetFlavor(matchedFlavorLabel),
      a1,
      currentQty,
      nextQty,
      errorMessage: e?.message || e,
    });
    return { ok: false, reason: "ASSORTMENT_WRITE_FAILED", a1 };
  }

  if (nextQty < 0) {
    try {
      await ensureNegativeStockHighlight(spreadsheetId);
    } catch (e) {
      console.error("[googleSheets] negative highlight failed:", e?.message || e);
    }
  }

  if (soldAtZeroOrBelow) {
    await logAssortmentSyncError(spreadsheetId, {
      ...baseLog,
      reason: "ASSORTMENT_SOLD_AT_ZERO",
      headerCandidates: headerCandidates.join(" | "),
      normalizedModel: block.header,
      flavorLabel: matchedFlavorLabel,
      normalizedFlavor: compactSheetFlavor(matchedFlavorLabel),
      currentQty,
      nextQty,
      hint: `Було ${currentQty} → стало ${nextQty} (продаж при нульовому/від’ємному залишку на листі)`,
    });
  }

  return {
    ok: true,
    a1,
    currentQty,
    nextQty,
    header: block.header,
    matchedFlavorLabel,
    stockSoldAtZero: soldAtZeroOrBelow,
  };
}
