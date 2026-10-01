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
