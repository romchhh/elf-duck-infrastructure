import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "../UserContext";
import { setCurrentLanguage } from "../utils/i18n";
import { haptic } from "../utils/haptics";
import "../styles/ServiceReviewPage.css";

const API_URL =
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_CRM_API_URL ||
  "http://localhost:3000";

const COPY = {
  ru: {
    loading: "Загрузка…",
    badge: "15 zł на кэшбек",
    title: "Как вам наш сервис?",
    subtitle: "Выберите оценку — после отзыва сразу начислим 15 zł на баланс.",
    unavailableTitle: "Оценка недоступна",
    unavailableText:
      "Ссылка активна после первого заказа, когда придёт сообщение от бота.",
    toShop: "В магазин",
    thanks: "Спасибо за отзыв!",
    rewarded: (zl) => `На баланс кэшбека начислено ${zl} zł.`,
    continueShopping: "Продолжить покупки",
    order: "Заказ",
    point: "Точка",
    detailsHint: "Расскажите подробнее — что можно улучшить?",
    detailsPlaceholder: "Напишите пару слов о заказе…",
    detailsShort: (n) => `Расскажите подробнее (минимум ${n} символа).`,
    submit: "Отправить и получить 15 zł",
    submitting: "Отправка…",
    back: "← Назад",
    loadError: "Не удалось загрузить форму отзыва.",
    submitError: "Не удалось отправить отзыв. Попробуйте позже.",
    ratings: {
      great: "Всё супер, понравилось!",
      good: "В целом хорошо, но есть что улучшить",
      bad: "Не понравилось",
    },
  },
  pl: {
    loading: "Ładowanie…",
    badge: "15 zł cashback",
    title: "Jak oceniasz nasz serwis?",
    subtitle:
      "Wybierz ocenę — po wysłaniu od razu dodamy 15 zł na Twój bilans.",
    unavailableTitle: "Ocena niedostępna",
    unavailableText:
      "Link jest aktywny po pierwszym zamówieniu, gdy bot wyśle wiadomość.",
    toShop: "Do sklepu",
    thanks: "Dziękujemy za opinię!",
    rewarded: (zl) => `Na saldo cashback dodano ${zl} zł.`,
    continueShopping: "Kontynuuj zakupy",
    order: "Zamówienie",
    point: "Punkt",
    detailsHint: "Napisz więcej — co możemy poprawić?",
    detailsPlaceholder: "Kilka słów o zamówieniu…",
    detailsShort: (n) => `Napisz więcej (minimum ${n} znaki).`,
    submit: "Wyślij i odbierz 15 zł",
    submitting: "Wysyłanie…",
    back: "← Wróć",
    loadError: "Nie udało się wczytać formularza opinii.",
    submitError: "Nie udało się wysłać opinii. Spróbuj później.",
    ratings: {
      great: "Wszystko super, podobało mi się!",
      good: "Ogólnie dobrze, ale jest co poprawić",
      bad: "Nie podobało mi się",
    },
  },
};

function copyFor(lang) {
  return COPY[lang === "pl" ? "pl" : "ru"];
}

function paintTelegramChrome() {
  const tg = window.Telegram?.WebApp;
  try {
    tg?.ready?.();
    tg?.expand?.();
    tg?.setHeaderColor?.("#000000");
    tg?.setBackgroundColor?.("#000000");
    tg?.setBottomBarColor?.("#000000");
  } catch {
    // older clients
  }
  document.documentElement.style.background = "#000";
  document.body.style.background = "#000";
  const root = document.getElementById("root");
  if (root) root.style.background = "#000";
}

