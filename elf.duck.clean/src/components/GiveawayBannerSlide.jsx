import { useCallback, useEffect, useMemo, useState } from "react";
import giveawayBannerPl from "../assets/giveawayBannerPl.png";
import giveawayBannerUk from "../assets/giveawayBannerUk.png";
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

export default function GiveawayBannerSlide() {
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

  const rulesText =
    lang === "pl" ? state?.rulesPl || state?.rules : state?.rulesRu || state?.rules;

  return (
    <div className="giveawayBannerRoot">
      <img src={bg} alt="" className="giveawayBannerBg" />
      <div className="giveawayBannerOverlay">
        <button
          type="button"
          className="giveawayInfoBtn"
          aria-label={t("Правила", "Zasady")}
          onClick={() => setRulesOpen(true)}
        >
          i
        </button>

        <div className="giveawayBannerActions">
          {showResults ? (
            <>
              <button
                type="button"
                className="giveawayPrimaryBtn"
                onClick={() => setWinnersOpen(true)}
              >
                {t("Победители", "Zwycięzcy")}
              </button>
              <div className="giveawayMetaLine">
                {t("До нового розыгрыша", "Do nowego konkursu")}: {countdownLabel}
              </div>
            </>
          ) : participated ? (
            <div className="giveawayStats">
              <span>
                {t("Ваши покупки", "Twoje zakupy")}: {state?.myEntries ?? 0}
              </span>
              <span>
                {t("Участников", "Uczestników")}: {state?.participantsCount ?? 0}
              </span>
            </div>
          ) : (
            <button
              type="button"
              className="giveawayPrimaryBtn"
              disabled={loading || !state?.participationOpen}
              onClick={participate}
            >
              {loading
                ? t("…", "…")
                : t("Участвовать", "Weź udział")}
            </button>
          )}
        </div>
      </div>

      {rulesOpen ? (
        <div className="giveawayModalBackdrop" onClick={() => setRulesOpen(false)}>
          <div className="giveawayModal" onClick={(e) => e.stopPropagation()}>
            <h3>{t("Правила розыгрыша", "Zasady konkursu")}</h3>
            <pre className="giveawayRulesText">{rulesText || "…"}</pre>
            <button type="button" className="giveawayPrimaryBtn" onClick={() => setRulesOpen(false)}>
              OK
            </button>
          </div>
        </div>
      ) : null}

      {winnersOpen ? (
        <div className="giveawayModalBackdrop" onClick={() => setWinnersOpen(false)}>
          <div className="giveawayModal" onClick={(e) => e.stopPropagation()}>
            <h3>{t("Победители", "Zwycięzcy")}</h3>
            <div className="giveawayWinnersList">
              {(state?.winners || []).map((row) => (
                <div key={row.place} className="giveawayWinnerRow">
                  <span>#{row.place}</span>
                  <span>
                    {row.username ? `@${row.username}` : row.firstName || row.telegramId}
                  </span>
                  <span>{row.amountZl} zł</span>
                </div>
              ))}
            </div>
            <button type="button" className="giveawayPrimaryBtn" onClick={() => setWinnersOpen(false)}>
              OK
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
