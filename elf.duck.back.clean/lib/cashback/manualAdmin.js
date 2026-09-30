function addDays(dateLike, days) {
  const base = new Date(dateLike);
  base.setDate(base.getDate() + Number(days || 0));
  return base;
}

export function recalcUserCashbackBalanceFromLedger(user) {
  const ledger = Array.isArray(user?.cashbackLedger) ? user.cashbackLedger : [];
  const total = ledger.reduce((sum, row) => {
    if (row?.expiredAt) return sum;
    return sum + Math.max(0, Number(row?.remainingZl || 0));
  }, 0);

  user.cashbackBalance = Number(total.toFixed(2));
  return user.cashbackBalance;
}

export async function grantManualCashbackToUser(user, amountZl, meta = {}) {
  if (!user) throw new Error("USER_NOT_FOUND");

  const safeAmount = Number(amountZl || 0);
  if (!(safeAmount > 0)) {
    throw new Error("INVALID_CASHBACK_AMOUNT");
  }

  user.cashbackLedger = Array.isArray(user.cashbackLedger) ? user.cashbackLedger : [];

  const now = new Date();
  const expiresAt = addDays(now, 30);

  user.cashbackLedger.push({
    source: "manual_admin_grant",
    amountZl: Number(safeAmount.toFixed(2)),
    remainingZl: Number(safeAmount.toFixed(2)),
    earnedAt: now,
    expiresAt,
    orderId: null,
    grantedByTelegramId: String(meta?.grantedByTelegramId || "").trim(),
    grantedByUsername: String(meta?.grantedByUsername || "").trim(),
    warnedAt: null,
    expiredAt: null,
    expiredAmountZl: 0,
  });

  recalcUserCashbackBalanceFromLedger(user);
  await user.save();

  return {
    cashbackBalance: Number(user.cashbackBalance || 0),
    grantedAmountZl: Number(safeAmount.toFixed(2)),
    expiresAt,
  };
}

export async function deductManualCashbackFromUser(user, amountZl, meta = {}) {
  if (!user) throw new Error("USER_NOT_FOUND");

  const safeAmount = Number(amountZl || 0);
  if (!(safeAmount > 0)) {
    throw new Error("INVALID_CASHBACK_AMOUNT");
  }

  user.cashbackLedger = Array.isArray(user.cashbackLedger) ? user.cashbackLedger : [];

  let leftToDeduct = Number(safeAmount.toFixed(2));

  const activeRows = [...user.cashbackLedger]
    .filter((row) => !row?.expiredAt && Number(row?.remainingZl || 0) > 0)
    .sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime());

  for (const row of activeRows) {
    if (leftToDeduct <= 0) break;

    const available = Math.max(0, Number(row.remainingZl || 0));
    if (available <= 0) continue;

    const used = Math.min(available, leftToDeduct);
    row.remainingZl = Number((available - used).toFixed(2));
    leftToDeduct = Number((leftToDeduct - used).toFixed(2));
  }

  if (leftToDeduct > 0.009) {
    throw new Error("INSUFFICIENT_CASHBACK_BALANCE");
  }

  const now = new Date();

  user.cashbackLedger.push({
    source: "manual_admin_deduct",
    amountZl: Number(safeAmount.toFixed(2)),
    remainingZl: 0,
    earnedAt: now,
    expiresAt: null,
    orderId: null,
    grantedByTelegramId: String(meta?.grantedByTelegramId || "").trim(),
    grantedByUsername: String(meta?.grantedByUsername || "").trim(),
    warnedAt: null,
    expiredAt: null,
    expiredAmountZl: 0,
  });

  recalcUserCashbackBalanceFromLedger(user);
  await user.save();

  return {
    cashbackBalance: Number(user.cashbackBalance || 0),
    deductedAmountZl: Number(safeAmount.toFixed(2)),
  };
}
