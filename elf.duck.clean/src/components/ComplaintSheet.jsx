import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { t } from "../utils/i18n";
import { haptic } from "../utils/haptics";
import {
  buildComplaintContext,
  readImageFilesAsDataUrls,
} from "../utils/complaintForm";
import "../styles/ComplaintSheet.css";

const API_URL =
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_CRM_API_URL ||
  "http://localhost:3000";

export default function ComplaintSheet({
  open,
  onClose,
  order = null,
  pickupPoint = null,
}) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const context = useMemo(
    () => buildComplaintContext({ order, pickupPoint }),
    [order, pickupPoint]
  );

  useEffect(() => {
    if (!open) return undefined;
    setText("");
    setFiles([]);
    setPreviews([]);
    setError("");
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, order, pickupPoint]);

  useEffect(() => {
    return () => {
      previews.forEach((url) => {
        if (url.startsWith("blob:")) URL.revokeObjectURL(url);
      });
    };
  }, [previews]);

  if (!open || typeof document === "undefined") return null;

  const onPickFiles = (event) => {
    const picked = Array.from(event.target.files || []).slice(0, 5);
    event.target.value = "";
    if (!picked.length) return;

    setFiles(picked);
    previews.forEach((url) => {
      if (url.startsWith("blob:")) URL.revokeObjectURL(url);
    });
    setPreviews(picked.map((file) => URL.createObjectURL(file)));
  };

  const submit = async () => {
    const trimmed = String(text || "").trim();
    if (trimmed.length < 3) {
      setError(
        t(
          "Опишите проблему подробнее (минимум 3 символа).",
          "Opisz problem dokładniej (minimum 3 znaki)."
        )
      );
      haptic.error();
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const images = await readImageFilesAsDataUrls(files, 5);
      const r = await fetch(`${API_URL}/support/complaint`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-telegram-init-data": window?.Telegram?.WebApp?.initData || "",
        },
        body: JSON.stringify({
          text: trimmed,
          images,
          orderId: context.orderId,
          pickupPointId: context.pickupPointId,
          source: context.source,
        }),
      });

      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data?.ok) {
        throw new Error(data?.error || `HTTP ${r.status}`);
      }

      haptic.success();
      onClose?.({ submitted: true });
    } catch (err) {
      console.error("complaint submit error", err);
      haptic.error();
      setError(
        t(
          "Не удалось отправить жалобу. Попробуйте позже.",
          "Nie udało się wysłać skargi. Spróbuj później."
        )
      );
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div className="complaintBackdrop" role="presentation" onClick={onClose}>
      <div
        className="complaintSheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="complaintSheetTitle"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="complaintSheetHandle" aria-hidden />

        <h2 id="complaintSheetTitle" className="complaintSheetTitle">
          {t("Оставить жалобу", "Zgłoś skargę")}
        </h2>

        <div className="complaintMeta">
          {context.orderNo ? (
            <p className="complaintMetaRow">
              <span className="complaintMetaKey">
                {t("Заказ", "Zamówienie")}
              </span>
              <span className="complaintMetaVal">#{context.orderNo}</span>
            </p>
          ) : null}
          <p className="complaintMetaRow">
            <span className="complaintMetaKey">{t("Точка", "Punkt")}</span>
            <span className="complaintMetaVal">{context.pointTitle}</span>
          </p>
          <p className="complaintMetaRow">
            <span className="complaintMetaKey">
              {t("Доставка", "Dostawa")}
            </span>
            <span className="complaintMetaVal">{context.deliveryLabel}</span>
          </p>
          <p className="complaintMetaRow">
            <span className="complaintMetaKey">
              {t("Адрес", "Adres")}
            </span>
            <span className="complaintMetaVal">{context.pointAddress}</span>
          </p>
        </div>

        <label className="complaintField">
          <span className="complaintFieldLabel">
            {t("Текст жалобы", "Treść skargi")}
          </span>
          <textarea
            className="complaintTextarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t(
              "Опишите, что пошло не так…",
              "Opisz, co poszło nie tak…"
            )}
            rows={5}
            maxLength={4000}
          />
        </label>

        <div className="complaintAttachments">
          <label className="complaintAttachBtn">
            {t("Прикрепить скрины", "Dołącz zrzuty ekranu")}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={onPickFiles}
            />
          </label>
          {previews.length ? (
            <div className="complaintPreviewGrid">
              {previews.map((src, idx) => (
                <img
                  key={`${src}-${idx}`}
                  src={src}
                  className="complaintPreviewImg"
                  alt=""
                />
              ))}
            </div>
          ) : (
            <p className="complaintAttachHint">
              {t("До 5 фото (JPG, PNG, WebP)", "Do 5 zdjęć (JPG, PNG, WebP)")}
            </p>
          )}
        </div>

        {error ? (
          <p className="complaintError" role="alert">
            {error}
          </p>
        ) : null}

        <div className="complaintActions">
          <button
            type="button"
            className="complaintBtn complaintBtn--ghost"
            disabled={submitting}
            onClick={() => onClose?.()}
          >
            {t("Отмена", "Anuluj")}
          </button>
          <button
            type="button"
            className="complaintBtn complaintBtn--primary"
            disabled={submitting}
            onClick={submit}
          >
            {submitting
              ? t("Отправка…", "Wysyłanie…")
              : t("Отправить", "Wyślij")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
