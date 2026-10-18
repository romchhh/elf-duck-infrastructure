import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import Lottie from "lottie-react";
import "../styles/ReferralPage.css";
import "../styles/sideMenuLanguage.css";
import { useUser } from "../UserContext";
import { useNavigate } from "react-router-dom";
import { haptic } from "../utils/haptics";
import moneyAnimation from "../assets/moneyAnimation.json";
import discountSfx from "../assets/cashback2.mp3";
import {

  getCurrentLanguage,

  setCurrentLanguage,

  t,

} from "../utils/i18n";
import { apiFetch } from "../api";

import menuIcon from "../assets/menuIcon.webp";
import logo from "../assets/logo3.webp"; 
import coinIcon from "../assets/coinIcon.webp";
import swapIcon from "../assets/swapIcon.webp";
import balanceCardDuckIMG from "../assets/promocodeCardDuckIMG.webp";
import bucketDuckIMG from "../assets/bucketDuckIMG.webp";
import managerDuckIMG from "../assets/managerDuckIMG.webp";
import historyDuckIMG from "../assets/historyDuckIMG.webp";
import refferalDucksIMG from "../assets/refferalDucksIMG.webp";
import savedDuckIMG from "../assets/savedDuckIMG.webp";
import sideMenuBackIcon from "../assets/sideMenuBackIcon.webp";
import hideSideMenuIcon from "../assets/hideSideMenuIcon.webp"
import supportDuckIMG from "../assets/supportDuckIMG.webp";
import zlotyIcon from "../assets/zlotyIcon.webp";
import telegramIcon from "../assets/telegramIcon.webp";
import supportIcon from "../assets/supportIcon.webp";

function getReferralGroupLatestInviteAt(group) {
    const members = Array.isArray(group?.members) ? group.members : [];
    return members.reduce((max, member) => {
        const ts = member?.invitedAt ? new Date(member.invitedAt).getTime() : 0;
        return Math.max(max, Number.isFinite(ts) ? ts : 0);
    }, 0);
}

function getReferralGroupStatus(group) {
    const isClaimed = Boolean(group?.isClaimed || group?.rewardClaimed);
    const canClaim = Boolean(group?.isClaimable) && !isClaimed;
    const members = Array.isArray(group?.members) ? group.members : [];
    const hasPendingPurchase =
        !isClaimed &&
        !canClaim &&
        members.some((m) => m?.completed !== true);
    const isNew = hasPendingPurchase;

    return { isClaimed, canClaim, isNew, hasPendingPurchase };
}

