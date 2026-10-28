/** Є запечене одне фото картки (фон+утка). */
export function hasBakedCardImage(item) {
  return Boolean(String(item?.cardImageUrl || "").trim());
}

export function getBakedCardImageUrl(item) {
  return String(item?.cardImageUrl || "").trim();
}

/**
 * Hero на сторінці товару.
 * Пріоритет у `orderImgUrl` — окреме фото з правильними пропорціями (як у CRM «Картинка заказа»).
 * Запечений `orderImageUrl` не використовуємо для hero: там інші пропорції фону/PNG.
 */
export function getProductHeroUrl(product) {
  return String(
    product?.orderImgUrl || product?.cardImageUrl || ""
  ).trim();
}
