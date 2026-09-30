export function getCrmOrderStatus(status) {
  const value = String(status || "");

  if (
    value === "canceled" ||
    value === "annulled"
  ) {
    return "cancelled";
  }

  if (
    value === "completed" ||
    value === "done" ||
    value === "shipped"
  ) {
    return "done";
  }

  return "processing";
}

export function getCrmPaymentLabel(method) {
  const value = String(
    method || ""
  )
    .trim()
    .toLowerCase();

  const labels = {
    blik: "BLIK",
    cash: "Наличные",
    crypto: "Крипто",
    ua_card: "Карта",
    card: "Карта",
    cashback: "Кэшбэк",
  };

  return (
    labels[value] ||
    method ||
    "—"
  );
}

export function getCrmDeliveryLabel(order) {
  if (
    order?.deliveryType === "pickup"
  ) {
    return "Самовывоз";
  }

  if (
    order?.deliveryMethod === "courier"
  ) {
    return "Курьер";
  }

  if (
    order?.deliveryMethod === "inpost"
  ) {
    return "InPost";
  }

  return "—";
}

export function getCrmItemsLabel(items = []) {
  return items
    .map((item) => {
      const title = [
        item?.productTitle1 || "",
        item?.productTitle2 || "",
      ]
        .filter(Boolean)
        .join(" ")
        .trim();

      const qty = (
        item?.flavors || []
      ).reduce(
        (sum, flavor) =>
          sum +
          Number(flavor?.qty || 0),
        0
      );

      if (!title) {
        return "";
      }

      return `${title} ×${qty}`;
    })
    .filter(Boolean)
    .join(", ");
}
