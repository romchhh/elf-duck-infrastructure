export function isDisposablesCategory(product) {
  const key = String(product?.categoryKey || "").trim().toLowerCase();
  return key === "disposables" || key === "disposable";
}

export function isLiquidsCategory(product) {
  const key = String(product?.categoryKey || "").trim().toLowerCase();
  return key === "liquids" || key === "liquid";
}

export function isCartridgesCategory(product) {
  const key = String(product?.categoryKey || "").trim().toLowerCase();
  return key === "cartridges" || key === "cartridge";
}

export function normalizeCategoryKey(value) {
  return String(value || "").trim().toLowerCase();
}

/** Чи товар належить категорії (ключ з Mongo / API). */
export function productMatchesCategoryKey(product, categoryKey) {
  const filterKey = normalizeCategoryKey(categoryKey);
  if (!filterKey) return true;

  const productKey = normalizeCategoryKey(product?.categoryKey);
  if (productKey === filterKey) return true;

  const aliases = {
    liquids: ["liquid", "liquids"],
    disposables: ["disposable", "disposables"],
    cartridges: ["cartridge", "cartridges"],
    pods: ["pod", "pods"],
  };

  const allowed = aliases[filterKey];
  if (allowed && allowed.includes(productKey)) return true;

  return false;
}

const CANONICAL_CATEGORY_KEYS = new Set([
  "liquids",
  "disposables",
  "pods",
  "cartridges",
]);

/** Ключ для фільтра каталогу (узгоджує CRM key з categoryKey товарів). */
export function resolveCatalogCategoryKey(category) {
  const key = normalizeCategoryKey(category?.key);
  if (CANONICAL_CATEGORY_KEYS.has(key)) return key;

  const titleRaw = String(category?.title || "").trim().toLowerCase();
  const titleHints = {
    liquids: ["жидк", "płyn", "liquid"],
    disposables: ["однораз", "jednoraz", "disposable"],
    pods: ["pod", "под"],
    cartridges: ["картридж", "kartrid", "cartridge"],
  };

  for (const [canonical, hints] of Object.entries(titleHints)) {
    if (hints.some((h) => titleRaw.includes(h))) return canonical;
    if (key.includes(canonical)) return canonical;
  }

  return key;
}

/** Жижі та одноразки — трохи менший PNG на картці (як було до збільшення Xros). */
export function isCompactCatalogDuck(product) {
  return isDisposablesCategory(product) || isLiquidsCategory(product);
}
