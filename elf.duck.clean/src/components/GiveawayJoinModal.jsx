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

function shouldPrompt(data) {
  if (!data?.ok) return false;
  if (data.phase && data.phase !== "active") return false;
  if (data.participationOpen === false) return false;
  if (data.joined || data.participated) return false;
  return true;
}

export default function GiveawayJoinModal() {
  const [state, setState] = useState(() => getGiveawayCache());
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dismissedRef = useRef(false);
  const lang = getCurrentLanguage();

  useEffect(() => {
    return subscribeGiveaway((data) => {
      setState(data);
      if (!shouldPrompt(data)) setOpen(false);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchGiveawayCurrent().then((data) => {
      if (cancelled || !data?.ok) return;
      setState(data);
      if (!dismissedRef.current && shouldPrompt(data)) setOpen(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onPrompt = () => {
      dismissedRef.current = false;
      const current = getGiveawayCache();
      if (shouldPrompt(current || state)) setOpen(true);
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
