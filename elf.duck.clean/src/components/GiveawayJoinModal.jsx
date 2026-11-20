import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getCurrentLanguage, t } from "../utils/i18n";
import { haptic } from "../utils/haptics";
import { getCachedGiveawayBannerSrc } from "../utils/bannerImageCache.js";
import {
  fetchGiveawayCurrent,
  getGiveawayCache,
  participateGiveaway,
  subscribeGiveaway,
} from "../utils/giveawayPublicState.js";
import "../styles/GiveawayJoinModal.css";

export const GIVEAWAY_JOIN_PROMPT_EVENT = "elfduck:giveaway-join-prompt";

/** Показуємо модалку, поки клієнт не натиснув «Участвовать». */
function shouldPrompt(data) {
  if (!data?.ok) return false;
  if (data.joined || data.participated) return false;
  if (data.participationOpen === false) return false;
  const phase = String(data.phase || "").trim();
  if (phase && phase !== "active" && data.participationOpen !== true) {
    return false;
  }
  return Boolean(data.participationOpen || phase === "active" || data.bannerVisible);
}

export default function GiveawayJoinModal() {
  const [state, setState] = useState(() => getGiveawayCache());
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dismissedRef = useRef(false);
  const lang = getCurrentLanguage();

  const tryOpen = useCallback((data) => {
    if (dismissedRef.current) return;
    if (shouldPrompt(data)) setOpen(true);
  }, []);

  useEffect(() => {
    return subscribeGiveaway((data) => {
      setState(data);
      if (!shouldPrompt(data)) {
        setOpen(false);
        return;
      }
      tryOpen(data);
    });
  }, [tryOpen]);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;

    const load = async ({ force = false } = {}) => {
      attempts += 1;
      try {
        const data = await fetchGiveawayCurrent(
          force ? { force: true } : undefined
        );
        if (cancelled || !data?.ok) {
          if (!cancelled && attempts < 3) {
            window.setTimeout(() => load({ force: true }), 600 * attempts);
          }
          return;
        }
        setState(data);
        tryOpen(data);
      } catch (error) {
        console.error("giveaway join modal load", error);
        if (!cancelled && attempts < 3) {
          window.setTimeout(() => load({ force: true }), 600 * attempts);
        }
      }
    };

    load();

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      dismissedRef.current = false;
      load({ force: true });
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [tryOpen]);

  useEffect(() => {
    const onPrompt = () => {
      dismissedRef.current = false;
      const current = getGiveawayCache();
      if (shouldPrompt(current || state)) {
        setOpen(true);
        return;
      }
      fetchGiveawayCurrent({ force: true }).then((data) => {
        if (!data?.ok) return;
        setState(data);
        if (shouldPrompt(data)) setOpen(true);
      });
    };
    window.addEventListener(GIVEAWAY_JOIN_PROMPT_EVENT, onPrompt);
    return () => window.removeEventListener(GIVEAWAY_JOIN_PROMPT_EVENT, onPrompt);
  }, [state]);

  const close = useCallback(() => {
    dismissedRef.current = true;
    haptic.light();
    setOpen(false);
  }, []);

  const participate = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      const data = await participateGiveaway();
      if (data?.ok) {
        haptic.success();
        setState(data);
        setOpen(false);
      } else {
        haptic.error();
      }
    } catch (error) {
      console.error("giveaway join modal error", error);
      haptic.error();
    } finally {
      setLoading(false);
    }
  }, [loading]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="giveawayJoinBackdrop" role="presentation" onClick={close}>
      <div
        className="giveawayJoinCard"
        role="dialog"
        aria-modal="true"
        aria-label={t("Розыгрыш", "Losowanie")}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="giveawayJoinClose"
          aria-label={t("Закрыть", "Zamknij")}
          onClick={close}
        >
          ×
        </button>
        <img
          className="giveawayJoinArt"
          src={getCachedGiveawayBannerSrc(lang)}
          alt=""
          draggable={false}
        />
        <button
          type="button"
          className="giveawayJoinCta"
          disabled={loading}
          onClick={participate}
        >
          <span>
            {loading
              ? t("Секунду…", "Chwila…")
              : t("Участвовать", "Weź udział")}
          </span>
          <span className="giveawayJoinCtaArrow" aria-hidden>
            ›
          </span>
        </button>
      </div>
    </div>,
    document.body
  );
}