const ReferralPage = () => {

    /* ================= GENERAL ================= */

    const navigate = useNavigate();
    const { user, setUser, userLoading, isGuestBrowser, initials, displayName, displayUsername } = useUser();
    const [avatarLoaded, setAvatarLoaded] = useState(false);
    const [mounted, setMounted] = useState(false);
    const lang = getCurrentLanguage();

    const [referralStatus, setReferralStatus] = useState(null);
    const [referralLoading, setReferralLoading] = useState(false);
    const [claimingReward, setClaimingReward] = useState(false);
    const [claimingGroupId, setClaimingGroupId] = useState("");
    const [inviteGenerating, setInviteGenerating] = useState(false);
    const [balancePulse, setBalancePulse] = useState(false);
    const [showClaimFx, setShowClaimFx] = useState(false);
    const [claimFxRunId, setClaimFxRunId] = useState(0);
    const [claimFxAmount, setClaimFxAmount] = useState(25);
    const claimAudioRef = useRef(null);
    const claimFxTimerRef = useRef(null);
    const claimLottieRef = useRef(null);
    const CLAIM_FX_MS = 3800;

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        return () => {
            if (claimFxTimerRef.current) {
                clearTimeout(claimFxTimerRef.current);
            }
        };
    }, []);

    const stopClaimFx = useCallback(() => {
        if (claimFxTimerRef.current) {
            clearTimeout(claimFxTimerRef.current);
            claimFxTimerRef.current = null;
        }
        try {
            const a = claimAudioRef.current;
            if (a) {
                a.pause();
                a.currentTime = 0;
            }
        } catch {}
        setShowClaimFx(false);
    }, []);

    const playClaimSuccessFx = useCallback((amountZl) => {
        setClaimFxAmount(Number(amountZl || 25));
        setShowClaimFx(true);
        setClaimFxRunId((v) => v + 1);
        haptic.success();
        haptic.heavy();

        requestAnimationFrame(() => {
            try {
                claimLottieRef.current?.stop?.();
                claimLottieRef.current?.goToAndPlay?.(0, true);
            } catch {}
        });

        try {
            const a = claimAudioRef.current;
            if (a) {
                a.pause();
                a.currentTime = 0;
                a.volume = 0.85;
                a.play().catch(() => {});
            }
        } catch {}

        if (claimFxTimerRef.current) clearTimeout(claimFxTimerRef.current);
        claimFxTimerRef.current = setTimeout(() => {
            stopClaimFx();
        }, CLAIM_FX_MS);
    }, [stopClaimFx]);

    const pulseBalance = useCallback(() => {
        setBalancePulse(true);
        window.setTimeout(() => setBalancePulse(false), 900);
    }, []);

    const referralGroups = useMemo(
        () =>
            Array.isArray(referralStatus?.groups)
                ? referralStatus.groups
                : [],
        [referralStatus]
    );

    const sortedReferralGroups = useMemo(() => {
        return [...referralGroups].sort((a, b) => {
            const statusA = getReferralGroupStatus(a);
            const statusB = getReferralGroupStatus(b);

            const rank = (s) => {
                if (s.isNew) return 0;
                if (s.canClaim) return 1;
                if (s.isClaimed) return 3;
                return 2;
            };

            const rankDiff = rank(statusA) - rank(statusB);
            if (rankDiff !== 0) return rankDiff;

            return getReferralGroupLatestInviteAt(b) - getReferralGroupLatestInviteAt(a);
        });
    }, [referralGroups]);

    const claimableGroups = useMemo(
        () =>
            sortedReferralGroups.filter((group) => {
                const { canClaim } = getReferralGroupStatus(group);
                return canClaim;
            }),
        [sortedReferralGroups]
    );

    useEffect(() => {
        if (userLoading) return;

        if (isGuestBrowser) {
            setReferralStatus(null);
            setReferralLoading(false);
            return;
        }

        const telegramId = String(user?.telegramId || "").trim();
        if (!telegramId) return;

        let cancelled = false;

        const loadReferralStatus = async () => {
            try {
                setReferralLoading(true);

                const data = await apiFetch(`/referral/status`);

                if (!cancelled) {
                    setReferralStatus(data?.referralStatus || null);
                }
            } catch (e) {
                console.error("loadReferralStatus error", e);
            } finally {
                if (!cancelled) setReferralLoading(false);
            }
        };

        loadReferralStatus();

        return () => {
            cancelled = true;
        };
    }, [user?.telegramId, userLoading, isGuestBrowser]);

    /* ================= SIDE MENU STATE ================= */
  
    const [menuVisible, setMenuVisible] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isMenuClosing, setIsMenuClosing] = useState(false);

        const [languageMenuOpen, setLanguageMenuOpen] = useState(false);

    const [language, setLanguage] = useState(() => getCurrentLanguage());
  
    const openMenu = () => {
      if (menuVisible) return;
  
      setMenuVisible(true);          // 1️⃣ смонтировали (ещё закрыто)
      requestAnimationFrame(() => {
        setIsMenuOpen(true);         // 2️⃣ В СЛЕДУЮЩЕМ КАДРЕ → анимация
      });
    };
  
    const closeMenu = () => {
      if (isMenuClosing) return;
  
      setIsMenuClosing(true);
      setIsMenuOpen(false); // запускаем анимацию закрытия
  
      setTimeout(() => {
        setMenuVisible(false); // ⬅️ ВОТ ЭТОГО НЕ ХВАТАЛО
        setIsMenuClosing(false);
      }, 280); // = transition-duration
    };

        const selectLanguage = (
    
            nextLanguage
    
            ) => {
    
            const safeLanguage =
    
                setCurrentLanguage(nextLanguage);
    
            haptic.light();
    
            setLanguage(safeLanguage);
    
            setLanguageMenuOpen(false);
    
            window.location.reload();
    
        };
  
    useEffect(() => {
      if (menuVisible) {
        document.body.style.overflow = "hidden";
      } else {
        document.body.style.overflow = "";
      }
    }, [menuVisible]);
  
    useEffect(() => {
      const onKey = (e) => e.key === "Escape" && closeMenu();
      if (isMenuOpen) window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, [isMenuOpen]);

    /* ================= REFERRAL SYSTEM ================= */

    const inviteFriend = async () => {
        if (inviteGenerating) return;

        haptic.light();
        setInviteGenerating(true);

        const tg = window.Telegram?.WebApp;

        let status = referralStatus;
        if (!status?.inviteDeepLink) {
            try {
                const fresh = await apiFetch(`/referral/status`);
                status = fresh?.referralStatus || status;
                if (status) setReferralStatus(status);
            } catch (e) {
                console.warn("referral status refresh before invite", e);
            }
        }

    const refCode =
      status?.code ||
      user?.referral?.code ||
      user?.id ||
      "";

    const deepLink =
      status?.inviteDeepLink ||
      (status?.shopBotUsername && refCode
        ? `https://t.me/${status.shopBotUsername}?start=${encodeURIComponent(`ref_${refCode}`)}`
        : "");

    // 1) Пытаемся сделать prepared share (как Gorilla Case)
    if (tg?.shareMessage) {
        try {
        const data = await apiFetch(`/tg/prepared-referral-message`, {
            method: "POST",
            body: JSON.stringify({
                refCode,
                language: getCurrentLanguage(),
            }),
        });

        console.log("prepared response:", data);

        if (data?.ok && data?.id) {

            tg.shareMessage(data.id);

            setInviteGenerating(false);

            return;

        }

        // Просто логируем ошибку вместо показа popup, чтобы не было popup + fallback
        console.warn("Prepared share failed:", data);
        } catch (e) {
        tg?.showPopup?.({
            title: t("Приглашение", "Zaproszenie"),
            message: e?.message || t("Ошибка сети", "Błąd sieci"),
            buttons: [{ type: "ok" }],
        });
            setInviteGenerating(false);
        }
    }

    // 2) fallback: share-url (бот = тот, з якого відкрили mini app)
    if (!deepLink) {
        showPopupMessage(
            t("Приглашение", "Zaproszenie"),
            t(
                "Не удалось построить ссылку. Откройте магазин через Telegram-бота и попробуйте снова.",
                "Nie udało się utworzyć linku. Otwórz sklep przez bota Telegram i spróbuj ponownie."
            )
        );
        setInviteGenerating(false);
        return;
    }

    const text = `🦆 ELF DUCK\n${t(
        "Залетай по моей ссылке — 10% скидки на первый заказ (от 65 zł)!\nА я получаю 25 zł на баланс, когда ты сделаешь покупку. 👇",
        "Wejdź z mojego linku — masz 10% zniżki na pierwsze zamówienie (min. 65 zł)!\nA ja dostaję 25 zł na saldo, gdy zrobisz zakup. 👇"
    )}`;
    const shareLink = `https://t.me/share/url?url=${encodeURIComponent(deepLink)}&text=${encodeURIComponent(text)}`;

    if (tg?.openTelegramLink) tg.openTelegramLink(shareLink);
        else window.open(shareLink, "_blank");

        setTimeout(() => {
            setInviteGenerating(false);
        }, 400);

    };
        
    const formatReferralMemberLabel = (ref) => {
        const name = ref?.firstName || ref?.username || t("Реферал", "Polecony");
        const handle = ref?.username ? `@${ref.username}` : `ID ${ref?.telegramId || ""}`;
        return { name, handle };
    };

    // Группа ждёт первую покупку реферала (ещё нельзя забрать 25 zł)
    const hasPendingPurchaseGroup = referralGroups.some(
      (group) =>
        Array.isArray(group.members) &&
        group.members.length >= 1 &&
        group?.isClaimed !== true &&
        group?.rewardClaimed !== true &&
        group?.isClaimable !== true &&
        group.members.some((m) => m?.completed !== true)
    );

    const shouldRenderWaitingCard = hasPendingPurchaseGroup;

    const showPopupMessage = (title, message) => {
        const tg = window.Telegram?.WebApp;
        if (tg?.showPopup) {
            tg.showPopup({
                title,
                message,
                buttons: [{ type: "ok" }],
            });
            return;
        }
        window.alert(message);
    };

const claimReferralReward = async (targetGroup = null) => {
    try {
        // const telegramId = String(user?.telegramId || "").trim();
        // if (!telegramId) return;

        const rawGroups = Array.isArray(referralStatus?.groups) ? referralStatus.groups : [];
        const groups = rawGroups.map((group) => ({
            ...group,
            members: Array.isArray(group?.members) ? group.members.filter(Boolean) : [],
        }));

        const selectedGroup = targetGroup
            ? groups.find((group) => String(group?.id || "") === String(targetGroup?.id || "")) || targetGroup
            : null;

        let groupForCheck =
            selectedGroup ||
            groups.find(
                (group) =>
                    group?.isClaimable === true &&
                    group?.isClaimed !== true &&
                    group?.rewardClaimed !== true
            ) ||
            groups.find(
                (group) =>
                    Array.isArray(group?.members) &&
                    group.members.length > 0 &&
                    group?.isClaimed !== true &&
                    group?.rewardClaimed !== true
            ) ||
            null;

        const members = Array.isArray(groupForCheck?.members) ? groupForCheck.members.filter(Boolean) : [];
        const completedMembers = members.filter((m) => m?.completed === true);
        const pendingMembers = members.filter((m) => m?.completed !== true);

        const showGroupRequirementAlert = () => {
            if (members.length < 1) {
                showPopupMessage(
                    t("Реферальная программа", "Program poleceń"),
                    t(
                        "Пригласите друга по своей ссылке. Когда он совершит покупку — вы получите 25 zł на баланс.",
                        "Zaproś znajomego swoim linkiem. Gdy zrobi zakup — otrzymasz 25 zł na saldo."
                    )
                );
                return true;
            }

            // Legacy: пара из 2 рефералов
            if (members.length === 2 && completedMembers.length === 1 && pendingMembers.length === 1) {
                showPopupMessage(
                    t("Реферальная программа", "Program poleceń"),
                    `${completedMembers[0]?.displayName || t("Один из рефералов", "Jeden z poleconych")} ${t("уже совершил первую покупку.", "już złożył pierwsze zamówienie.")}\n\n` +
                    `${pendingMembers[0]?.displayName || t("Второй реферал", "Drugi polecony")} ${t("ещё не совершил первую покупку.", "jeszcze nie złożył pierwszego zamówienia.")} ` +
                    `${t("Чтобы вы получили награду, ему нужно оформить свой первый заказ.", "Aby otrzymać nagrodę, musi złożyć swoje pierwsze zamówienie.")}`
                );
                return true;
            }

            if (completedMembers.length === 0) {
                const name =
                    members[0]?.displayName || t("Ваш реферал", "Twój polecony");
                showPopupMessage(
                    t("Реферальная программа", "Program poleceń"),
                    `${name} ${t(
                        "ещё не совершил покупку.\n\nКак только он оформит заказ — вы сможете получить 25 zł на баланс.",
                        "jeszcze nie zrobił zakupu.\n\nGdy złoży zamówienie — będziesz mógł otrzymać 25 zł na saldo."
                    )}`
                );
                return true;
            }

            return false;
        };

        if (!groupForCheck) {
            showPopupMessage(
                t("Реферальная программа", "Program poleceń"),
                t(
                    "Пригласите друга по своей ссылке. Когда он совершит покупку — вы получите 25 zł на баланс.",
                    "Zaproś znajomego swoim linkiem. Gdy zrobi zakup — otrzymasz 25 zł na saldo."
                )
            );
            return;
        }

        if (groupForCheck?.isClaimed === true || groupForCheck?.rewardClaimed === true) {
            showPopupMessage(
                t("Реферальная программа", "Program poleceń"),
                t(
                    "Награда за этого реферала уже начислена. Пригласите следующего друга, чтобы получить ещё 25 zł.",
                    "Nagroda za tego poleconego została już naliczona. Zaproś kolejnego znajomego, aby dostać kolejne 25 zł."
                )
            );
            return;
        }

        if (!groupForCheck && Array.isArray(referralGroups) && referralGroups.length) {
            const firstClaimableGroup = referralGroups.find(
                (group) =>
                    group?.isClaimable === true &&
                    group?.isClaimed !== true &&
                    group?.rewardClaimed !== true
            );

            if (firstClaimableGroup) {
                groupForCheck = firstClaimableGroup;
            } else {
                const firstWaitingPurchaseGroup = referralGroups.find((group) => {
                    const members = Array.isArray(group?.members) ? group.members : [];
                    return (
                        members.length >= 1 &&
                        group?.isClaimed !== true &&
                        group?.rewardClaimed !== true
                    );
                });

                if (firstWaitingPurchaseGroup) {
                    groupForCheck = firstWaitingPurchaseGroup;
                }
            }
        }

        if (showGroupRequirementAlert(groupForCheck)) {
            return;
        }

        setClaimingReward(true);
        setClaimingGroupId(String(groupForCheck?.id || ""));

        const data = await apiFetch(`/referral/claim`, {
            method: "POST",
            body: JSON.stringify({
                groupId: String(groupForCheck?.id || ""),
            }),
        });

        if (data?.ok && data?.status === "REWARD_GRANTED") {
            const granted = Number(data?.amount || 25);
            setUser((prev) => {
                if (!prev) return prev;
                const fromApi = Number(data?.cashbackBalance);
                const nextBalance = Number.isFinite(fromApi)
                    ? fromApi
                    : Number(prev.cashbackBalance || 0) + granted;
                return {
                    ...prev,
                    cashbackBalance: Number(nextBalance.toFixed(2)),
                };
            });
            pulseBalance();
            playClaimSuccessFx(granted);
        } else if (data?.status === "ONE_COMPLETED") {
            showPopupMessage(
                t("Реферальная программа", "Program poleceń"),
                `${data?.completed || t("Один из рефералов", "Jeden z poleconych")} ${t("уже совершил первую покупку.", "już złożył pierwsze zamówienie.")}\n\n` +
                `${data?.pending || t("Второй реферал", "Drugi polecony")} ${t("ещё не совершил первую покупку.", "jeszcze nie złożył pierwszego zamówienia.")} ` +
                `${t("Чтобы вы получили награду, ему нужно оформить свой первый заказ.", "Aby otrzymać nagrodę, musi złożyć swoje pierwsze zamówienie.")}`
            );
        } else if (data?.status === "NONE_COMPLETED") {
            const usersText = Array.isArray(data?.users) && data.users.length
                ? `\n\n${t("Реферал:", "Polecony:")}\n• ${data.users.join("\n• ")}`
                : "";

            showPopupMessage(
                t("Реферальная программа", "Program poleceń"),
                t(
                    "Реферал ещё не совершил покупку.\n\nКак только он оформит заказ — вы получите 25 zł на баланс.",
                    "Polecony jeszcze nie zrobił zakupu.\n\nGdy złoży zamówienie — otrzymasz 25 zł na saldo."
                ) + usersText
            );
        } else if (data?.status === "NOT_ENOUGH_REFERRALS") {
            showPopupMessage(
                t("Реферальная программа", "Program poleceń"),
                t(
                    "Пригласите друга по своей ссылке. Когда он совершит покупку — вы получите 25 zł на баланс.",
                    "Zaproś znajomego swoim linkiem. Gdy zrobi zakup — otrzymasz 25 zł na saldo."
                )
            );
        } else if (data?.status === "ALREADY_CLAIMED") {
            showPopupMessage(
                t("Реферальная программа", "Program poleceń"),
                t(
                    "Награда за этого реферала уже начислена. Пригласите следующего друга, чтобы получить ещё 25 zł.",
                    "Nagroda za tego poleconego została już naliczona. Zaproś kolejnego znajomego, aby dostać kolejne 25 zł."
                )
            );
        } else if (data?.ok === false) {
            throw new Error(data?.message || data?.error || t("Не удалось забрать награду", "Nie udało się odebrać nagrody"));
        } else {
            showPopupMessage(
                t("Реферальная программа", "Program poleceń"),
                data?.message || t("Статус реферальной награды обновлён.", "Status nagrody za polecenie został zaktualizowany.")
            );
        }

        const refreshData = await apiFetch(`/referral/status`);
        setReferralStatus(refreshData.referralStatus || null);
    } catch (e) {
        showPopupMessage(t("Реферальная программа", "Program poleceń"), e?.message || t("Не удалось забрать награду", "Nie udało się odebrać nagrody"));
    } finally {
        setClaimingReward(false);
        setClaimingGroupId("");
    }
};

  const showTgAlert = (text) => {
    try {
      const tg = window?.Telegram?.WebApp;
      if (tg?.showAlert) return tg.showAlert(String(text));
    } catch (_) {}
    alert(String(text));
  };


  const showCashbackInfoAlert = () => {
    haptic.light();

    const text = [
      t("💰 КЭШБЕК ELF DUCK", "💰 CASHBACK ELF DUCK"),
      "",
      t("до 100 zł — 4%", "do 100 zł — 4%"),
      t("от 101 zł — 7%", "od 101 zł — 7%"),
      t("от 301 zł — 9%", "od 301 zł — 9%"),
      t("от 501 zł — 10%", "od 501 zł — 10%"),
      "",
      t("❌ ВАЖНО:", "❌ WAŻNE:"),
      "",
      t("1. Процент зависит от суммы заказа", "1. Procent zależy od kwoty zamówienia"),
      t("2. Кэшбек начисляется на ваш баланс после покупки", "2. Cashback jest naliczany na saldo po zakupie"),
      t("3. Срок использования — 40 дней", "3. Okres wykorzystania — 40 dni"),
      t("4. Списать можно без ограничений", "4. Można wykorzystać bez ograniczeń"),
    ].join("\n");

    showTgAlert(text);
  };

    const renderReferralGroupCard = (group) => {
        const { isClaimed, canClaim, isNew } = getReferralGroupStatus(group);
        const groupKey = `group-${group.pairIndex || group.id}`;

        if (group.members.length === 1) {
            const ref = group.members[0];
            const { name, handle } = formatReferralMemberLabel(ref);

            return (
                <div className="refListCard refListCardRow" key={groupKey}>
                    <div className="refReferralTopRow">
                        <div className="refReferralLeft">
                            <img
                                className="refReferralAvatar"
                                src={ref.photoUrl || "https://placehold.co/100x100/png"}
                                alt=""
                            />
                            <div className="refReferralNameBlock">
                                <div className="refReferralNameRow">
                                    <div
                                        className={`refReferralName ${canClaim || isClaimed ? "refReferralNameGreen" : ""}`}
                                    >
                                        {name}
                                    </div>
                                    {isNew ? (
                                        <span className="refStatusBadge refStatusBadgeNew">
                                            {t("новый", "nowy")}
                                        </span>
                                    ) : null}
                                    {isClaimed ? (
                                        <span className="refStatusBadge refStatusBadgeDone">
                                            {t("получено", "odebrano")}
                                        </span>
                                    ) : null}
                                </div>
                                <div className="refReferralUsername">{handle}</div>
                            </div>
                        </div>

                        <div className="refReferralDatePill">
                            {t("приглашен", "zaproszony")}{" "}
                            {ref.invitedAt
                                ? new Date(ref.invitedAt).toLocaleDateString(
                                    lang === "pl" ? "pl-PL" : "ru-RU",
                                    { day: "2-digit", month: "2-digit" }
                                  )
                                : "—"}
                        </div>
                    </div>

                    {isNew && (
                        <div className="refListInfoRow refListInfoRowCompact">
                            <div className="refInfoIcon">i</div>
                            <div className="refListInfoText">
                                {t("ЖДЁМ ПЕРВУЮ ПОКУПКУ", "CZEKAMY NA PIERWSZY ZAKUP")}
                                <br />
                                {t("ПОТОМ МОЖНО ЗАБРАТЬ", "POTEM MOŻESZ ODEBRAĆ")}{" "}
                                <span className="refAccent">25 ZŁ</span>
                            </div>
                        </div>
                    )}

                    {canClaim && (
                        <div className="refListInfoRow refListInfoRowCompact refListInfoRowReady">
                            <div className="refInfoIcon">✓</div>
                            <div className="refListInfoText">
                                {t("ПОКУПКА СОВЕРШЕНА — ЗАБЕРИТЕ НАГРАДУ ВЫШЕ", "ZAKUP ZROBIONY — ODBIERZ NAGRODĘ POWYŻEJ")}
                            </div>
                        </div>
                    )}
                </div>
            );
        }

        return (
            <div className="refListCard refListCardRow" key={groupKey}>
                <div className="refReferralPeople">
                    {group.members.map((ref) => {
                        const { name, handle } = formatReferralMemberLabel(ref);
                        return (
                            <div className="refReferralPerson" key={ref.telegramId}>
                                <img
                                    className="refReferralAvatar"
                                    src={ref.photoUrl || "https://placehold.co/100x100/png"}
                                    alt=""
                                />
                                <div className="refReferralNameBlock">
                                    <div className="refReferralNameRow">
                                        <div
                                            className={`refReferralName ${isClaimed || canClaim ? "refReferralNameGreen" : ""}`}
                                        >
                                            {name}
                                        </div>
                                        {ref?.completed !== true && !isClaimed ? (
                                            <span className="refStatusBadge refStatusBadgeNew">
                                                {t("новый", "nowy")}
                                            </span>
                                        ) : null}
                                    </div>
                                    <div className="refReferralUsername">{handle}</div>
                                </div>

                                <div className="refReferralDatePill">
                                    {t("приглашен", "zaproszony")}{" "}
                                    {ref.invitedAt
                                        ? new Date(ref.invitedAt).toLocaleDateString(
                                            lang === "pl" ? "pl-PL" : "ru-RU",
                                            { day: "2-digit", month: "2-digit" }
                                          )
                                        : "—"}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {isClaimed ? (
                    <div className="refRewardBtn refRewardBtnStatic">
                        {t("НАГРАДА ПОЛУЧЕНА!", "NAGRODA ODEBRANA!")}
                    </div>
                ) : null}
            </div>
        );
    };

    return (
        <div className={`ReferralApp reveal delay-5 ${mounted ? "visible" : ""}`}>
            <audio ref={claimAudioRef} src={discountSfx} preload="auto" />

            {showClaimFx && (
                <div className="refClaimFxOverlay" aria-hidden="true">
                    <div key={claimFxRunId} className="refClaimFxLottie">
                        <Lottie
                            lottieRef={claimLottieRef}
                            animationData={moneyAnimation}
                            loop={false}
                            autoplay
                            style={{ width: "100%", height: "100%" }}
                            rendererSettings={{
                                preserveAspectRatio: "xMidYMid slice",
                                progressiveLoad: true,
                            }}
                        />
                    </div>
                    <div className="refClaimFxCaption">
                        <span className="refClaimFxAmount">+{claimFxAmount} zł</span>
                        <span className="refClaimFxSub">
                            {t("на баланс", "na saldo")}
                        </span>
                    </div>
                </div>
            )}

            {menuVisible && (
                <>
                {/* Затемнение */}
                    <div
                    className={`sideMenuBackdrop ${isMenuClosing ? "closing" : ""}`}
                    onClick={closeMenu}
                    />

                {/* Левая штора */}
                    <aside
                        className={`sideMenu
                        ${isMenuOpen ? "open" : ""}
                        ${isMenuClosing ? "closing" : ""}
                    `}
                    >
                    <div className="sideMenuInner">

                        <div className="sideMenuScroll">

                        {/* 🔝 PROFILE BUTTON */}
                   <div className="sideMenuTopRow">
                        <button
                            type="button"
                            className="sideMenuProfile sideMenuProfile--compact"
                            onClick={() => {
                                haptic.light();
                                closeMenu();
                            }}
                        >
                            <span className="sideMenuProfileAccent" />

                            <div className="sideMenuProfileLeft">
                                {user?.photoUrl ? (
                                    <img
                                        src={user.photoUrl}
                                        className="sideMenuAvatar"
                                        alt=""
                                    />
                                ) : null}

                                <span className="sideMenuName">
                                    {displayName ||
                                        displayUsername ||
                                        "Профиль"}
                                </span>
                            </div>

                            <img
                                src={hideSideMenuIcon}
                                className="sideMenuExitIcon"
                                alt=""
                            />
                        </button>

                        <div className="sideLanguagePicker">
                            <button
                                type="button"
                                className={`sideLanguageButton ${
                                    languageMenuOpen
                                        ? "is-open"
                                        : ""
                                }`}
                                aria-expanded={languageMenuOpen}
                                onClick={() => {
                                    haptic.light();

                                    setLanguageMenuOpen(
                                        (current) => !current
                                    );
                                }}
                            >
                                <span
                                    className="sideLanguageFlag"
                                    aria-hidden="true"
                                >
                                    {language === "ru"
                                        ? "RU"
                                        : "PL"}
                                </span>

                                <span
                                    className="sideLanguageChevron"
                                    aria-hidden="true"
                                >
                                    ▾
                                </span>
                            </button>

                            {languageMenuOpen ? (
                                <div className="sideLanguageDropdown">
                                    <button
                                        type="button"
                                        className={`sideLanguageOption ${
                                            language === "ru"
                                                ? "is-active"
                                                : ""
                                        }`}
                                        onClick={() =>
                                            selectLanguage("ru")
                                        }
                                    >
                                        <span></span>
                                        <span>Русский</span>
                                    </button>

                                    <button
                                        type="button"
                                        className={`sideLanguageOption ${
                                            language === "pl"
                                                ? "is-active"
                                                : ""
                                        }`}
                                        onClick={() =>
                                            selectLanguage("pl")
                                        }
                                    >
                                        <span></span>
                                        <span>Polski</span>
                                    </button>
                                </div>
                            ) : null}
                        </div>
                    </div>

                            <div className="balanceCard">
                                <div className="balanceContent">
                                    <div className="balanceInfo">
                                        <span className="balanceTitle">{t("ПРОМОКОД", "PROMOCODE")}</span>

                                        {/* <div className="balanceRow">
                                        <span className="balanceAmount">
                                            <img src={zlotyIcon} alt="" />
                                            {Number(user?.cashbackBalance || 0).toFixed(1)}
                                        </span>
                                        <span className="balanceBadge">{t("кэшбек", "cashback")}</span>
                                        </div> */}

                                        <button
                                        className="balanceAction"
                                        onClick={() => {
                                            haptic.light();
                                            closeMenu();
                                            navigate("/promo");
                                        }}
                                        >
                                        {t("активировать", "aktywuj")}
                                        </button>
                                    </div>

                                <img
                                    src={balanceCardDuckIMG}
                                    className="balanceDuck"
                                    alt=""
                                />
                                </div>
                            </div>

                            <div className="sideMenuCard">
                                <span className="sideMenuCardAccent" />

                                {/* персонаж */}
                                <img
                                    src={bucketDuckIMG}
                                    className="sideMenuCardDuck"
                                    alt=""
                                />

                                <div className="sideMenuCardContent">

                                {/* текстовая часть */}
                                <div className="sideMenuCardInfo">
                                    <div className="sideMenuCardTitle">
                                    {t("КОРЗИНА", "KOSZYK")}
                                    </div>

                                    <button className="sideMenuCardAction"
                                        onClick={() => {
                                        haptic.light();
                                        closeMenu();
                                        navigate("/cart");
                                        }}
                                        >
                                        {t("открыть", "otwórz")}
                                    </button>
                                </div>

                                </div>
                            </div>

                            <div className="sideSavedCard">
                                <span className="sideSavedCardAccent" />

                                {/* персонаж */}
                                <img
                                    src={savedDuckIMG}
                                    className="sideSavedCardDuck"
                                    alt=""
                                />

                                <div className="sideSavedCardContent">
                                {/* текстовая часть */}
                                <div className="sideSavedCardInfo">
                                    <div className="sideSavedCardTitle">
                                    {t("ИЗБРАННОЕ", "ULUBIONE")}
                                    </div>

                                <button className="sideSavedCardAction"                          
                                    onClick={() => {
                                    haptic.light();
                                    closeMenu();
                                    navigate("/favorites");
                                }}
                                    >
                                    {t("открыть", "otwórz")}
                                </button>
                                
                                </div>

                                </div>
                            </div>

                        <div className="sideHistoryCard">
                            <span className="sideHistoryCardAccent" />

                            {/* персонаж */}
                            <img
                                src={historyDuckIMG}
                                className="sideHistoryCardDuck"
                                alt=""
                            />

                            <div className="sideHistoryCardContent">

                            {/* текстовая часть */}
                            <div className="sideHistoryCardInfo">
                                <div className="sideHistoryCardTitle">
                                {t("ИСТОРИЯ", "HISTORIA")} <br/> {t("ПОКУПОК", "ZAKUPÓW")}
                                </div>

                                <button className="sideHistoryCardAction"
                                    onClick={() => {
                                    haptic.light();
                                    closeMenu();
                                    navigate("/orders");
                                    }}
                                >
                                    {t("просмотреть", "zobacz")}
                                </button>
                            </div>

                            </div>
                        </div>

                        <div className="sideRefferalCard">
                            <span className="sideRefferalCardAccent" />

                            {/* персонаж */}
                            <img
                                src={refferalDucksIMG}
                                className="sideRefferalCardDuck"
                                alt=""
                            />

                            <div className="sideRefferalCardContent">

                            {/* текстовая часть */}
                            <div className="sideRefferalCardInfo">
                                <div className="sideRefferalCardTitle">
                                {t("РЕФЕРАЛЬНАЯ", "PROGRAM")} <br/> {t("ПРОГРАММА", "POLECEŃ")}
                                </div>

                                <button
                                className="sideRefferalCardAction"
                                onClick={() => {
                                    haptic.light();
                                    closeMenu();
                                    navigate("/referral");
                                }}
                                >
                                {t("перейти", "przejdź")}
                                </button>
                            </div>

                            </div>
                        </div>

                        </div>

                        <div className="sideMenuBottom">

                        <div className="sideSupportCard">
                            <span className="sideSupportCardAccent" />

                            {/* персонаж */}
                            <img
                                src={managerDuckIMG}
                                className="sideSupportCardDuck"
                                alt=""
                            />

                            <div className="sideSupportCardContent">

                            {/* текстовая часть */}
                            <div className="sideSupportCardInfo">
                                <div className="sideSupportCardTitle">
                                {t("ПОДДЕРЖКА", "WSPARCIE")}
                                </div>

                                <button className="sideSupportCardAction"
                                    onClick={() => {
                                    haptic.light();
                                    closeMenu();
                                    navigate("/managers");
                                    }}
                                >
                                    {t("связаться", "skontaktuj się")}
                                </button>
                            </div>

                            </div>
                        </div>

                        </div>

                    </div>
                    </aside>
                </>
            )}
            
            <div className="Main_Window">
            
                <div className="mainReferralPageContainer">
            
                    <div className={`ReferralHeaderContainer reveal delay-1 ${mounted ? "visible" : ""}`}>
                        <div className="ReferralHeaderLeft">
                          <img
                            className="ReferralMenuIcon"
                            src={menuIcon}
                            onClick={() => {
                              haptic.heavy();
                              openMenu();
                            }}
                          />
                        <img
                            className="ReferralLogo"
                            src={logo}
                            alt="ELF DUCK"
                            onClick={() => {
                            haptic.heavy();
                            navigate("/");
                            }}
                        />
                        </div>
            
                        <div className="ReferralHeaderRight">
                            <div
                                className={`ReferralBonusBlock ${balancePulse ? "is-pulse" : ""}`}
                                role="button"
                                tabIndex={0}
                                onClick={showCashbackInfoAlert}
                                onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    showCashbackInfoAlert();
                                }
                                }}
                            >
                                <span className="ReferralBonusText">
                                    {Number.isInteger(Number(user?.cashbackBalance || 0))
                                    ? String(Number(user?.cashbackBalance || 0))
                                    : Number(user?.cashbackBalance || 0).toFixed(1)}
                                </span>
                              <img src={zlotyIcon} className="ReferralBonusIconRight" />
                            </div>
                            <div className="ReferralAvatarHeaderContainer">
                              {user?.photoUrl && (
                                <img
                                  src={user.photoUrl}
                                  className={`ReferralUserAvatar ${avatarLoaded ? "visible" : "hidden"}`}
                                  onLoad={() => setAvatarLoaded(true)}
                                />
                              )}
                            </div>
                        </div>
                    </div>

                    <div className="scrollReferralContent">

                        <div className={`sectionReferralTitle reveal delay-3 ${mounted ? "visible" : ""}`}>
                            <span className="sectionReferralLine" />
                            <span className="sectionReferralText">{t("Реферальная программа", "Program poleceń")}</span>
                            <span className="sectionReferralLine" />
                        </div>

                        {/* Условия реферальной программы (не скроллится, без точек) */}
                        <div className={`refInviteCard reveal delay-4 ${mounted ? "visible" : ""}`}>
                            <div className="refInviteInner">
                            <div className="refInviteTitle">
                                {t("ПРИГЛАСИ", "ZAPROŚ")} <span className="refAccent">{t("ДРУГА", "ZNAJOMEGO")}</span>
                            </div>

                            <div className="refInviteInfo">
                                <div className="refInviteInfoRow">
                                <div className="refInfoIcon">i</div>
                                <div className="refInviteInfoText">
                                    {t("ЗА КАЖДОГО ДРУГА, КОТОРЫЙ", "ZA KAŻDEGO ZNAJOMEGO, KTÓRY")}
                                    <br />
                                    {t("СОВЕРШИТ ПОКУПКУ,", "DOKONA ZAKUPU,")} <span className="refAccent">{t("ВЫ ПОЛУЧИТЕ", "OTRZYMASZ")}</span>
                                    <br />
                                    <span className="refAccent">25 ZŁ {t("БОНУСА НА СВОЙ БАЛАНС", "BONUSU NA SWOJE SALDO")}</span>
                                </div>
                                </div>

                                <div className="refInviteInfoRow">
                                <div className="refInfoIcon">i</div>
                                <div className="refInviteInfoText">
                                    {t("ТВОЙ РЕФЕРАЛ", "TWÓJ POLECONY")} <span className="refAccent">{t("ПОЛУЧИТ 10% СКИДКИ", "OTRZYMA 10% ZNIŻKI")}</span> {t("НА ПЕРВУЮ ПОКУПКУ НА СУММУ МИН.", "NA PIERWSZY ZAKUP NA KWOTĘ MIN.")} 65 ZŁ
                                </div>
                                </div>
                            </div>

                            <button
                                type="button"
                                className="refInviteBtn"
                                disabled={inviteGenerating}
                                onClick={() => {
                                haptic.light();
                                inviteFriend();
                                }}
                            >
                                {inviteGenerating
                                    ? t("ГЕНЕРАЦИЯ ССЫЛКИ...", "GENEROWANIE LINKU...")
                                    : t("ПРИГЛАСИТЬ ДРУГА", "ZAPROŚ ZNAJOMEGO")}
                                {/* {t("ПРИГЛАСИТЬ ДРУГА", "ZAPROŚ ZNAJOMEGO")} */}
                            </button>
                            </div>
                        </div>

                        <div className={`sectionReferralTitle reveal delay-3 ${mounted ? "visible" : ""}`}>
                            <span className="sectionReferralLine" />
                            <span className="sectionReferralText">{t("Условия программы", "Warunki programu")}</span>
                            <span className="sectionReferralLine" />
                        </div>

                        {/* ===== Referral list blocks ===== */}
                        <div className={`refListBlocks reveal delay-4 ${mounted ? "visible" : ""}`}>

                        {referralLoading ? (
                            <div className="refListCard">
                            <div className="refListCardTitle">
                                {t("ЗАГРУЗКА", "ŁADOWANIE")} <span className="refAccent">{t("РЕФЕРАЛОВ", "POLECONYCH")}</span>
                            </div>
                            </div>
                        ) : referralGroups.length === 0 ? (
                            <div className="refListCard">
                            <div className="refListCardTitle">
                                {t("МОИ", "MOI")} <span className="refAccent">{t("РЕФЕРАЛЫ", "POLECENI")}</span>
                            </div>

                            <div className="refListInfoRow">
                                <div className="refInfoIcon">i</div>
                                <div className="refListInfoText">
                                {t("ПОКА ЧТО У ВАС НЕТ РЕФЕРАЛОВ.", "NA RAZIE NIE MASZ JESZCZE POLECONYCH.")}
                                <br />
                                {t("ПРИГЛАСИТЕ", "ZAPROŚ")} <span className="refAccent">{t("ДРУГА", "ZNAJOMEGO")}</span>
                                {" — "}
                                <span className="refAccent">25 ZŁ</span>
                                </div>
                            </div>

                            <button
                                type="button"
                                className="refListActionBtn refListActionBtnDisabled"
                                onClick={() => claimReferralReward()}
                            >
                                {t("ПОЛУЧИТЬ 25 ZŁ НА БАЛАНС", "OTRZYMAJ 25 ZŁ NA SALDO")}
                            </button>
                            </div>
                        ) : (
                        <>
                        <div className="refClaimPanel">
                            <div className="refListCard refClaimPanelCard">
                                <div className="refListCardTitle">
                                    {t("ПОЛУЧЕНИЕ", "ODBIERANIE")}{" "}
                                    <span className="refAccent">{t("НАГРАД", "NAGRÓD")}</span>
                                </div>

                                {claimableGroups.length > 0 ? (
                                    <div className="refClaimList">
                                        {claimableGroups.map((group) => {
                                            const ref = group.members?.[0];
                                            const label =
                                                ref?.firstName ||
                                                ref?.username ||
                                                t("Реферал", "Polecony");
                                            const gid = String(group?.id || "");
                                            const isThisClaiming =
                                                claimingReward && claimingGroupId === gid;

                                            return (
                                                <div className="refClaimRow" key={`claim-${gid}`}>
                                                    <div className="refClaimRowText">
                                                        <span className="refClaimRowName">{label}</span>
                                                        <span className="refClaimRowHint">
                                                            {t("готов к выплате", "gotowy do wypłaty")}
                                                        </span>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        className="refListActionBtn refListActionBtnReady"
                                                        disabled={claimingReward}
                                                        onClick={() => {
                                                            haptic.medium();
                                                            claimReferralReward(group);
                                                        }}
                                                    >
                                                        {isThisClaiming
                                                            ? t("ЗАЧИСЛЕНИЕ...", "NALICZANIE...")
                                                            : t("ЗАБРАТЬ 25 ZŁ", "ODBIERZ 25 ZŁ")}
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <>
                                        <div className="refListInfoRow refListInfoRowCompact">
                                            <div className="refInfoIcon">i</div>
                                            <div className="refListInfoText">
                                                {t("ЧТОБЫ ПОЛУЧИТЬ НАГРАДУ,", "ABY OTRZYMAĆ NAGRODĘ,")}
                                                <br />
                                                {t("ДРУГ ДОЛЖЕН", "ZNAJOMY MUSI")}{" "}
                                                <span className="refAccent">
                                                    {t("СОВЕРШИТЬ ПОКУПКУ", "DOKONAĆ ZAKUPU")}
                                                </span>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            className="refListActionBtn refListActionBtnDisabled"
                                            disabled
                                        >
                                            {t("ПОЛУЧИТЬ 25 ZŁ НА БАЛАНС", "OTRZYMAJ 25 ZŁ NA SALDO")}
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>

                        <div className={`sectionReferralSubTitle reveal delay-3 ${mounted ? "visible" : ""}`}>
                            <span className="sectionReferralLine" />
                            <span className="sectionReferralText">{t("Список рефералов", "Lista poleconych")}</span>
                            <span className="sectionReferralLine" />
                        </div>

                        {sortedReferralGroups.map((group) => renderReferralGroupCard(group))}
                        </>
                    )}

                    </div>

                    <div className={`footerBar reveal delay-6 ${mounted ? "visible" : ""}`}>

                        <div
                            className="footerLeft"
                            onClick={() => {
                            haptic.light();

                            const channelUrl = "https://t.me/elfduck_channel";
                            const tg = window.Telegram?.WebApp;

                            try {
                                if (tg?.openLink) {
                                tg.openLink(channelUrl);
                                return;
                                }

                                if (tg?.openTelegramLink) {
                                tg.openTelegramLink(channelUrl);
                                return;
                                }
                            } catch (e) {
                                console.error("Failed to open Telegram channel:", e);
                            }

                            window.open(channelUrl, "_blank", "noopener,noreferrer");
                            }}
                        >
                            <span>{t("ELF DUCK", "ELF DUCK")}</span>
                            <img src={telegramIcon} alt="" />
                        </div>

                        <div
                            className="footerRight"
                            onClick={() => {
                            haptic.light();
                            navigate("/managers");
                            }}
                        >
                            <span>{t("Поддержка 24/7", "Wsparcie 24/7")}</span>
                            <img src={supportIcon} alt="" />
                        </div>
                            
                    </div>

                </div>

            </div>
        </div>

    </div>
    
    );
};

export default ReferralPage;