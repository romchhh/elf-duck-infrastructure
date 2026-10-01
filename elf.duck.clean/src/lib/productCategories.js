export function isDisposablesCategory(product) {
  const key = String(product?.categoryKey || "").trim().toLowerCase();
  return key === "disposables" || key === "disposable";
}

export function isLiquidsCategory(product) {
  const key = String(product?.categoryKey || "").trim().toLowerCase();
  return key === "liquids" || key === "liquid";
}

/** Жижі та одноразки — трохи менший PNG на картці (як було до збільшення Xros). */
export function isCompactCatalogDuck(product) {
  return isDisposablesCategory(product) || isLiquidsCategory(product);
}
