import { t } from "./i18n";

function normalizePointKey(point) {
  return String(point?.key || "")
    .trim()
    .toLowerCase()
    .replace(/,+$/, "");
}

export function isDeliveryPickupPoint(point) {
  const key = normalizePointKey(point);
  return key === "delivery" || key === "delivery-2";
}

export function resolveComplaintDeliveryLabel({ order, pickupPoint } = {}) {
  const deliveryType = String(order?.deliveryType || "")
    .trim()
    .toLowerCase();
  const deliveryMethod = String(order?.deliveryMethod || "")
    .trim()
    .toLowerCase();
  const pointKey = normalizePointKey(
    pickupPoint ||
      order?.pickupPoint ||
      { key: order?.pickupPointKey }
  );

  if (
    deliveryType === "delivery" ||
    deliveryMethod === "courier" ||
    pointKey === "delivery"
  ) {
    return t("Доставка — курьер", "Dostawa — kurier");
  }

  if (deliveryMethod === "inpost" || pointKey === "delivery-2") {
    return t("Доставка — InPost", "Dostawa — InPost");
  }

  return t("Самовывоз", "Odbiór osobisty");
}

export function buildComplaintContext({ order, pickupPoint } = {}) {
  const point =
    pickupPoint ||
    (order?.pickupPoint ? order.pickupPoint : null);

  const pointTitle =
    String(point?.title || order?.pickupPointTitle || "").trim() ||
    t("Не указано", "Nie podano");

  const pointAddress =
    String(point?.address || order?.pickupPointAddress || "").trim() ||
    t("Не указано", "Nie podano");

  return {
    orderId: String(order?._id || "").trim(),
    pickupPointId: String(
      point?._id || order?.pickupPointId || ""
    ).trim(),
    orderNo: String(order?.orderNo || "").trim(),
    pointTitle,
    pointAddress,
    deliveryLabel: resolveComplaintDeliveryLabel({ order, pickupPoint: point }),
    source: order ? "order_history" : "support",
  };
}

export async function readImageFilesAsDataUrls(fileList, max = 5) {
  const files = Array.from(fileList || []).slice(0, max);
  const readers = files.map(
    (file) =>
      new Promise((resolve, reject) => {
        if (!String(file?.type || "").startsWith("image/")) {
          resolve(null);
          return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      })
  );

  const results = await Promise.all(readers);
  return results.filter(Boolean);
}
