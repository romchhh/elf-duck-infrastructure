/**
 * Зняття reservedQty з кошика — без імпорту chunk*.js (для CLI-скриптів).
 */
import Product from "../../models/Product.js";
import { getSyncedPickupPointIdsByAnyPoint } from "../server/pickupPointSync.js";

export function getCartItemFlavorRows(item = {}) {
  const flavors = Array.isArray(item?.flavors) ? item.flavors : [];

  if (flavors.length) {
    return flavors
      .map((flavor) => ({
        flavorKey: String(
          flavor?.flavorKey ||
            flavor?.key ||
            flavor?.id ||
            flavor?.flavorId ||
            ""
        ).trim(),
        qty: Math.max(0, Number(flavor?.qty || flavor?.quantity || 0)),
      }))
      .filter((row) => row.flavorKey && row.qty > 0);
  }

  const fallbackFlavorKey = String(
    item?.flavorKey || item?.key || item?.flavorId || ""
  ).trim();
  const fallbackQty = Math.max(0, Number(item?.qty || item?.quantity || 0));

  return fallbackFlavorKey && fallbackQty > 0
    ? [{ flavorKey: fallbackFlavorKey, qty: fallbackQty }]
    : [];
}

export function getCartStockContextId(cart) {
  const checkout = cart?.checkout || {};
  const items = Array.isArray(cart?.items) ? cart.items : [];
  const firstItem = items.length ? items[0] : {};

  const directContextId = String(
    cart?.stockContextId ||
      cart?.reservedContextId ||
      cart?.contextId ||
      cart?.pickupPointId ||
      cart?.checkoutPickupPointId ||
      checkout?.stockContextId ||
      checkout?.reservedContextId ||
      checkout?.contextId ||
      checkout?.pickupPointId ||
      firstItem?.stockContextId ||
      firstItem?.reservedContextId ||
      firstItem?.contextId ||
      firstItem?.pickupPointId ||
      firstItem?.reservedPickupPointId ||
      ""
  ).trim();

  if (directContextId) return directContextId;

  const deliveryType = String(
    cart?.checkoutDeliveryType ||
      cart?.deliveryType ||
      checkout?.deliveryType ||
      checkout?.type ||
      firstItem?.deliveryType ||
      ""
  ).trim();

  const deliveryMethod = String(
    cart?.checkoutDeliveryMethod ||
      cart?.deliveryMethod ||
      checkout?.deliveryMethod ||
      checkout?.method ||
      firstItem?.deliveryMethod ||
      ""
  ).trim();

  if (deliveryType === "pickup") {
    return String(
      cart?.checkoutPickupPointId ||
        cart?.pickupPointId ||
        checkout?.pickupPointId ||
        firstItem?.pickupPointId ||
        ""
    ).trim();
  }

  if (deliveryType === "delivery" && deliveryMethod === "inpost") {
    return "delivery-2";
  }

  if (deliveryType === "delivery") {
    return "delivery";
  }

  return "";
}

export async function releaseReservedStockForCart(cart) {
  if (!cart || !Array.isArray(cart?.items) || !cart.items.length) {
    return { ok: true, released: 0 };
  }

  const contextId = getCartStockContextId(cart);
  if (!contextId) {
    return { ok: false, reason: "NO_CONTEXT_ID", released: 0 };
  }

  const pickupPointIds = await getSyncedPickupPointIdsByAnyPoint(contextId);
  if (!pickupPointIds.length) {
    return { ok: false, reason: "NO_PICKUP_POINT_IDS", released: 0 };
  }

  let released = 0;

  for (const item of cart.items) {
    const productKey = String(item?.productKey || "").trim();
    if (!productKey) continue;

    const flavorRows = getCartItemFlavorRows(item);
    if (!flavorRows.length) continue;

    const product = await Product.findOne({ productKey });
    if (!product) continue;

    let changed = false;
    const productFlavors = Array.isArray(product?.flavors) ? product.flavors : [];

    for (const cartFlavor of flavorRows) {
      const flavorKey = String(cartFlavor?.flavorKey || "").trim();
      const qty = Math.max(0, Number(cartFlavor?.qty || 0));
      if (!flavorKey || qty <= 0) continue;

      const productFlavor = productFlavors.find(
        (flavor) =>
          String(flavor?.flavorKey || flavor?.key || "").trim() === flavorKey
      );
      if (!productFlavor) continue;

      productFlavor.stockByPickupPoint = Array.isArray(
        productFlavor?.stockByPickupPoint
      )
        ? productFlavor.stockByPickupPoint
        : [];

      for (const pickupPointId of pickupPointIds) {
        const stockRow = productFlavor.stockByPickupPoint.find(
          (row) =>
            String(row?.pickupPointId || "").trim() ===
            String(pickupPointId || "").trim()
        );
        if (!stockRow) continue;

        const currentReserved = Math.max(0, Number(stockRow?.reservedQty || 0));
        const nextReserved = Math.max(0, currentReserved - qty);
        const diff = currentReserved - nextReserved;

        if (diff > 0) {
          stockRow.reservedQty = nextReserved;
          released += diff;
          changed = true;
        }
      }
    }

    if (changed) {
      product.markModified("flavors");
      await product.save();
    }
  }

  return { ok: true, released };
}
