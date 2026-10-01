import { productVisualByKey } from "./productImages.js";

export const CATALOG_SMOKE_VISUAL_CLASS = "productCardCatalogVisual";

export function usesCatalogSmoke(product) {
  if (!product || typeof product !== "object") return false;
  const key = String(product.productKey || "").trim();
  if (key && productVisualByKey[key]) return true;
  return (
    String(product.classCardBg || "").trim() === CATALOG_SMOKE_VISUAL_CLASS
  );
}

/** Один URL картинки → CSS-шар диму (blur), без другого img у DOM. */
export function catalogSmokeCardStyle(product) {
  const url = String(product?.cardBgUrl || "").trim();
  if (!url) return undefined;
  return { "--product-catalog-img": `url(${JSON.stringify(url)})` };
}
