/**
 * Підпис характеристики позиції замовлення (колір пода, Ω картриджа, смак жижі).
 * Без залежностей від server chunks — CRM, Telegram, статистика.
 */

function normUpper(s) {
  return String(s || "").trim().toUpperCase();
}

function productDisplayTitle(row = {}) {
  return [row?.productTitle1, row?.productTitle2]
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .join(" ")
    .trim();
}

function productCategoryKey(row = {}) {
  return String(row?.categoryKey || row?.productCategoryKey || "")
    .trim()
    .toLowerCase();
}

function isLiquidRow(row = {}) {
  const pk = String(row?.productKey || "").trim().toLowerCase();
  if (pk.includes("30-ml") && !pk.includes("cartridge")) return true;
  if (productCategoryKey(row) === "liquids") return true;
  return /\b30\s*ml\b/i.test(productDisplayTitle(row));
}

export function isOrderItemCartridge(row = {}) {
  if (isLiquidRow(row)) return false;
  if (productCategoryKey(row) === "cartridges" || productCategoryKey(row) === "cartridge") {
    return true;
  }
  const title = productDisplayTitle(row).toLowerCase();
  return title.includes("cartridge") || title.includes("catridge");
}

export function isOrderItemPod(row = {}) {
  if (isLiquidRow(row)) return false;
  const title = productDisplayTitle(row).toLowerCase();
  if (title.includes("cartridge") || title.includes("catridge")) return false;
  if (productCategoryKey(row) === "pods" || productCategoryKey(row) === "pod") return true;
  return /\bpod\b/.test(title);
}

export function formatCartridgeCharacteristicLabel(flavor = {}) {
  const key = String(flavor?.flavorKey || "").trim().toLowerCase();
  const label = String(flavor?.flavorLabel || flavor?.label || "").trim();

  const fromKey = key.match(/0-(\d)-1-szt$/) || key.match(/0-(\d)(?:-|$)/);
  if (fromKey) return `0.${fromKey[1]} Ω`;

  const fromLabel = label.match(/\b0\.(\d)\b/);
  if (fromLabel) return `0.${fromLabel[1]} Ω`;

  if (label) return label.replace(/\s+/g, " ").trim();
  return "Вариант";
}

export function formatPodCharacteristicLabel(flavor = {}, productRow = {}) {
  const rowTitle = productDisplayTitle(productRow);
  const label = String(flavor?.flavorLabel || flavor?.label || "").trim();

  const looksLikeProductName =
    !label ||
    normUpper(label) === normUpper(rowTitle) ||
    /^xros\s+.*\bpod\b/i.test(label);

  if (label && !looksLikeProductName) {
    return label;
  }

  const fk = String(flavor?.flavorKey || "").trim();
  if (fk) {
    return fk
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  const title2 = String(productRow?.productTitle2 || "").trim();
  if (title2 && normUpper(title2) !== normUpper(rowTitle)) {
    return title2;
  }

  return label || "Цвет";
}

export function formatLiquidCharacteristicLabel(flavor = {}) {
  return (
    String(flavor?.flavorLabel || flavor?.label || flavor?.flavorKey || "Вкус")
      .trim() || "Вкус"
  );
}

/** Уніфікована характеристика для рядка замовлення. */
export function formatOrderFlavorCharacteristicLabel(productRow = {}, flavor = {}) {
  if (isOrderItemCartridge(productRow)) {
    return formatCartridgeCharacteristicLabel(flavor);
  }
  if (isOrderItemPod(productRow)) {
    return formatPodCharacteristicLabel(flavor, productRow);
  }
  return formatLiquidCharacteristicLabel(flavor);
}

/** Текст позиції для CRM / коротких списків. */
export function formatOrderItemSummaryLabel(productRow = {}, options = {}) {
  const title = productDisplayTitle(productRow);
  if (!title) return "";

  const flavors = Array.isArray(productRow?.flavors) ? productRow.flavors : [];
  const parts = flavors
    .map((f) => {
      const qty = Math.max(0, Number(f?.qty || f?.quantity || 0));
      if (!qty) return "";
      const char = formatOrderFlavorCharacteristicLabel(productRow, f);
      return `${char} ×${qty}`;
    })
    .filter(Boolean);

  if (!parts.length) {
    return title;
  }

  const joiner = options.joiner ?? ", ";
  const prefix = options.includeProductTitle === false ? "" : `${title}: `;
  return `${prefix}${parts.join(joiner)}`.trim();
}
