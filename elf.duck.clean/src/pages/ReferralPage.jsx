import React, { useState, useEffect, useRef} from "react";
import "../styles/ReferralPage.css";
import { useUser } from "../UserContext";
import { useNavigate } from "react-router-dom";
import { haptic } from "../utils/haptics";
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


const ReferralPage = () => {

    /* ================= GENERAL ================= */

    const navigate = useNavigate();
    const { userLoading } = useUser();

    const { user, initials, displayName, displayUsername } = useUser();
    const [avatarLoaded, setAvatarLoaded] = useState(false);
    const [mounted, setMounted] = useState(false);
    const lang = getCurrentLanguage();

    const [referralStatus, setReferralStatus] = useState(null);
    const [referralLoading, setReferralLoading] = useState(false);
    const [claimingReward, setClaimingReward] = useState(false);
    const [inviteGenerating, setInviteGenerating] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
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
    }, [user?.telegramId]);

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
    const refCode = user?.referral?.code || user?.id || "";

    // 1) Пытаемся сделать prepared share (как Gorilla Case)
    if (tg?.shareMessage) {
        try {
        const data = await apiFetch(`/tg/prepared-referral-message`, {
            method: "POST",
            body: JSON.stringify({ refCode }),
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

    // 2) fallback: всегда откроется обычный share-url, если prepared share не сработал
    const deepLink = `https://t.me/elfduck_shop_bot?startapp=${encodeURIComponent(`ref_${refCode}`)}`;
    const text = `🦆 ELF DUCK\n${t("Залетай по моей ссылке и получи бонус 👇", "Wejdź z mojego linku i odbierz bonus 👇")}`;
    const shareLink = `https://t.me/share/url?url=${encodeURIComponent(deepLink)}&text=${encodeURIComponent(text)}`;

    if (tg?.openTelegramLink) tg.openTelegramLink(shareLink);
        else window.open(shareLink, "_blank");

        setTimeout(() => {
            setInviteGenerating(false);
        }, 400);

    };
        
    const referralGroups = Array.isArray(referralStatus?.groups) ? referralStatus.groups : [];

    const hasPendingSingleGroup = referralGroups.some(
      (group) => Array.isArray(group.members) && group.members.length === 1
    );

    // показываем ожидающий блок если есть хотя бы один незавершённый реферал (1 из 2)
    const shouldRenderWaitingCard = hasPendingSingleGroup;

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
                    Array.isArray(group?.members) &&
                    group.members.length > 0 &&
                    group?.isClaimed !== true
            ) ||
            null;

        const members = Array.isArray(groupForCheck?.members) ? groupForCheck.members.filter(Boolean) : [];
        const completedMembers = members.filter((m) => m?.completed === true);
        const pendingMembers = members.filter((m) => m?.completed !== true);

        const showGroupRequirementAlert = () => {
            if (members.length < 2) {
                showPopupMessage(
                    t("Реферальная программа", "Program poleceń"),
                    t(
                        "Чтобы получить награду 25 zł за эту группу, нужно пригласить ещё одного реферала.\n\nПосле этого каждый из двух рефералов в группе должен совершить минимум одну покупку.",
                        "Aby otrzymać nagrodę 25 zł za tę grupę, musisz zaprosić jeszcze jednego poleconego.\n\nNastępnie każdy z dwóch poleconych w tej grupie musi złożyć co najmniej jedno zamówienie."
                    )
                );
                return true;
            }

            if (completedMembers.length === 1 && pendingMembers.length === 1) {
                showPopupMessage(
                    t("Реферальная программа", "Program poleceń"),
                    `${completedMembers[0]?.displayName || t("Один из рефералов", "Jeden z poleconych")} ${t("уже совершил первую покупку.", "już złożył pierwsze zamówienie.")}\n\n` +
                    `${pendingMembers[0]?.displayName || t("Второй реферал", "Drugi polecony")} ${t("ещё не совершил первую покупку.", "jeszcze nie złożył pierwszego zamówienia.")} ` +
                    `${t("Чтобы вы получили награду, ему нужно оформить свой первый заказ.", "Aby otrzymać nagrodę, musi złożyć swoje pierwsze zamówienie.")}`
                );
                return true;
            }

            if (members.length >= 2 && completedMembers.length === 0) {
                const usersText = `\n\n${t("Рефералы в этой группе:", "Poleceni w tej grupie:")}\n• ${members
                    .slice(0, 2)
                    .map((m) => m?.displayName || t("Пользователь", "Użytkownik"))
                    .join("\n• ")}`;

                showPopupMessage(
                    t("Реферальная программа", "Program poleceń"),
                    t("Эти рефералы ещё не совершили ни одной покупки.\n\n", "Ci poleceni nie złożyli jeszcze żadnego zamówienia.\n\n") +
                    t("Чтобы вы получили награду 25 zł, каждому из них нужно оформить хотя бы один заказ.", "Aby otrzymać nagrodę 25 zł, każdy z nich musi złożyć przynajmniej jedno zamówienie.") +
                    usersText
                );
                return true;
            }

            return false;
        };

        if (!groupForCheck) {
            showPopupMessage(
                t("Реферальная программа", "Program poleceń"),
                t("Для получения награды необходимо пригласить двух рефералов в одну группу награды.", "Aby otrzymać nagrodę, trzeba zaprosić dwóch poleconych do jednej grupy nagrody.")
            );
            return;
        }

        if (groupForCheck?.isClaimed === true || groupForCheck?.rewardClaimed === true) {
            showPopupMessage(
                t("Реферальная программа", "Program poleceń"),
                t("Награда за эту группу уже была начислена на ваш кэшбек баланс. Чтобы получить следующую награду, пригласите ещё двух рефералов.", "Nagroda za tę grupę została już naliczona na Twój balans cashback. Aby otrzymać kolejną nagrodę, zaproś jeszcze dwóch poleconych.")
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
                        members.length === 2 &&
                        group?.isClaimed !== true &&
                        group?.rewardClaimed !== true
                    );
                });

                if (firstWaitingPurchaseGroup) {
                    groupForCheck = firstWaitingPurchaseGroup;
                } else {
                    const firstIncompleteGroup = referralGroups.find((group) => {
                        const members = Array.isArray(group?.members) ? group.members : [];
                        return members.length < 2;
                    });

                    if (firstIncompleteGroup) {
                        groupForCheck = firstIncompleteGroup;
                    }
                }
            }
        }

        if (showGroupRequirementAlert(groupForCheck)) {
            return;
        }

        setClaimingReward(true);

        const data = await apiFetch(`/referral/claim`, {
            method: "POST",
            body: JSON.stringify({
                groupId: String(groupForCheck?.id || ""),
            }),
        });

        if (data?.ok && data?.status === "REWARD_GRANTED") {
            showPopupMessage(
                t("Реферальная программа", "Program poleceń"),
                `${t("Награда", "Nagroda")} ${Number(data?.amount || 25)} zł ${t("начислена на кэшбек баланс!", "została naliczona na saldo cashback!")}`
            );
        } else if (data?.status === "ONE_COMPLETED") {
            showPopupMessage(
                t("Реферальная программа", "Program poleceń"),
                `${data?.completed || t("Один из рефералов", "Jeden z poleconych")} ${t("уже совершил первую покупку.", "już złożył pierwsze zamówienie.")}\n\n` +
                `${data?.pending || t("Второй реферал", "Drugi polecony")} ${t("ещё не совершил первую покупку.", "jeszcze nie złożył pierwszego zamówienia.")} ` +
                `${t("Чтобы вы получили награду, ему нужно оформить свой первый заказ.", "Aby otrzymać nagrodę, musi złożyć swoje pierwsze zamówienie.")}`
            );
        } else if (data?.status === "NONE_COMPLETED") {
            const usersText = Array.isArray(data?.users) && data.users.length
                ? `\n\n${t("Рефералы в этой группе:", "Poleceni w tej grupie:")}\n• ${data.users.join("\n• ")}`
                : "";

            showPopupMessage(
                t("Реферальная программа", "Program poleceń"),
                t("Эти рефералы ещё не совершили ни одной покупки.\n\n", "Ci poleceni nie złożyli jeszcze żadnego zamówienia.\n\n") +
                t("Чтобы вы получили награду 25 zł, каждому из них нужно оформить хотя бы один заказ.", "Aby otrzymać nagrodę 25 zł, każdy z nich musi złożyć przynajmniej jedno zamówienie.") +
                usersText
            );
        } else if (data?.status === "NOT_ENOUGH_REFERRALS") {
            showPopupMessage(
                t("Реферальная программа", "Program poleceń"),
                t("Чтобы получить награду 25 zł за эту группу, нужно пригласить ещё одного реферала.\n\nПосле этого каждый из двух рефералов в группе должен совершить минимум одну покупку.", "Aby otrzymać nagrodę 25 zł za tę grupę, musisz zaprosić jeszcze jednego poleconego.\n\nNastępnie każdy z dwóch poleconych w tej grupie musi złożyć co najmniej jedno zamówienie.")
            );
        } else if (data?.status === "ALREADY_CLAIMED") {
            showPopupMessage(
                t("Реферальная программа", "Program poleceń"),
                t("Награда за эту группу уже была начислена на ваш кэшбек баланс. Чтобы получить следующую награду, пригласите ещё двух рефералов.", "Nagroda za tę grupę została już naliczona na Twój balans cashback. Aby otrzymać kolejną nagrodę, zaproś jeszcze dwóch poleconych.")
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

    return (
        <div className={`ReferralApp reveal delay-5 ${mounted ? "visible" : ""}`}>

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
                            <div className="ReferralBonusBlock" 
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
                                {t("ПРИГЛАСИТЕ", "ZAPROŚ")} <span className="refAccent">2 {t("РЕФЕРАЛА", "POLECONYCH")}</span>
                            </div>

                            <div className="refInviteInfo">
                                <div className="refInviteInfoRow">
                                <div className="refInfoIcon">i</div>
                                <div className="refInviteInfoText">
                                    {t("ЗА КАЖДЫХ ДВУХ ДРУЗЕЙ, КОТОРЫЕ", "ZA KAŻDYCH DWÓCH ZNAJOMYCH, KTÓRZY")}
                                    <br />
                                    {t("СОВЕРШАТ ПОКУПКУ,", "DOKONAJĄ ZAKUPU,")} <span className="refAccent">{t("ВЫ ПОЛУЧИТЕ", "OTRZYMASZ")}</span>
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
                                {t("ПРИГЛАСИТЕ", "ZAPROŚ")} <span className="refAccent">{t("ДВОИХ РЕФЕРАЛОВ", "DWÓCH POLECONYCH")}</span>
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
                        <div className="refListCard">
                            <div className="refListCardTitle">
                                {t("МОИ", "MOI")} <span className="refAccent">{t("РЕФЕРАЛЫ", "POLECENI")}</span>
                            </div>

                            <div className="refListInfoRow">
                                <div className="refInfoIcon">i</div>
                                <div className="refListInfoText">
                                    {t("ЧТОБЫ ПОЛУЧИТЬ НАГРАДУ, НЕОБХОДИМО", "ABY OTRZYMAĆ NAGRODĘ, MUSISZ")}
                                    <br />
                                    {t("ПРИГЛАСИТЬ", "ZAPROSIĆ")} <span className="refAccent">{t("ДВОИХ РЕФЕРАЛОВ", "DWÓCH POLECONYCH")}</span>
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

                        <div className={`sectionReferralSubTitle reveal delay-3 ${mounted ? "visible" : ""}`}>
                            <span className="sectionReferralLine" />
                            <span className="sectionReferralText">{t("Список рефералов", "Lista poleconych")}</span>
                            <span className="sectionReferralLine" />
                        </div>

                        {referralGroups.map((group) => {
                        if (group.members.length === 1) {
                            const ref = group.members[0];

                            return (
                            <div className="refListCard" key={`group-${group.pairIndex}`}>
                                <div className="refReferralTopRow">
                                <div className="refReferralLeft">
                                    <img
                                    className="refReferralAvatar"
                                    src={ref.photoUrl || "https://placehold.co/100x100/png"}
                                    alt=""
                                    />
                                    <div className="refReferralNameBlock">
                                    <div className="refReferralName">
                                        {ref.firstName || ref.username || t("Реферал", "Polecony")}
                                    </div>
                                    <div className="refReferralUsername">
                                        {ref.username ? `@${ref.username}` : `ID ${ref.telegramId}`}
                                    </div>
                                    </div>
                                </div>

                                <div className="refReferralDatePill">
                                    {t("приглашен", "zaproszony")} {ref.invitedAt ? new Date(ref.invitedAt).toLocaleDateString(lang === "pl" ? "pl-PL" : "ru-RU", { day: "2-digit", month: "2-digit" }) : "—"}
                                </div>
                                </div>

                                <div className="refListInfoRow refListInfoRowCompact">
                                <div className="refInfoIcon">i</div>
                                <div className="refListInfoText">
                                    {t("ЧТОБЫ ПОЛУЧИТЬ НАГРАДУ, НЕОБХОДИМО", "ABY OTRZYMAĆ NAGRODĘ, MUSISZ")}
                                    <br />
                                    {t("ПРИГЛАСИТЬ", "ZAPROSIĆ")} <span className="refAccent">{t("ЕЩЁ ОДНОГО РЕФЕРАЛА", "JESZCZE JEDNEGO POLECONEGO")}</span>
                                </div>
                                </div>

                            <button
                                type="button"
                                className="refListActionBtn refListActionBtnDisabled"
                                onClick={() => claimReferralReward(group)}
                            >
                                {t("ПОЛУЧИТЬ 25 ZŁ НА БАЛАНС", "OTRZYMAJ 25 ZŁ NA SALDO")}
                            </button>
                            </div>
                            );
                        }

                        return (
                            <div className="refListCard" key={`group-${group.pairIndex}`}>
                            <div className="refReferralPeople">
                                {group.members.map((ref) => (
                                <div className="refReferralPerson" key={ref.telegramId}>
                                    <img
                                    className="refReferralAvatar"
                                    src={ref.photoUrl || "https://placehold.co/100x100/png"}
                                    alt=""
                                    />
                                    <div className="refReferralNameBlock">
                                    <div className={`refReferralName ${group.isClaimed || group.isClaimable ? "refReferralNameGreen" : ""}`}>
                                        {ref.firstName || ref.username || t("Реферал", "Polecony")}
                                    </div>
                                    <div className="refReferralUsername">
                                        {ref.username ? `@${ref.username}` : `ID ${ref.telegramId}`}
                                    </div>
                                    </div>

                                    <div className="refReferralDatePill">
                                    {t("приглашен", "zaproszony")} {ref.invitedAt ? new Date(ref.invitedAt).toLocaleDateString(lang === "pl" ? "pl-PL" : "ru-RU", { day: "2-digit", month: "2-digit" }) : "—"}
                                    </div>
                                </div>
                                ))}
                            </div>

                            <button
                                type="button"
                                className={group.isClaimed ? "refRewardBtn" : "refListActionBtn"}
                                disabled={claimingReward || group.isClaimed}
                                onClick={group.isClaimed ? undefined : () => claimReferralReward(group)}
                            >
                                {group.isClaimed
                                  ? t("НАГРАДА ПОЛУЧЕНА!", "NAGRODA ODEBRANA!")
                                  : t("ПОЛУЧИТЬ 25 ZŁ НА БАЛАНС", "OTRZYMAJ 25 ZŁ NA SALDO")}
                            </button>
                            </div>
                        );
                        })}
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