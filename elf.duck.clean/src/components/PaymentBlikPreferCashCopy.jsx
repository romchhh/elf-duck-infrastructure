import cashIcon from "../assets/cashIcon.webp";
import CartInfoIcon from "../assets/CartInfoIcon.webp";
import googlePinIcon from "../assets/googlePinIcon.webp";
import percentIcon from "../assets/percentIcon.webp";
import { t } from "../utils/i18n";

function CopyRow({ icon, iconWrapClass = "", className = "", children }) {
  return (
    <div className={`paymentBlikCopyRow ${className}`.trim()}>
      <span className={`paymentBlikCopyIconWrap ${iconWrapClass}`.trim()}>
        <img src={icon} className="paymentBlikCopyIcon" alt="" />
      </span>
      <div className="paymentBlikCopyBody">{children}</div>
    </div>
  );
}

export default function PaymentBlikPreferCashCopy({ mapsHref = "#" }) {
  return (
    <div className="paymentBlikGiveawayCopy">
      <CopyRow
        icon={percentIcon}
        iconWrapClass="paymentBlikCopyIconWrap--accent"
      >
        <p className="paymentBlikCopyTitle">
          {t(
            "Оплата BLIK временно недоступна",
            "Płatność BLIK jest tymczasowo niedostępna"
          )}
        </p>
        <p className="paymentBlikCopyText">
          {t(
            "Выберите наличные или другой доступный способ оплаты.",
            "Wybierz gotówkę lub inną dostępną metodę płatności."
          )}
        </p>
      </CopyRow>

      <CopyRow icon={cashIcon} iconWrapClass="paymentBlikCopyIconWrap--cash">
        <p className="paymentBlikCopyTitle">
          {t(
            "Будем вам очень благодарны, если вы выберете оплату наличными",
            "Będziemy bardzo wdzięczni, jeśli wybierzesz płatność gotówką"
          )}
        </p>
      </CopyRow>

      <CopyRow icon={CartInfoIcon}>
        <p className="paymentBlikCopyText">
          {t(
            "Наличные можно снять в магазине Żabka рядом с точкой самовывоза.",
            "Gotówkę możesz wypłacić w sklepie Żabka obok punktu odbioru."
          )}
        </p>
      </CopyRow>

      <a
        className="paymentBlikGiveawayMapsBtn"
        href={mapsHref}
        target="_blank"
        rel="noreferrer"
      >
        <span className="paymentBlikCopyIconWrap paymentBlikCopyIconWrap--pin">
          <img src={googlePinIcon} className="paymentBlikCopyIcon" alt="" />
        </span>
        <span className="paymentBlikMapsLabel">
          {t(
            "Ближайшая Żabka на Google Maps",
            "Najbliższa Żabka w Google Maps"
          )}
        </span>
      </a>
    </div>
  );
}
