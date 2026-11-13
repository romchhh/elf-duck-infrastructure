/** BLIK-замовлення не дають запис у розіграш (кешбек нараховується як для інших методів). */
export function isBlikOrderPayment(order) {
  const method = String(order?.payment?.method || "")
    .trim()
    .toLowerCase();
  return method === "blik";
}
