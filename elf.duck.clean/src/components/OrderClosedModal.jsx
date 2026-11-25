import { orderClosedModalCopy } from "../utils/orderClosedFeedback.js";
import { t } from "../utils/i18n";
import { haptic } from "../utils/haptics";

export default function OrderClosedModal({ open, kind, orderNo, onClose }) {
  if (!open || !kind) return null;

  const copy = orderClosedModalCopy(kind, t);
  const orderLabel = String(orderNo || "").trim();

  return (
    <div
      className="paymentInputOverlay"
      role="presentation"
      onClick={() => {
        haptic.light();
        onClose?.();
      }}
    >
      <div
        className="paymentInputModal orderClosedModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="orderClosedModalTitle"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="paymentInputTitle" id="orderClosedModalTitle">
          {copy.title}
        </div>

        {orderLabel ? (
          <div className="orderClosedModalOrderNo">#{orderLabel}</div>
        ) : null}

        <div className="orderClosedModalBody">{copy.body}</div>

        <div className="paymentInputActions">
          <button
            type="button"
            className="paymentInputBtn primary"
            onClick={() => {
              haptic.medium();
              onClose?.();
            }}
          >
            {copy.button}
          </button>
        </div>
      </div>
    </div>
  );
}