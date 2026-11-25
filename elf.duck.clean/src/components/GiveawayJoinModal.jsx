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

const PROMPTED_SESSION_KEY = "elfduck_giveaway_join_prompted_v1";
const CLOSE_LOCK_MS = 3000;

function wasPromptedThisSession() {
  try {
    return sessionStorage.getItem(PROMPTED_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function markPromptedThisSession() {
  try {
    sessionStorage.setItem(PROMPTED_SESSION_KEY, "1");
  } catch {
    // ignore
  }
}

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
  const [closeLocked, setCloseLocked] = useState(true);
  const [lockLeft, setLockLeft] = useState(3);
  const [lockProgress, setLockProgress] = useState(0);
  const closeLockedRef = useRef(true);
  const dismissedRef = useRef(wasPromptedThisSession());
  const entryPromptDoneRef = useRef(wasPromptedThisSession());
  const lang = getCurrentLanguage();

  const tryOpenOnceOnEntry = useCallback((data) => {
    if (entryPromptDoneRef.current || dismissedRef.current) return;
    if (!shouldPrompt(data)) return;
    entryPromptDoneRef.current = true;
    markPromptedThisSession();
    setOpen(true);
  }, []);

  useEffect(() => {
    return subscribeGiveaway((data) => {
      setState(data);
      if (!shouldPrompt(data)) {
        setOpen(false);
        return;
      }
      tryOpenOnceOnEntry(data);
    });
  }, [tryOpenOnceOnEntry]);

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
        tryOpenOnceOnEntry(data);
      } catch (error) {
        console.error("giveaway join modal load", error);
        if (!cancelled && attempts < 3) {
          window.setTimeout(() => load({ force: true }), 600 * attempts);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [tryOpenOnceOnEntry]);

  useEffect(() => {
    const onPrompt = (event) => {
      const force = Boolean(event?.detail?.force);
      if (!force) return;
      dismissedRef.current = false;
      const current = getGiveawayCache();
      if (shouldPrompt(current || state)) {
        markPromptedThisSession();
        entryPromptDoneRef.current = true;
        setOpen(true);
        return;
      }
      fetchGiveawayCurrent({ force: true }).then((data) => {
        if (!data?.ok) return;
        setState(data);
        if (shouldPrompt(data)) {
          markPromptedThisSession();
          entryPromptDoneRef.current = true;
          setOpen(true);
        }
      });
    };
    window.addEventListener(GIVEAWAY_JOIN_PROMPT_EVENT, onPrompt);
    return () => window.removeEventListener(GIVEAWAY_JOIN_PROMPT_EVENT, onPrompt);
  }, [state]);

  useEffect(() => {
    if (!open) return undefined;

    closeLockedRef.current = true;
    setCloseLocked(true);
    setLockLeft(3);
    setLockProgress(0);

    const started = performance.now();
    let frame = 0;

    const tick = (now) => {
      const elapsed = now - started;
      const progress = Math.min(1, elapsed / CLOSE_LOCK_MS);
      setLockProgress(progress);
      setLockLeft(Math.max(1, Math.ceil((CLOSE_LOCK_MS - elapsed) / 1000)));
      if (progress >= 1) {
        closeLockedRef.current = false;
        setCloseLocked(false);
        setLockLeft(0);
        return;
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const close = useCallback(() => {
    if (closeLockedRef.current) return;
    dismissedRef.current = true;
    entryPromptDoneRef.current = true;
    markPromptedThisSession();
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
        dismissedRef.current = true;
        entryPromptDoneRef.current = true;
        markPromptedThisSession();
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
        <div className="giveawayJoinProgress" aria-hidden>
          <span
            className="giveawayJoinProgressBar"
            style={{ transform: `scaleX(${lockProgress})` }}
          />
        </div>
        <button
          type="button"
          className={`giveawayJoinClose${closeLocked ? " is-locked" : ""}`}
          style={{ "--lock-progress": lockProgress }}
          aria-label={
            closeLocked
              ? t(
                  `Можно закрыть через ${lockLeft} с`,
                  `Można zamknąć za ${lockLeft} s`
                )
              : t("Закрыть", "Zamknij")
          }
          aria-disabled={closeLocked}
          disabled={closeLocked}
          onClick={close}
        >
          {closeLocked ? lockLeft : "×"}
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
