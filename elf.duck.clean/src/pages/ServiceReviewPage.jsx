import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "../UserContext";
import { t } from "../utils/i18n";
import { haptic } from "../utils/haptics";
import "../styles/ServiceReviewPage.css";

const API_URL =
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_CRM_API_URL ||
  "http://localhost:3000";

export default function ServiceReviewPage() {
  const navigate = useNavigate();
  const { setUser } = useUser();

  const [loading, setLoading] = useState(true);
  const [context, setContext] = useState(null);
  const [step, setStep] = useState("rating");
  const [selectedRating, setSelectedRating] = useState("");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [doneReward, setDoneReward] = useState(null);

  useEffect(() => {
  const tg = window.Telegram?.WebApp;
    tg?.ready?.();
    tg?.expand?.();
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError("");
      try {
        const r = await fetch(`${API_URL}/support/service-review/context`, {
          headers: {
            "x-telegram-init-data": window?.Telegram?.WebApp?.initData || "",
          },
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok || data?.ok === false) {
          throw new Error(data?.error || `HTTP ${r.status}`);
        }
        if (!cancelled) setContext(data);
      } catch (err) {
        console.error("service review context error", err);
        if (!cancelled) {
          setContext({ ok: true, eligible: false });
          setError(
            t(
              "Не удалось загрузить форму отзыва.",
              "Nie udało się wczytać formularza opinii."
            )
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const ratings = useMemo(
    () => (Array.isArray(context?.ratings) ? context.ratings : []),
    [context]
  );

  const minDetails = Number(context?.minDetailsChars || 3);

  const pickRating = (key, needsDetails) => {
    haptic.light();
    setSelectedRating(key);
    setError("");
    if (needsDetails) {
      setStep("details");
    }
  };

  const submitReview = async (rating, detailsText = "") => {
    const ratingKey = String(rating || selectedRating || "").trim();
    if (!ratingKey) return;

    const trimmed = String(detailsText ?? details ?? "").trim();
    const needsDetails = ratingKey !== "great";
    if (needsDetails && trimmed.length < minDetails) {
      setError(
        t(
          `Расскажите подробнее (минимум ${minDetails} символа).`,
          `Napisz więcej (minimum ${minDetails} znaki).`
        )
      );
      haptic.error();
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const r = await fetch(`${API_URL}/support/service-review/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-telegram-init-data": window?.Telegram?.WebApp?.initData || "",
        },
        body: JSON.stringify({
          rating: ratingKey,
          details: trimmed,
        }),
      });

      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data?.ok) {
        throw new Error(data?.error || `HTTP ${r.status}`);
      }

      haptic.success();
      setDoneReward(Number(data?.grantedAmountZl || 0));

      if (Number.isFinite(Number(data?.cashbackBalance))) {
        setUser((prev) =>
          prev
            ? {
                ...prev,
                cashbackBalance: Number(data.cashbackBalance),
              }
            : prev
        );
      }

      setContext((prev) =>
        prev
          ? {
              ...prev,
              completed: true,
              canSubmit: false,
            }
          : prev
      );
      setStep("done");
    } catch (err) {
      console.error("service review submit error", err);
      haptic.error();
      const code = String(err?.message || "");
      if (code === "ALREADY_COMPLETED") {
        setStep("done");
        return;
      }
      setError(
        t(
          "Не удалось отправить отзыв. Попробуйте позже.",
          "Nie udało się wysłać opinii. Spróbuj później."
        )
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="serviceReviewPage">
        <div className="serviceReviewLoading">
          {t("Загрузка…", "Ładowanie…")}
        </div>
      </div>
    );
  }

  if (!context?.eligible && !context?.completed) {
    return (
      <div className="serviceReviewPage">
        <div className="serviceReviewDone">
          <p className="serviceReviewDoneTitle">
            {t("Оценка недоступна", "Ocena niedostępna")}
          </p>
          <p className="serviceReviewDoneText">
            {t(
              "Ссылка активна после первого заказа, когда придёт сообщение от бота.",
              "Link jest aktywny po pierwszym zamówieniu, gdy bot wyśle wiadomość."
            )}
          </p>
          <button
            type="button"
            className="serviceReviewSubmit"
            style={{ marginTop: 16 }}
            onClick={() => navigate("/")}
          >
            {t("В магазин", "Do sklepu")}
          </button>
        </div>
      </div>
    );
  }

  if (context?.completed || step === "done") {
    const reward = doneReward ?? context?.rewardZl ?? 15;
    return (
      <div className="serviceReviewPage">
        <div className="serviceReviewDone">
          <p className="serviceReviewHeroEmoji">💚</p>
          <p className="serviceReviewDoneTitle">
            {t("Спасибо за отзыв!", "Dziękujemy za opinię!")}
          </p>
          <p className="serviceReviewDoneText">
            {t(
              `На баланс кэшбека начислено ${reward} zł.`,
              `Na saldo cashback dodano ${reward} zł.`
            )}
          </p>
          <button
            type="button"
            className="serviceReviewSubmit"
            style={{ marginTop: 16 }}
            onClick={() => navigate("/")}
          >
            {t("Продолжить покупки", "Kontynuuj zakupy")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="serviceReviewPage">
      <div className="serviceReviewHero">
        <div className="serviceReviewHeroEmoji">💬</div>
        <h1 className="serviceReviewTitle">
          {t("Как вам наш сервис?", "Jak oceniasz nasz serwis?")}
        </h1>
        <p className="serviceReviewSubtitle">
          {t(
            "Выберите оценку — за отзыв начислим 15 zł на кэшбек.",
            "Wybierz ocenę — za opinię dodamy 15 zł cashback."
          )}
        </p>
      </div>

      {(context?.pointTitle || context?.orderNo) && (
        <div className="serviceReviewMeta">
          {context?.orderNo ? (
            <div>
              {t("Заказ", "Zamówienie")}: #{context.orderNo}
            </div>
          ) : null}
          {context?.pointTitle ? (
            <div>
              {t("Точка", "Punkt")}: {context.pointTitle}
            </div>
          ) : null}
        </div>
      )}

      {step === "rating" && (
        <div className="serviceReviewOptions">
          {ratings.map((row) => (
            <button
              key={row.key}
              type="button"
              className={`serviceReviewOption${
                selectedRating === row.key ? " serviceReviewOptionSelected" : ""
              }`}
              disabled={submitting}
              onClick={() => {
                if (row.key === "great" && !row.needsDetails) {
                  setSelectedRating(row.key);
                  submitReview(row.key, "");
                  return;
                }
                pickRating(row.key, row.needsDetails);
              }}
            >
              <span className="serviceReviewOptionEmoji" aria-hidden>
                {row.emoji}
              </span>
              {row.label}
            </button>
          ))}
        </div>
      )}

      {step === "details" && (
        <>
          <textarea
            className="serviceReviewTextarea"
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder={t(
              "Расскажите, что понравилось и что можно улучшить…",
              "Napisz, co się podobało i co można poprawić…"
            )}
            maxLength={4000}
          />
          <button
            type="button"
            className="serviceReviewSubmit"
            disabled={submitting}
            onClick={() => submitReview(selectedRating, details)}
          >
            {submitting
              ? t("Отправка…", "Wysyłanie…")
              : t("Отправить и получить 15 zł", "Wyślij i odbierz 15 zł")}
          </button>
          <button
            type="button"
            className="serviceReviewOption"
            style={{ marginTop: 10 }}
            disabled={submitting}
            onClick={() => setStep("rating")}
          >
            {t("← Назад", "← Wróć")}
          </button>
        </>
      )}

      {error ? <p className="serviceReviewError">{error}</p> : null}
    </div>
  );
}
