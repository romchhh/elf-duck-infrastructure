export const CASHBACK_EXPIRING_SOON_MS =
  5 * 24 * 60 * 60 * 1000;

export function getNearestActiveCashbackExpiry(
  user,
  now = new Date()
) {
  const ledger = Array.isArray(user?.cashbackLedger)
    ? user.cashbackLedger
    : [];

  const activeLedger = ledger
    .filter((entry) => {
      const remaining = Number(entry?.remainingZl || 0);

      if (remaining <= 0) {
        return false;
      }

      if (entry?.expiredAt) {
        return false;
      }

      if (!entry?.expiresAt) {
        return false;
      }

      const expiresAt = new Date(entry.expiresAt);

      return expiresAt > now;
    })
    .sort(
      (a, b) =>
        new Date(a.expiresAt).getTime() -
        new Date(b.expiresAt).getTime()
    );

  if (!activeLedger.length) {
    return null;
  }

  return new Date(activeLedger[0].expiresAt);
}

export function isCashbackExpiringSoon(
  user,
  now = new Date()
) {
  const nearestExpiry = getNearestActiveCashbackExpiry(
    user,
    now
  );

  if (!nearestExpiry) {
    return false;
  }

  const msUntilExpiry =
    nearestExpiry.getTime() - now.getTime();

  return (
    msUntilExpiry >= 0 &&
    msUntilExpiry <= CASHBACK_EXPIRING_SOON_MS
  );
}
