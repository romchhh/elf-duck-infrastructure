export function merryGiftQtyOf(row) {
  const qty = Math.max(0, Number(row?.qty || 0));
  const gift = Math.max(0, Number(row?.giftQty || 0));
  return Math.min(qty, gift);
}

export function lineChargeZl(row) {
  const qty = Math.max(0, Number(row?.qty || 0));
  const price = Number(row?.unitPrice || 0);
  return (qty - merryGiftQtyOf(row)) * price;
}
