import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import doneIcon from "../assets/doneIcon.webp";
import { appPath } from "../utils/appMode.js";
import { getCurrentLanguage, t } from "../utils/i18n";
import { haptic } from "../utils/haptics";
import { getCachedGiveawayBannerSrc } from "../utils/bannerImageCache.js";
import "../styles/GiveawayBanner.css";
import GiveawayRulesContent from "./GiveawayRulesContent.jsx";

export const GIVEAWAY_TEST_PREVIEWS = ["join", "joined", "countdown", "winners"];

import {
  fetchGiveawayCurrent,
  getGiveawayCache,
  participateGiveaway,
  subscribeGiveaway,
} from "../utils/giveawayPublicState.js";

function formatCountdown(ms, lang) {
  const totalSec = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const pad = (n) => String(n).padStart(2, "0");
  const clock = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  if (days <= 0) return clock;

  if (lang === "pl") {
    const dayWord =
      days === 1 ? "dzień" : days >= 2 && days <= 4 ? "dni" : "dni";
    return `${days} ${dayWord} ${clock}`;
  }

  const mod10 = days % 10;
  const mod100 = days % 100;
  let dayWord = "дней";
  if (mod10 === 1 && mod100 !== 11) dayWord = "день";
  else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    dayWord = "дня";
  }
  return `${days} ${dayWord} ${clock}`;
}

function msUntilNextContestStart(now = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour12: false,
  });
  const map = {};
  for (const part of fmt.formatToParts(now)) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  let year = Number(map.year);
  let month = Number(map.month) + 1;
  if (month > 12) {
    month = 1;
    year += 1;
  }
  const stamp = `${year}-${String(month).padStart(2, "0")}-01T00:00:00`;
  const plus1 = Date.parse(`${stamp}+01:00`);
  const probe = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Warsaw",
    day: "2-digit",
    month: "2-digit",
    hour12: false,
  }).formatToParts(new Date(plus1));
  const probeMap = {};
  for (const part of probe) {
    if (part.type !== "literal") probeMap[part.type] = part.value;
  }
  const target =
    Number(probeMap.day) === 1 && Number(probeMap.month) === month
      ? plus1
      : Date.parse(`${stamp}+02:00`);
  return Math.max(0, target - now.getTime());
}

function formatWinnerLabel(winner = {}) {
  const username = String(winner.username || "").trim().replace(/^@/, "");
  if (username) return `@${username}`;
  const name = [winner.firstName, winner.lastName]
    .map((p) => String(p || "").trim())
    .filter(Boolean)
    .join(" ");
  if (name) return name;
  const tg = String(winner.telegramId || "").trim();
  if (tg.length >= 4) return `ID …${tg.slice(-4)}`;
  return "—";
}

function formatAmountZl(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "0 zł";
  return `${n.toLocaleString("pl-PL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} zł`;
}

