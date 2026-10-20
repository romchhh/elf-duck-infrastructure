export function normalizePushString(value) {
  return String(value || "").trim();
}

export function normalizePushUsername(value) {
  return normalizePushString(value)
    .replace(/^@/, "");
}

/** Список @username / telegramId з textarea (кома, пробіл, новий рядок). */
export function parsePushAudienceTokens(raw) {
  return [
    ...new Set(
      String(raw || "")
        .split(/[\s,;]+/)
        .map((part) => normalizePushUsername(part).toLowerCase())
        .filter(Boolean)
    ),
  ];
}

export function getPushUserDisplayName(user) {
  const fullName = [
    user?.firstName || "",
    user?.lastName || "",
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  const username =
    normalizePushString(
      user?.username
    );

  return (
    fullName ||
    (
      username
        ? `@${username}`
        : ""
    ) ||
    normalizePushString(
      user?.telegramId
    ) ||
    "Пользователь"
  );
}

export function getPushLocationKey(order) {
  if (
    order?.deliveryType ===
    "pickup"
  ) {
    return `pickup:${String(
      order?.pickupPointId ||
        ""
    )}`;
  }

  if (
    order?.deliveryType ===
      "delivery" &&
    order?.deliveryMethod ===
      "courier"
  ) {
    return "delivery:courier";
  }

  if (
    order?.deliveryType ===
      "delivery" &&
    order?.deliveryMethod ===
      "inpost"
  ) {
    return "delivery:inpost";
  }

  return "";
}