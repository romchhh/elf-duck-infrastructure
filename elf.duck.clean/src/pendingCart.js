export const pendingCart = {
  items: null,           // merged cart items to seed CartPage with
  savePromise: null,     // promise for in-flight PUT /cart call
  checkoutPickupPointId: null,
  checkoutDeliveryType: null,
  checkoutDeliveryMethod: null,
  courierAddress: null,
  inpostData: null,
  arrivalTime: null,
  deliveryTimeWindow: null,
};

export function setPendingCart(data) {
  Object.assign(pendingCart, data);
}

export function peekPendingCart() {
  return { ...pendingCart };
}

export function clearPendingCart() {
  pendingCart.items = null;
  pendingCart.savePromise = null;
  pendingCart.checkoutPickupPointId = null;
  pendingCart.checkoutDeliveryType = null;
  pendingCart.checkoutDeliveryMethod = null;
  pendingCart.courierAddress = null;
  pendingCart.inpostData = null;
  pendingCart.arrivalTime = null;
  pendingCart.deliveryTimeWindow = null;
}

export function consumePendingCart() {
  const snapshot = peekPendingCart();
  clearPendingCart();
  return snapshot;
}
