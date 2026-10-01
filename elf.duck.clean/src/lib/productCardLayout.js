function sideFromLayoutClass(className) {
  const low = String(className || "").trim().toLowerCase();
  if (low.includes("left")) return "left";
  if (low.includes("right")) return "right";
  return "";
}

/** Єдині класи якоря PNG: left/right у назві = сторона на картці. */
export function normalizeCardDuckClass(classCardDuck) {
  const raw = String(classCardDuck || "").trim();
  if (!raw) return "";
  const side = sideFromLayoutClass(raw);
  if (side === "left") return "productCardImageLeft";
  if (side === "right") return "productCardImageRight";
  return raw;
}

/** PNG якориться на тій же стороні, що й макет картки (bg або duck з Mongo). */
export function resolveCatalogDuckClass(product) {
  const bgSide = sideFromLayoutClass(product?.classCardBg);
  const duckSide = sideFromLayoutClass(product?.classCardDuck);
  const side = bgSide || duckSide || "left";
  return side === "right"
    ? "productCardImageRight"
    : "productCardImageLeft";
}

/**
 * Мобільний каталог (2 колонки): ліва клітинка ряду — PNG зліва, права — справа.
 * @param {number} gridIndex — позиція в сітці (0-based, з урахуванням усіх карток у grid)
 * @param {number} columns — кількість колонок (на телефоні 2)
 */
export function resolveCatalogGridDuckClass(gridIndex, columns = 2) {
  const cols = Math.max(1, Number(columns) || 2);
  const col = ((Number(gridIndex) || 0) % cols + cols) % cols;
  return col === 0 ? "productCardImageLeft" : "productCardImageRight";
}

export function resolveCatalogGridActionsClass(gridIndex, columns = 2) {
  const duckClass = resolveCatalogGridDuckClass(gridIndex, columns);
  return resolveProductActionsClass({ classCardDuck: duckClass });
}

/**
 * Кнопки (кошик / сердечко) — на протилежному боці від PNG товару.
 * productActionsRight → CSS left:14px (утка справа)
 * productActionsLeft  → CSS right:14px (утка зліва)
 */
export function resolveProductActionsClass(product) {
  const duck = String(product?.classCardDuck || "").trim().toLowerCase();
  if (duck.includes("right")) return "productActionsRight";
  if (duck.includes("left")) return "productActionsLeft";

  const saved = String(product?.classActions || "").trim();
  if (saved) return saved;

  return "productActionsLeft";
}
