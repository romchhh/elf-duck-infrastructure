/** Нормалізація / збереження останніх даних InPost для повторних замовлень. */

export function normalizeSavedInpostData(raw) {
  const d = raw && typeof raw === "object" ? raw : {};
  const fullName = String(d.fullName || "").trim() || null;
  const phone = String(d.phone || "").trim() || null;
  const email = String(d.email || "").trim() || null;
  const city = String(d.city || "").trim() || null;
  const lockerAddress = String(d.lockerAddress || "").trim() || null;

  if (!fullName && !phone && !email && !city && !lockerAddress) {
    return null;
  }

  return {
    fullName,
    phone,
    email,
    city,
    lockerAddress,
  };
}

export function hasUsableSavedInpostData(raw) {
  const d = normalizeSavedInpostData(raw);
  return Boolean(d?.fullName && d?.phone);
}

/**
 * User.savedInpostData → або останнє InPost-замовлення.
 */
export async function resolveSavedInpostData({ User, Order, telegramId }) {
  const tid = String(telegramId || "").trim();
  if (!tid) return null;

  const user = await User.findOne({ telegramId: tid })
    .select({ savedInpostData: 1 })
    .lean();

  const fromUser = normalizeSavedInpostData(user?.savedInpostData);
  if (hasUsableSavedInpostData(fromUser)) {
    return fromUser;
  }

  const lastOrder = await Order.findOne({
    userTelegramId: tid,
    deliveryMethod: "inpost",
    "inpostData.fullName": { $type: "string", $ne: "" },
  })
    .sort({ createdAt: -1 })
    .select({ inpostData: 1 })
    .lean();

  return normalizeSavedInpostData(lastOrder?.inpostData);
}

export async function persistSavedInpostData({ User, telegramId, inpostData }) {
  const tid = String(telegramId || "").trim();
  const normalized = normalizeSavedInpostData(inpostData);
  if (!tid || !hasUsableSavedInpostData(normalized)) {
    return { ok: false, reason: "EMPTY" };
  }

  await User.updateOne(
    { telegramId: tid },
    {
      $set: {
        savedInpostData: {
          ...normalized,
          updatedAt: new Date(),
        },
      },
    },
    { upsert: false }
  );

  return { ok: true };
}
