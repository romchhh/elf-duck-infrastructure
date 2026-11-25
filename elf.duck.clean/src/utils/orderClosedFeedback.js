export function isOrderClosedApiError(code) {
  const c = String(code || "").trim().toUpperCase();
  return c === "ORDER_ANNULLED" || c === "ORDER_CANCELED";
}

export function orderClosedKindFromError(code) {
  const c = String(code || "").trim().toUpperCase();
  return c === "ORDER_ANNULLED" ? "annulled" : "canceled";
}

/** Людські тексти для модалки (ru / pl через t). */
export function orderClosedModalCopy(kind, t) {
  const isAnnulled = String(kind || "").toLowerCase() === "annulled";

  if (isAnnulled) {
    return {
      title: t("Заказ аннулирован", "Zamówienie unieważnione"),
      body: t(
        [
          "Мы не получили подтверждение оплаты в отведённое время.",
          "Резерв товара снят. Если вы списывали кэшбек — он вернётся на баланс.",
          "Можно оформить новый заказ в каталоге.",
        ].join("\n\n"),
        [
          "Nie otrzymaliśmy potwierdzenia płatności w wyznaczonym czasie.",
          "Rezerwacja została zwolniona. Jeśli użyłeś cashbacku — wróci na saldo.",
          "Możesz złożyć nowe zamówienie w katalogu.",
        ].join("\n\n")
      ),
      button: t("Понятно", "Rozumiem"),
    };
  }

  return {
    title: t("Заказ отменён", "Zamówienie anulowane"),
    body: t(
      "Этот заказ больше недоступен для оплаты. При необходимости оформите новый.",
      "To zamówienie nie jest już dostępne do opłaty. W razie potrzeby złóż nowe."
    ),
    button: t("Понятно", "Rozumiem"),
  };
}