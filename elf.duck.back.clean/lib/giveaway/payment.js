/** BLIK-замовлення не дають кешбек і запис у розіграш. */
export function isBlikOrderPayment(order) {
  const method = String(order?.payment?.method || "")
    .trim()
    .toLowerCase();
  return method === "blik";
}
