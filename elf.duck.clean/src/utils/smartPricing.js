/** Акційні товари (SALE) — фіксована ціна з каталогу, без smart price */
export function isSalePromoProduct(product) {
  return String(product?.newBadge || "").trim().toUpperCase() === "SALE";
}
