/** Єдині класи якоря PNG: left/right у назві = сторона на картці. */
export function normalizeCardDuckClass(classCardDuck) {
  const raw = String(classCardDuck || "").trim();
  if (!raw) return "";
  const low = raw.toLowerCase();
  if (low.includes("left")) return "productCardImageLeft";
  if (low.includes("right")) return "productCardImageRight";
  return raw;
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
