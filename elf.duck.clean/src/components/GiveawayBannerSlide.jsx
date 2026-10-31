import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import giveawayBannerPl from "../assets/giveawayBannerPl.webp";
import giveawayBannerUk from "../assets/giveawayBannerUk.webp";
import { appPath } from "../utils/appMode.js";
import { getCurrentLanguage, t } from "../utils/i18n";
import { haptic } from "../utils/haptics";
import "../styles/GiveawayBanner.css";

const API_URL =
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_CRM_API_URL ||
  "http://localhost:3000";

function formatCountdown(ms) {
  const total = Math.max(0, Number(ms || 0));
  const days = Math.floor(total / 86400000);
  const hours = Math.floor((total % 86400000) / 3600000);
  const minutes = Math.floor((total % 3600000) / 60000);
  return `${days}d ${hours}h ${minutes}m`;
}

function GiveawayModal({ open, onClose, title, children }) {
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="giveawayModalBackdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="giveawayModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="giveawayModalTitle"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="giveawayModalTitle">{title}</h3>
        {children}
        <button
          type="button"
          className="giveawayPrimaryBtn giveawayModalCloseBtn"
          onClick={onClose}
        >
          OK
        </button>
      </div>
    </div>,
    document.body
  );
}

export default function GiveawayBannerSlide({ onGoToCatalog }) {
  const navigate = useNavigate();
  const lang = getCurrentLanguage();
  const bg = lang === "pl" ? giveawayBannerPl : giveawayBannerUk;
  const [state, setState] = useState(null);
  const [deadlineAt, setDeadlineAt] = useState(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [winnersOpen, setWinnersOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(Date.now());

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/giveaway/current`, {
        headers: {
          "x-telegram-init-data": window?.Telegram?.WebApp?.initData || "",
        },
      });
      const data = await r.json();
      if (data?.ok) {
        setState(data);
        setDeadlineAt(Date.now() + Number(data.countdownMs || 0));
      }
    } catch (error) {
      console.error("giveaway load error", error);
    }
  }, []);

  const phase = state?.phase || "active";
  const participated = Boolean(state?.participated);
  const showResults = useMemo(
    () =>
      phase === "results" ||
      state?.status === "drawn" ||
      state?.status === "credited" ||
      state?.status === "notified",
    [phase, state?.status]
  );

  const goToCatalog = useCallback(() => {
    if (typeof onGoToCatalog === "function") {
      onGoToCatalog();
      return;
    }
    navigate(appPath("/"), {
      state: { openCatalogView: "all", scrollToCatalog: true },
    });
  }, [navigate, onGoToCatalog]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!participated || showResults) return undefined;
    const id = window.setInterval(load, 45_000);
    return () => window.clearInterval(id);
  }, [load, participated, showResults]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => setTick(Date.now()), 60000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!rulesOpen && !winnersOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [rulesOpen, winnersOpen]);

  const countdownLabel = useMemo(() => {
    if (!deadlineAt) return "—";
    return formatCountdown(Math.max(0, deadlineAt - Date.now()));
  }, [deadlineAt, tick]);

  const participate = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const r = await fetch(`${API_URL}/giveaway/participate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-telegram-init-data": window?.Telegram?.WebApp?.initData || "",
        },
        body: JSON.stringify({}),
      });
      const data = await r.json();
      if (data?.ok) {
        haptic.success();
        setState(data);
        setDeadlineAt(Date.now() + Number(data.countdownMs || 0));
      } else {
        haptic.error();
      }
    } catch (error) {
      console.error("giveaway participate error", error);
      haptic.error();
    } finally {
      setLoading(false);
    }
  };

  const handleBannerActivate = async (event) => {
    if (event.target.closest(".giveawayInfoHit")) return;
    if (event.target.closest("button")) return;

    haptic.heavy();

    if (
      !showResults &&
      !participated &&
      state?.participationOpen &&
      !loading
    ) {
      await participate();
    }

    goToCatalog();
  };

  const rulesText =
    lang === "pl" ? state?.rulesPl || state?.rules : state?.rulesRu || state?.rules;

  return (
    <>
      <div
        className={`giveawayBannerRoot giveawayBannerRoot--actionable${loading ? " giveawayBannerRoot--loading" : ""}`}
        onClick={handleBannerActivate}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleBannerActivate(e);
          }
        }}
      >
        <img src={bg} alt="" className="giveawayBannerBg" draggable={false} />

        {showResults ? (
          <div className="giveawayStatusChip">
            <button
              type="button"
              className="giveawayPrimaryBtn"
              onClick={(e) => {
                e.stopPropagation();
                setWinnersOpen(true);
              }}
            >
              {t("Победители", "Zwycięzcy")}
            </button>
            <span className="giveawayStat">
              {t("До нового розыгрыша", "Do nowego konkursu")}
              <b>{countdownLabel}</b>
            </span>
          </div>
        ) : participated ? (
          <div className="giveawayStatusChip giveawayStatusChip--side">
            <span className="giveawayStat">
              {t("Ваши покупки", "Twoje zakupy")}
              <b>{state?.myEntries ?? 0}</b>
            </span>
            <span className="giveawayStat">
              {t("Участников", "Uczestników")}
              <b>{state?.participantsCount ?? 0}</b>
            </span>
          </div>
        ) : null}

        <button
          type="button"
          className="giveawayInfoHit"
          aria-label={t("Правила", "Zasady")}
          onClick={(e) => {
            e.stopPropagation();
            setRulesOpen(true);
          }}
        />
      </div>

      <GiveawayModal
        open={rulesOpen}
        onClose={() => setRulesOpen(false)}
        title={t("Правила розыгрыша", "Zasady konkursu")}
      >
        <pre className="giveawayRulesText">{rulesText || "…"}</pre>
      </GiveawayModal>

      <GiveawayModal
        open={winnersOpen}
        onClose={() => setWinnersOpen(false)}
        title={t("Победители", "Zwycięzcy")}
      >
        <div className="giveawayWinnersList">
          {(state?.winners || []).map((row) => (
            <div key={row.place} className="giveawayWinnerRow">
              <span>#{row.place}</span>
              <span>
                {row.username
                  ? `@${row.username}`
                  : row.firstName || row.telegramId}
              </span>
              <span>{row.amountZl} zł</span>
            </div>
          ))}
        </div>
      </GiveawayModal>
    </>
  );
}