function GiveawayModalShell({ open, onClose, title, children }) {
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

export default function GiveawayBannerSlide({ onGoToCatalog, preview = "" }) {
  const navigate = useNavigate();
  const lang = getCurrentLanguage();
  const [state, setState] = useState(() => getGiveawayCache());
  const [deadlineAt, setDeadlineAt] = useState(() => {
    const cached = getGiveawayCache();
    return cached?.ok
      ? Date.now() + Number(cached.countdownMs || 0)
      : null;
  });
  const [loading, setLoading] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [winnersOpen, setWinnersOpen] = useState(false);
  const [tick, setTick] = useState(Date.now());

  const applyState = useCallback((data) => {
    if (!data?.ok) return;
    setState(data);
    setDeadlineAt(Date.now() + Number(data.countdownMs || 0));
  }, []);

  useEffect(() => {
    if (preview) return undefined;
    return subscribeGiveaway(applyState);
  }, [preview, applyState]);

  const reload = useCallback(() => {
    if (preview) return;
    fetchGiveawayCurrent({ force: true }).then((data) => {
      if (data?.ok) applyState(data);
    });
  }, [preview, applyState]);

  const phase = state?.phase || "active";
  const myEntriesLive = Number(state?.myEntries || 0);
  /** Натиснув «Участвовать» (joined або legacy participated). */
  const hasJoined =
    Boolean(state?.joined) || Boolean(state?.participated);
  /** «Вы участвуете» — лише з ≥1 замовленням. */
  const activelyParticipating =
    myEntriesLive > 0 &&
    (Boolean(state?.activelyParticipating) || hasJoined);
  const winners = Array.isArray(state?.winners) ? state.winners : [];
  const participationOpen = state
    ? Boolean(state.participationOpen) && phase === "active"
    : true;
  const resultsReady =
    phase === "results" ||
    ["drawn", "credited", "notified"].includes(String(state?.status || ""));

  const liveMode = resultsReady
    ? "winners"
    : state && !participationOpen
      ? "countdown"
      : activelyParticipating
        ? "joined"
        : hasJoined
          ? "needOrder"
          : "join";
  const mode = preview || liveMode;

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
    if (preview || (mode !== "joined" && mode !== "winners")) return undefined;
    const id = window.setInterval(reload, 45_000);
    return () => window.clearInterval(id);
  }, [reload, mode, preview]);

  useEffect(() => {
    if (preview) return undefined;
    const onVisible = () => {
      if (document.visibilityState === "visible") reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [reload, preview]);

  useEffect(() => {
    if (mode !== "countdown") return undefined;
    const id = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [mode]);

  const rulesText =
    lang === "pl"
      ? state?.rulesPl || state?.rules
      : state?.rulesRu || state?.rules;

  const countdownLabel = useMemo(() => {
    const remaining = deadlineAt
      ? Math.max(0, deadlineAt - Date.now())
      : msUntilNextContestStart(new Date(tick));
    return formatCountdown(remaining, lang);
  }, [deadlineAt, tick, lang]);

  const orderCount =
    mode === "joined" && preview && Number(state?.myEntries || 0) <= 0
      ? 3
      : Number(state?.myEntries || 0);

  const displayWinners =
    winners.length > 0
      ? winners
      : preview === "winners"
        ? [
            {
              place: 1,
              amountZl: 1000,
              username: "winner_one",
              firstName: "Alex",
            },
            {
              place: 2,
              amountZl: 600,
              username: "winner_two",
              firstName: "Kate",
            },
            {
              place: 3,
              amountZl: 400,
              firstName: "Ivan",
              lastName: "K.",
            },
          ]
        : [];

  const participate = async (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (loading || preview) return;
    setLoading(true);
    try {
      const data = await participateGiveaway();
      if (data?.ok) {
        haptic.success();
        applyState(data);
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

  const handleBannerActivate = (event) => {
    if (event.target.closest(".giveawayInfoBtn")) return;
    if (event.target.closest("button")) return;
    if (event.target.closest(".giveawayCtaSlot")) return;
    if (preview || loading) return;
    haptic.heavy();
    goToCatalog();
  };

  const openRules = (event) => {
    event.stopPropagation();
    haptic.light();
    setRulesOpen(true);
  };

  const openWinners = (event) => {
    event.stopPropagation();
    haptic.light();
    setWinnersOpen(true);
  };

  return (
    <>
      <div
        className={`giveawayBannerRoot${
          loading ? " giveawayBannerRoot--loading" : ""
        }`}
        onClick={handleBannerActivate}
      >
        <img
          src={getCachedGiveawayBannerSrc(lang)}
          alt=""
          className="giveawayBannerBg"
          draggable={false}
          decoding="async"
          fetchpriority="high"
        />

        <button
          type="button"
          className="giveawayInfoBtn"
          aria-label={t("Правила розыгрыша", "Zasady losowania")}
          onClick={openRules}
        >
          <span className="giveawayInfoBtnGlyph" aria-hidden>
            i
          </span>
        </button>

        <div
          className={`giveawayCtaSlot${
            mode === "joined" || mode === "countdown"
              ? " giveawayCtaSlot--compact"
              : ""
          }`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {mode === "joined" ? (
            <div className="giveawayCtaCard giveawayCtaCard--joined">
              <span className="giveawayCtaLine giveawayCtaLine--joinedTop">
                {t("Вы участвуете", "Bierzesz udział")}
                <span className="giveawayCtaCheck" aria-hidden>
                  <img src={doneIcon} className="giveawayCtaCheckIcon" alt="" />
                </span>
              </span>
              <span className="giveawayCtaLine">
                {t("Ваших заказов:", "Twoich zamówień:")}{" "}
                <b className="giveawayCtaCount">{orderCount}</b>
              </span>
            </div>
          ) : mode === "countdown" ? (
            <div className="giveawayCtaCard giveawayCtaCard--countdown">
              <span className="giveawayCtaLine giveawayCtaLine--white">
                {t("До старта", "Do startu")}
              </span>
              <b className="giveawayCtaTime">{countdownLabel}</b>
            </div>
          ) : mode === "winners" ? (
            <button
              type="button"
              className="giveawayJoinBtn giveawayWinnersBtn"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={openWinners}
            >
              {t("ПОБЕДИТЕЛИ", "ZWYCIĘZCY")}
            </button>
          ) : mode === "needOrder" ? (
            <button
              type="button"
              className="giveawayJoinBtn"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                haptic.heavy();
                goToCatalog();
              }}
            >
              {t("Сделайте заказ", "Złóż zamówienie")}
            </button>
          ) : (
            <button
              type="button"
              className="giveawayJoinBtn"
              disabled={loading}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={participate}
            >
              {loading
                ? t("Секунду…", "Chwila…")
                : t("Участвовать", "Weź udział")}
            </button>
          )}
        </div>
      </div>

      <GiveawayModalShell
        open={rulesOpen}
        onClose={() => setRulesOpen(false)}
        title={t("Правила розыгрыша", "Zasady losowania")}
      >
        <GiveawayRulesContent rulesText={rulesText} />
      </GiveawayModalShell>

      <GiveawayModalShell
        open={winnersOpen}
        onClose={() => setWinnersOpen(false)}
        title={t("Победители розыгрыша", "Zwycięzcy konkursu")}
      >
        {displayWinners.length ? (
          <ol className="giveawayWinnersList">
            {displayWinners.map((winner) => (
              <li
                key={`${winner.place}-${winner.telegramId || winner.username || winner.firstName}`}
                className="giveawayWinnersItem"
              >
                <span className="giveawayWinnersPlace">
                  {Number(winner.place) || "—"}
                </span>
                <span className="giveawayWinnersMeta">
                  <span className="giveawayWinnersName">
                    {formatWinnerLabel(winner)}
                  </span>
                  <span className="giveawayWinnersPrize">
                    {formatAmountZl(winner.amountZl)}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="giveawayWinnersEmpty">
            {t(
              "Список победителей скоро появится.",
              "Lista zwycięzców wkrótce się pojawi."
            )}
          </p>
        )}
      </GiveawayModalShell>
    </>
  );
}
