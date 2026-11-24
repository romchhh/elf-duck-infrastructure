import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { setCurrentLanguage } from "../utils/i18n";
import { haptic } from "../utils/haptics";
import { getCachedGiveawayBannerSrc } from "../utils/bannerImageCache.js";
import "../styles/ServiceReviewPage.css";

const API_URL =
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_CRM_API_URL ||
  "http://localhost:3000";

const COPY = {
  ru: {
    loading: "Загрузка…",
    badge: "Розыгрыш Elf Duck",
    title: "Оцени наш сервис",
    subtitle:
      "Ты уже в розыгрыше на 2 000 zł. Короткий отзыв поможет нам стать лучше — без бонусов, просто честная оценка.",
    unavailableTitle: "Оценка недоступна",
    unavailableText: "Открой ссылку из сообщения о розыгрыше в Telegram.",
    toShop: "В магазин",
    thanks: "Спасибо за отзыв!",
    thanksText: "Мы получили твою оценку. Удачи в розыгрыше!",
    continueShopping: "Продолжить покупки",
    month: "Месяц",
    prize: "Призовой фонд",
    winners: "Победителей",
    detailsHint: "Расскажи подробнее — что улучшить?",
    detailsPlaceholder: "Пара слов о сервисе…",
    detailsShort: (n) => `Напиши чуть подробнее (минимум ${n} символа).`,
    submit: "Отправить отзыв",
    submitting: "Отправка…",
    back: "← Назад к оценкам",
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
    badge: "Losowanie Elf Duck",
    title: "Oceń nasz serwis",
    subtitle:
      "Już bierzesz udział w losowaniu 2 000 zł. Krótka opinia pomoże nam się poprawić — bez bonusów, tylko szczera ocena.",
    unavailableTitle: "Ocena niedostępna",
    unavailableText: "Otwórz link z wiadomości o losowaniu w Telegramie.",
    toShop: "Do sklepu",
    thanks: "Dziękujemy za opinię!",
    thanksText: "Otrzymaliśmy Twoją ocenę. Powodzenia w losowaniu!",
    continueShopping: "Kontynuuj zakupy",
    month: "Miesiąc",
    prize: "Pula nagród",
    winners: "Zwycięzców",
    detailsHint: "Napisz więcej — co poprawić?",
    detailsPlaceholder: "Kilka słów o serwisie…",
    detailsShort: (n) => `Napisz więcej (minimum ${n} znaki).`,
    submit: "Wyślij opinię",
    submitting: "Wysyłanie…",
    back: "← Wróć do ocen",
    loadError: "Nie udało się wczytać formularza opinii.",
    submitError: "Nie udało się wysłać opinii. Spróbuj później.",
    ratings: {
      great: "Wszystko super, podobało mi się!",
      good: "Ogólnie dobrze, ale jest co poprawić",
      bad: "Nie podobało mi się",
    },
  },
};

const RATING_META = {
  great: { emoji: "😍" },
  good: { emoji: "😐" },
  bad: { emoji: "😞" },
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

export default function GiveawayReviewPage() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [context, setContext] = useState(null);
  const [lang, setLang] = useState("ru");
  const [step, setStep] = useState("rating");
  const [selectedRating, setSelectedRating] = useState("");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const copy = useMemo(() => copyFor(lang), [lang]);
  const bannerSrc = getCachedGiveawayBannerSrc(lang);

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
        const r = await fetch(`${API_URL}/giveaway/review/context`, {
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
        if (data?.completed) setStep("done");
      } catch (err) {
        console.error("giveaway review context error", err);
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

  const ratings = useMemo(
    () =>
      ["great", "good", "bad"].map((key) => ({
        key,
        emoji: RATING_META[key].emoji,
        label: copy.ratings[key],
        needsDetails: key !== "great",
      })),
    [copy]
  );

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
      const r = await fetch(`${API_URL}/giveaway/review`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-telegram-init-data": window?.Telegram?.WebApp?.initData || "",
        },
        body: JSON.stringify({
          rating: ratingKey,
          details: trimmed,
          monthKey: context?.monthKey || "",
        }),
      });

      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data?.ok) {
        if (String(data?.error || "") === "ALREADY_SUBMITTED") {
          setStep("done");
          return;
        }
        throw new Error(data?.error || `HTTP ${r.status}`);
      }

      haptic.success();
      setContext((prev) =>
        prev ? { ...prev, completed: true, canSubmit: false } : prev
      );
      setStep("done");
    } catch (err) {
      console.error("giveaway review submit error", err);
      haptic.error();
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
    return shell(<div className="serviceReviewLoading">{copy.loading}</div>);
  }

  if (!context?.eligible && !context?.completed) {
    return shell(
      <>
        <div className="serviceReviewBanner">
          <img src={bannerSrc} alt="" />
        </div>
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
      </>
    );
  }

  if (context?.completed || step === "done") {
    return shell(
      <>
        <div className="serviceReviewBanner">
          <img src={bannerSrc} alt="" />
        </div>
        <div className="serviceReviewDone">
          <div className="serviceReviewDoneEmoji">💚</div>
          <p className="serviceReviewDoneTitle">{copy.thanks}</p>
          <p className="serviceReviewDoneText">{copy.thanksText}</p>
          <button
            type="button"
            className="serviceReviewSubmit"
            onClick={() => navigate("/")}
          >
            {copy.continueShopping}
          </button>
        </div>
      </>
    );
  }

  return shell(
    <>
      <div className="serviceReviewBanner">
        <img src={bannerSrc} alt="" />
      </div>

      <div className="serviceReviewHero">
        <div className="serviceReviewBadge">{copy.badge}</div>
        <h1 className="serviceReviewTitle">{copy.title}</h1>
        <p className="serviceReviewSubtitle">{copy.subtitle}</p>
      </div>

      <div className="serviceReviewMeta">
        {context?.monthLabel ? (
          <div>
            {copy.month}: {context.monthLabel}
          </div>
        ) : null}
        <div>
          {copy.prize}: {Number(context?.prizePoolZl || 2000)} zł
        </div>
        <div>
          {copy.winners}: {Number(context?.winnerCount || 25)}
        </div>
      </div>

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
