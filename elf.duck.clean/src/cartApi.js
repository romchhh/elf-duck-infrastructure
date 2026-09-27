import { isGuestShopping } from "./utils/shoppingSession";
import {
  loadGuestCart,
  mergeGuestCartPatch,
  clearGuestCart,
} from "./utils/guestLocalStore";
import { buildApiHeaders } from "./utils/shoppingSession";

const API_URL = import.meta.env.VITE_API_URL;

function normalizeInpostData(raw) {
  const d = raw && typeof raw === "object" ? raw : {};
  return {
    fullName: d.fullName ?? null,
    phone: d.phone ?? null,
    email: d.email ?? null,
    city: d.city ?? null,
    lockerAddress: d.lockerAddress ?? null,
  };
}

function buildLocalCartFromSave(
  items,
  checkoutPickupPointId,
  checkoutDeliveryType,
  checkoutDeliveryMethod,
  extra = {}
) {
  const current = loadGuestCart();
  return mergeGuestCartPatch({
    items: Array.isArray(items) ? items : [],
    checkoutPickupPointId:
      checkoutPickupPointId !== undefined
        ? checkoutPickupPointId
        : current.checkoutPickupPointId,
    checkoutDeliveryType:
      checkoutDeliveryType !== undefined && checkoutDeliveryType !== null
        ? checkoutDeliveryType
        : current.checkoutDeliveryType,
    checkoutDeliveryMethod:
      checkoutDeliveryMethod !== undefined && checkoutDeliveryMethod !== null
        ? checkoutDeliveryMethod
        : current.checkoutDeliveryMethod,
    courierAddress:
      extra.courierAddress !== undefined
        ? extra.courierAddress
        : current.courierAddress,
    courierDistrict:
      extra.courierDistrict !== undefined
        ? extra.courierDistrict
        : current.courierDistrict,
    deliveryFeeZl:
      extra.deliveryFeeZl !== undefined
        ? Number(extra.deliveryFeeZl || 0)
        : current.deliveryFeeZl,
    inpostData:
      extra.inpostData !== undefined
        ? normalizeInpostData(extra.inpostData)
        : current.inpostData,
    arrivalTime:
      extra.arrivalTime !== undefined ? extra.arrivalTime : current.arrivalTime,
    deliveryTimeWindow:
      extra.deliveryTimeWindow !== undefined
        ? extra.deliveryTimeWindow
        : current.deliveryTimeWindow,
    comment:
      extra.comment !== undefined ? String(extra.comment || "") : current.comment,
  });
}

export async function getCart() {
  if (isGuestShopping()) {
    return loadGuestCart();
  }

  const r = await fetch(`${API_URL}/cart`, {
    headers: buildApiHeaders(),
  });
  const data = await r.json().catch(() => ({}));

  const cart = data?.cart ? data.cart : data;

  return cart || { items: [], checkoutPickupPointId: null };
}

export async function saveCart(
  _telegramId,
  items,
  checkoutPickupPointId,
  checkoutDeliveryType = null,
  checkoutDeliveryMethod = null,
  forceCheckoutSelection = false,
  extra = {}
) {
  if (isGuestShopping()) {
    const current = loadGuestCart();
    const cart = buildLocalCartFromSave(
      items,
      forceCheckoutSelection || checkoutPickupPointId !== undefined
        ? checkoutPickupPointId
        : current.checkoutPickupPointId,
      forceCheckoutSelection ? checkoutDeliveryType : checkoutDeliveryType,
      forceCheckoutSelection ? checkoutDeliveryMethod : checkoutDeliveryMethod,
      extra
    );
    if (forceCheckoutSelection) {
      cart.checkoutDeliveryType = checkoutDeliveryType;
      cart.checkoutDeliveryMethod = checkoutDeliveryMethod;
      cart.checkoutPickupPointId = checkoutPickupPointId;
    }
    mergeGuestCartPatch(cart);
    return { ok: true, cart };
  }

  const body = {
    items,
    checkoutPickupPointId,
    checkoutDeliveryType,
    checkoutDeliveryMethod,
    forceCheckoutSelection: !!forceCheckoutSelection,
    ...(extra && typeof extra === "object" ? extra : {}),
  };

  const r = await fetch(`${API_URL}/cart`, {
    method: "PUT",
    headers: buildApiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });

  const data = await r.json().catch(() => ({}));

  if (!r.ok || data?.ok === false) {
    const err = new Error(
      data?.error ||
        data?.message ||
        `Не удалось сохранить корзину (HTTP ${r.status})`
    );
    err.meta = data?.meta || null;
    err.status = r.status;
    err.field = data?.field;
    throw err;
  }

  return data;
}

export function buildGuestConfirmPayload(cart, guestContact) {
  return {
    cart,
    guestContact: {
      fullName: String(guestContact?.fullName || "").trim(),
      phone: String(guestContact?.phone || "").trim(),
      email: String(guestContact?.email || "").trim(),
    },
  };
}

export async function clearShoppingCartAfterOrder() {
  if (isGuestShopping()) {
    clearGuestCart();
    return;
  }
}