export default function ServiceReviewPage() {
  const navigate = useNavigate();
  const { setUser } = useUser();

  const [loading, setLoading] = useState(true);
  const [context, setContext] = useState(null);
  const [lang, setLang] = useState("ru");
  const [step, setStep] = useState("rating");
  const [selectedRating, setSelectedRating] = useState("");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [doneReward, setDoneReward] = useState(null);

  const copy = useMemo(() => copyFor(lang), [lang]);

  useEffect(() => {
    paintTelegramChrome();
    return () => {
      document.documentElement.style.background = "";
      document.body.style.background = "";
    };
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
        if (cancelled) return;

        const nextLang = data?.language === "pl" ? "pl" : "ru";
        setLang(nextLang);
        setCurrentLanguage(nextLang);
        setContext(data);
      } catch (err) {
        console.error("service review context error", err);
        if (!cancelled) {
          setContext({ ok: true, eligible: false });
          setError(copyFor(lang).loadError);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const ratings = useMemo(() => {
    const keys = ["great", "good", "bad"];
    const emojis = { great: "🤩", good: "🙂", bad: "😕" };
    return keys.map((key) => ({
      key,
      emoji: emojis[key],
      label: copy.ratings[key],
      needsDetails: key !== "great",
    }));
  }, [copy]);

  const minDetails = Number(context?.minDetailsChars || 3);

  const pickRating = (key, needsDetails) => {
    haptic.light();
    setSelectedRating(key);
    setError("");
    if (needsDetails) setStep("details");
  };

  const submitReview = async (rating, detailsText = "") => {
    const ratingKey = String(rating || selectedRating || "").trim();
    if (!ratingKey) return;

    const trimmed = String(detailsText ?? details ?? "").trim();
    if (ratingKey !== "great" && trimmed.length < minDetails) {
      setError(copy.detailsShort(minDetails));
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
            ? { ...prev, cashbackBalance: Number(data.cashbackBalance) }
            : prev
        );
      }

      setContext((prev) =>
        prev ? { ...prev, completed: true, canSubmit: false } : prev
      );
      setStep("done");
    } catch (err) {
      console.error("service review submit error", err);
      haptic.error();
      if (String(err?.message || "") === "ALREADY_COMPLETED") {
        setStep("done");
        return;
      }
      setError(copy.submitError);
    } finally {
      setSubmitting(false);
    }
  };

  const shell = (children) => (
    <div className="serviceReviewPage">
      <div className="serviceReviewInner">{children}</div>
    </div>
  );

  if (loading) {
    return shell(
      <div className="serviceReviewLoading">{copy.loading}</div>
    );
  }

  if (!context?.eligible && !context?.completed) {
    return shell(
      <div className="serviceReviewDone">
        <div className="serviceReviewDoneEmoji">👀</div>
        <p className="serviceReviewDoneTitle">{copy.unavailableTitle}</p>
        <p className="serviceReviewDoneText">{copy.unavailableText}</p>
        <button
          type="button"
          className="serviceReviewSubmit"
          onClick={() => navigate("/")}
        >
          {copy.toShop}
        </button>
      </div>
    );
  }

  if (context?.completed || step === "done") {
    const reward = doneReward ?? context?.rewardZl ?? 15;
    return shell(
      <div className="serviceReviewDone">
        <div className="serviceReviewDoneEmoji">💚</div>
        <p className="serviceReviewDoneTitle">{copy.thanks}</p>
        <p className="serviceReviewDoneText">{copy.rewarded(reward)}</p>
        <button
          type="button"
          className="serviceReviewSubmit"
          onClick={() => navigate("/")}
        >
          {copy.continueShopping}
        </button>
      </div>
    );
  }

  return shell(
    <>
      <div className="serviceReviewHero">
        <div className="serviceReviewBadge">💸 {copy.badge}</div>
        <h1 className="serviceReviewTitle">{copy.title}</h1>
        <p className="serviceReviewSubtitle">{copy.subtitle}</p>
      </div>

      {(context?.pointTitle || context?.orderNo) && (
        <div className="serviceReviewMeta">
          {context?.orderNo ? (
            <div>
              {copy.order}: #{context.orderNo}
            </div>
          ) : null}
          {context?.pointTitle ? (
            <div>
              {copy.point}: {context.pointTitle}
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
              <span className="serviceReviewOptionLabel">{row.label}</span>
              <span className="serviceReviewOptionArrow" aria-hidden>
                ›
              </span>
            </button>
          ))}
        </div>
      )}

      {step === "details" && (
        <>
          <p className="serviceReviewDetailsHead">{copy.detailsHint}</p>
          <textarea
            className="serviceReviewTextarea"
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder={copy.detailsPlaceholder}
            maxLength={4000}
            autoFocus
          />
          {error ? <p className="serviceReviewError">{error}</p> : null}
          <div className="serviceReviewActions">
            <button
              type="button"
              className="serviceReviewSubmit"
              disabled={submitting}
              onClick={() => submitReview(selectedRating, details)}
            >
              {submitting ? copy.submitting : copy.submit}
            </button>
            <button
              type="button"
              className="serviceReviewBack"
              disabled={submitting}
              onClick={() => {
                setStep("rating");
                setError("");
              }}
            >
              {copy.back}
            </button>
          </div>
        </>
      )}

      {step === "rating" && error ? (
        <p className="serviceReviewError">{error}</p>
      ) : null}
    </>
  );
}
