const API_URL = import.meta.env.VITE_API_URL;

export async function getCart() {
  const r = await fetch(`${API_URL}/cart`, {
    headers: {
      "x-telegram-init-data": window?.Telegram?.WebApp?.initData || "",
    },
  });
  const data = await r.json().catch(() => ({}));

  const cart = data?.cart ? data.cart : data;

  return cart || { items: [], checkoutPickupPointId: null };
}

export async function saveCart(
  telegramId,
  items,
  checkoutPickupPointId,
  checkoutDeliveryType = null,
  checkoutDeliveryMethod = null,
  forceCheckoutSelection = false,
  extra = {}
) {
  const body = {
    // telegramId,
    items,
    checkoutPickupPointId,
    checkoutDeliveryType,
    checkoutDeliveryMethod,
    forceCheckoutSelection: !!forceCheckoutSelection,
    ...(extra && typeof extra === "object" ? extra : {}),
  };

  const r = await fetch(`${API_URL}/cart`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "x-telegram-init-data": window?.Telegram?.WebApp?.initData || "",
    },
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
  throw err;
}

  return data?.cart;
}