const SESSION_KEY = "elfduck_guest_session_v1";
const CART_KEY = "elfduck_guest_cart_v1";
const FAVORITES_KEY = "elfduck_guest_favorites_v1";
const PROFILE_KEY = "elfduck_guest_profile_v1";
const ORDERS_KEY = "elfduck_guest_orders_v1";
/** Legacy MainPage cart (items array only) — migrated into guest cart on read */
const LEGACY_CART_ITEMS_KEY = "elfduck_cart_v1";

function safeParse(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function newSessionId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `g_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

export function getOrCreateGuestSessionId() {
  try {
    const existing = String(window.localStorage.getItem(SESSION_KEY) || "").trim();
    if (existing) return existing;
    const id = newSessionId();
    window.localStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    return newSessionId();
  }
}

const emptyCart = () => ({
  items: [],
  checkoutPickupPointId: null,
  checkoutDeliveryType: null,
  checkoutDeliveryMethod: null,
  courierAddress: null,
  courierDistrict: null,
  deliveryFeeZl: 0,
  inpostDeliveryFeeZl: 0,
  inpostPackageUnits: 0,
  inpostData: {
    fullName: null,
    phone: null,
    email: null,
    city: null,
    lockerAddress: null,
  },
  arrivalTime: null,
  deliveryTimeWindow: null,
  comment: "",
});

function migrateLegacyCartItems() {
  try {
    const raw = window.localStorage.getItem(LEGACY_CART_ITEMS_KEY);
    if (!raw) return null;
    const parsed = safeParse(raw, null);
    if (!Array.isArray(parsed) || !parsed.length) return null;
    window.localStorage.removeItem(LEGACY_CART_ITEMS_KEY);
    return parsed;
  } catch {
    return null;
  }
}

export function loadGuestCart() {
  try {
    const raw = window.localStorage.getItem(CART_KEY);
    const parsed = safeParse(raw, null);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return {
        ...emptyCart(),
        ...parsed,
        items: Array.isArray(parsed.items) ? parsed.items : [],
      };
    }
    const legacyItems = migrateLegacyCartItems();
    if (legacyItems) {
      const cart = { ...emptyCart(), items: legacyItems };
      saveGuestCart(cart);
      return cart;
    }
    return emptyCart();
  } catch {
    return emptyCart();
  }
}

export function saveGuestCart(cart) {
  const next = {
    ...emptyCart(),
    ...(cart && typeof cart === "object" ? cart : {}),
    items: Array.isArray(cart?.items) ? cart.items : [],
  };
  try {
    window.localStorage.setItem(CART_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

export function mergeGuestCartPatch(patch) {
  const current = loadGuestCart();
  return saveGuestCart({ ...current, ...(patch || {}) });
}

export function getGuestFavorites() {
  try {
    const raw = window.localStorage.getItem(FAVORITES_KEY);
    const list = safeParse(raw, []);
    return Array.isArray(list)
      ? list.map((x) => String(x).trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

export function setGuestFavorites(keys) {
  const list = Array.isArray(keys)
    ? keys.map((x) => String(x).trim()).filter(Boolean)
    : [];
  try {
    window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
  return list;
}

export function toggleGuestFavorite(productKey) {
  const key = String(productKey || "").trim();
  if (!key) return getGuestFavorites();
  const set = new Set(getGuestFavorites());
  if (set.has(key)) set.delete(key);
  else set.add(key);
  return setGuestFavorites(Array.from(set));
}

export function getGuestProfile() {
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY);
    const p = safeParse(raw, {});
    return {
      fullName: String(p?.fullName || "").trim(),
      phone: String(p?.phone || "").trim(),
      email: String(p?.email || "").trim(),
    };
  } catch {
    return { fullName: "", phone: "", email: "" };
  }
}

export function saveGuestProfile(profile) {
  const next = {
    fullName: String(profile?.fullName || "").trim(),
    phone: String(profile?.phone || "").trim(),
    email: String(profile?.email || "").trim(),
  };
  try {
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

export function getGuestOrders() {
  try {
    const raw = window.localStorage.getItem(ORDERS_KEY);
    const list = safeParse(raw, []);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function addGuestOrder(order) {
  if (!order || typeof order !== "object") return getGuestOrders();
  const id = String(order._id || order.id || order.orderNo || "").trim();
  const list = getGuestOrders().filter(
    (o) => String(o?._id || o?.id || o?.orderNo || "") !== id
  );
  list.unshift(order);
  const trimmed = list.slice(0, 50);
  try {
    window.localStorage.setItem(ORDERS_KEY, JSON.stringify(trimmed));
  } catch {
    /* ignore */
  }
  return trimmed;
}

export function clearGuestCart() {
  saveGuestCart(emptyCart());
}
