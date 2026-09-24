import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "../UserContext";
import { haptic } from "../utils/haptics";

import "../styles/ReferralPage.css";
import "../styles/PromoPage.css";
import "../styles/MainPage.css";

import menuIcon from "../assets/menuIcon.webp";
import promoIcon from "../assets/promoIcon.webp";
import logo from "../assets/logo3.webp";
import coinIcon from "../assets/coinIcon.webp";
import telegramIcon from "../assets/telegramIcon.webp";
import supportIcon from "../assets/supportIcon.webp";

import zlotyIcon from "../assets/zlotyIcon.webp";

import hideSideMenuIcon from "../assets/hideSideMenuIcon.webp";

import balanceCardDuckIMG from "../assets/promocodeCardDuckIMG.webp";

import bucketDuckIMG from "../assets/bucketDuckIMG.webp";

import savedDuckIMG from "../assets/savedDuckIMG.webp";

import historyDuckIMG from "../assets/historyDuckIMG.webp";

import refferalDucksIMG from "../assets/refferalDucksIMG.webp";

import managerDuckIMG from "../assets/managerDuckIMG.webp";

import {

  getCurrentLanguage,

  setCurrentLanguage,

  t,

} from "../utils/i18n";

const API_URL = String(

  import.meta.env.VITE_API_URL || ""

).replace(/\/$/, "");

export default function PromoPage() {
  const navigate = useNavigate();
  const { user, setUser } = useUser();

    const [liveCashbackBalance, setLiveCashbackBalance] = useState(

        Number(user?.cashbackBalance ?? user?.balance ?? 0)

    );

  const [menuVisible, setMenuVisible] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isMenuClosing, setIsMenuClosing] = useState(false);
    const [languageMenuOpen, setLanguageMenuOpen] = useState(false);

    const [language, setLanguage] = useState(() => getCurrentLanguage());

    const displayName = String(user?.firstName || "").trim();
    const displayUsername = String(user?.username || "").trim();

    const openMenu = () => {
    if (menuVisible) return;

    haptic.light();
    setMenuVisible(true);

    requestAnimationFrame(() => {
        setIsMenuOpen(true);
    });
    };

    const closeMenu = () => {
        if (isMenuClosing) return;

        setIsMenuClosing(true);
        setIsMenuOpen(false);

        window.setTimeout(() => {
            setMenuVisible(false);
            setIsMenuClosing(false);
        }, 280);
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
    document.body.style.overflow = menuVisible
        ? "hidden"
        : "";

    return () => {
        document.body.style.overflow = "";
    };
    }, [menuVisible]);

    useEffect(() => {
    const onKeyDown = (event) => {
        if (event.key === "Escape") {
        closeMenu();
        }
    };

    if (isMenuOpen) {
        window.addEventListener(
        "keydown",
        onKeyDown
        );
    }

    return () => {
        window.removeEventListener(
        "keydown",
        onKeyDown
        );
    };
    }, [isMenuOpen, isMenuClosing]);

    const [promoCode, setPromoCode] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [result, setResult] = useState(null);

    useEffect(() => {
        setLiveCashbackBalance(
            Number(
            user?.cashbackBalance ??
                user?.balance ??
                0
            )
        );
    }, [user?.cashbackBalance, user?.balance]);

    const cashbackBalance = liveCashbackBalance;

    const normalizedPromoCode = useMemo(
    () =>
        String(promoCode || "")
        .trim()
        .toUpperCase(),
    [promoCode]
    );

    const handleActivatePromo = async () => {
    if (
        !normalizedPromoCode ||
        isSubmitting
    ) {
        return;
    }

    setIsSubmitting(true);
    setResult(null);

    try {
        const telegramInitData = String(
        window?.Telegram?.WebApp?.initData || ""
        ).trim();

        const response = await fetch(
        `${API_URL}/promo-codes/activate`,
        {
            method: "POST",

            headers: {
            "Content-Type": "application/json",
            "x-telegram-init-data":
                telegramInitData,
            },

            body: JSON.stringify({
            code: normalizedPromoCode,
            }),
        }
        );

        const data = await response
        .json()
        .catch(() => ({}));

        if (
        !response.ok ||
        data?.ok === false
        ) {
        const errorCode = String(
            data?.error || ""
        );

        const message =
            errorCode === "PROMO_ALREADY_USED"
            ? t(

                "Вы уже использовали этот промокод.",

                "Ten kod promocyjny został już wykorzystany."

                )
            : errorCode === "PROMO_NOT_FOUND"
                ? t(
                    "Промокод недействителен.",
                    "Kod promocyjny jest nieprawidłowy."
                    )
                : errorCode ===
                    "INVALID_TELEGRAM_INIT_DATA"
                ? t(
                    "Не удалось подтвердить пользователя. Откройте приложение через Telegram.",
                    "Nie udało się zweryfikować użytkownika. Otwórz aplikację przez Telegram."
                )
                : t(
                    "Не удалось активировать промокод. Попробуйте ещё раз.",
                    "Nie udało się aktywować kodu promocyjnego. Spróbuj ponownie."
                );

        setResult({
            type: "error",
            message,
        });

        return;
        }

        const amountZl = Number(
            data?.amountZl || 0
            );

            const balanceFromServer = Number(
            data?.cashbackBalance ??
                data?.balance ??
                NaN
            );

            setLiveCashbackBalance((currentBalance) =>
            Number.isFinite(balanceFromServer)
                ? balanceFromServer
                : Number(
                    (currentBalance + amountZl).toFixed(2)
                )
            );

            const nextBalance = Number.isFinite(balanceFromServer)
                ? balanceFromServer
                : Number(
                    (
                        Number(user?.cashbackBalance || 0) +
                        amountZl
                    ).toFixed(2)
                );

            setUser((prev) => ({
                ...prev,
                cashbackBalance: nextBalance,
                balance: nextBalance,
            }));

        setResult({
        type: "success",

            message:
                t(

                `Промокод активирован! ${amountZl.toFixed(2)} PLN зачислены на ваш баланс.`,

                `Kod promocyjny został aktywowany! ${amountZl.toFixed(2)} PLN zostało dodane do Twojego salda.`

                )
            });
    } catch (error) {
        console.error(
        "Promo activation error:",
        error
        );

        setResult({
        type: "error",

        message:
            t(
                "Ошибка соединения. Проверьте интернет и попробуйте ещё раз.",
                "Błąd połączenia. Sprawdź internet i spróbuj ponownie."
            ),
        });
    } finally {
        setIsSubmitting(false);
    }
    };

  return (
    <div className="ReferralApp PromoReferralApp">
        {menuVisible && (
            <>
                <div
                className={`sideMenuBackdrop ${
                    isMenuClosing ? "closing" : ""
                }`}
                onClick={closeMenu}
                />

                <aside
                className={`sideMenu ${
                    isMenuOpen ? "open" : ""
                } ${
                    isMenuClosing ? "closing" : ""
                }`}
                >
                <div className="sideMenuInner">
                    <div className="sideMenuScroll">
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
                                {cashbackBalance.toFixed(1)}
                            </span>

                            <span className="balanceBadge">
                                {t("кэшбек", "cashback")}
                            </span>
                            </div> */}

                            <button
                            type="button"
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

                        <img
                        src={bucketDuckIMG}
                        className="sideMenuCardDuck"
                        alt=""
                        />

                        <div className="sideMenuCardContent">
                        <div className="sideMenuCardInfo">
                            <div className="sideMenuCardTitle">
                            {t("КОРЗИНА", "KOSZYK")}
                            </div>

                            <button
                            type="button"
                            className="sideMenuCardAction"
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

                        <img
                        src={savedDuckIMG}
                        className="sideSavedCardDuck"
                        alt=""
                        />

                        <div className="sideSavedCardContent">
                        <div className="sideSavedCardInfo">
                            <div className="sideSavedCardTitle">
                            {t("ИЗБРАННОЕ", "ULUBIONE")}
                            </div>

                            <button
                            type="button"
                            className="sideSavedCardAction"
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

                        <img
                        src={historyDuckIMG}
                        className="sideHistoryCardDuck"
                        alt=""
                        />

                        <div className="sideHistoryCardContent">
                        <div className="sideHistoryCardInfo">
                            <div className="sideHistoryCardTitle">
                            {t("ИСТОРИЯ", "HISTORIA")}
                            <br />
                            {t("ПОКУПОК", "ZAKUPÓW")}
                            </div>

                            <button
                            type="button"
                            className="sideHistoryCardAction"
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

                        <img
                        src={refferalDucksIMG}
                        className="sideRefferalCardDuck"
                        alt=""
                        />

                        <div className="sideRefferalCardContent">
                        <div className="sideRefferalCardInfo">
                            <div className="sideRefferalCardTitle">
                            {t("РЕФЕРАЛЬНАЯ", "PROGRAM")}
                            <br />
                            {t("ПРОГРАММА", "POLECEŃ")}
                            </div>

                            <button
                            type="button"
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

                        <img
                        src={managerDuckIMG}
                        className="sideSupportCardDuck"
                        alt=""
                        />

                        <div className="sideSupportCardContent">
                        <div className="sideSupportCardInfo">
                            <div className="sideSupportCardTitle">
                            {t("ПОДДЕРЖКА", "WSPARCIE")}
                            </div>

                            <button
                            type="button"
                            className="sideSupportCardAction"
                            onClick={() => {
                                haptic.light();
                                closeMenu();
                                navigate("/managers");
                            }}
                            >
                            {t(
                                "связаться",
                                "skontaktuj się"
                            )}
                            </button>
                        </div>
                        </div>
                    </div>
                    </div>
                </div>
                </aside>
            </>
            )}
      <div className="Referral_Window">
        <header className="ReferralHeaderContainer">
          <div className="ReferralHeaderLeft">
            <button
              type="button"
              className="PromoHeaderButton"
              onClick={openMenu}
              aria-label="Открыть меню"
            >
              <img
                src={menuIcon}
                className="ReferralMenuIcon"
                alt=""
              />
            </button>

            <button
              type="button"
              className="PromoHeaderButton PromoLogoButton"
              onClick={() => navigate("/")}
              aria-label="На главную"
            >
              <img
                src={logo}
                className="ReferralLogo"
                alt="ELF DUCK"
              />
            </button>
          </div>

          <div className="ReferralHeaderRight">
            <div className="ReferralBonusBlock">
              <span className="ReferralBonusText">
                {cashbackBalance.toFixed(1)}
              </span>

              <img
                src={coinIcon}
                className="ReferralBonusIconRight"
                alt="PLN"
              />
            </div>

            <div
              className={`ReferralAvatarHeaderContainer ${
                user?.photoUrl
                  ? "visible"
                  : "hidden"
              }`}
            >
              {user?.photoUrl ? (
                <img
                  src={user.photoUrl}
                  className="ReferralUserAvatar"
                  alt=""
                />
              ) : null}
            </div>
          </div>
        </header>

        <div className="ReferralScrollContent">
          <main className="mainRefferalPageContainer">
            <div className="sectionReferralTitle">
              <span className="sectionReferralLine" />

              <span className="sectionReferralText">
                {t("Промокод", "Promokod")}
              </span>

              <span className="sectionReferralLine" />
            </div>

            <section className="refInviteCard PromoInviteCard">
              <div className="refInviteInner PromoInviteInner">
                <div className="PromoGiftWrap" aria-hidden="true">
                    <div className="PromoGiftGlow" />

                    <img src={promoIcon} className="PromoGiftImage" alt="" />
                </div>
                <h1 className="refInviteTitle PromoInviteTitle">
                  {t("ВВЕДИТЕ", "WPISZ")}{" "}
                  <span className="refAccent">
                      {t("ПРОМОКОД", "KOD PROMOCYJNY")}
                  </span>
                </h1>

                <div className="refInviteInfo PromoInviteInfo">
                  <div className="refInviteInfoRow">
                    <div className="refInfoIcon">
                      i
                    </div>

                    <div className="refInviteInfoText">
                        {t(

                        "ВВЕДИТЕ ПРОМОКОД, ЧТОБЫ ПОЛУЧИТЬ БОНУС НА СВОЙ БАЛАНС",

                        "WPISZ KOD PROMOCYJNY, ABY OTRZYMAĆ BONUS NA SWOJE SALDO"

                        )}
                    </div>
                  </div>

                  <div className="refInviteInfoRow">
                    <div className="refInfoIcon">
                      i
                    </div>

                    <div className="refInviteInfoText">
                        {t(

                        "ОДИН ПРОМОКОД МОЖНО ИСПОЛЬЗОВАТЬ ТОЛЬКО ОДИН РАЗ",

                        "KAŻDY KOD PROMOCYJNY MOŻNA WYKORZYSTAĆ TYLKO RAZ"

                        )}
                    </div>
                  </div>
                </div>

                <div className="PromoCodeFieldWrap">
                    <div
                    className={`PromoCodeFieldShell ${
                        normalizedPromoCode ? "has-value" : ""
                    }`}
                    >
                    <input
                        className="PromoCodeField"
                        type="text"
                        inputMode="text"
                        autoComplete="off"
                        spellCheck={false}
                        value={promoCode}
                        placeholder={t(

                        "Введите промокод",

                        "Wpisz kod promocyjny"

                        )}
                        onChange={(event) => {
                        const nextValue = event.target.value
                            .replace(/[^a-zA-Z0-9_-]/g, "")
                            .slice(0, 32);

                        setPromoCode(nextValue);
                        setResult(null);
                        }}
                        onKeyDown={(event) => {
                        if (event.key === "Enter") {
                            event.preventDefault();
                            handleActivatePromo();
                        }
                        }}
                    />

                    {normalizedPromoCode ? (
                        <button
                        type="button"
                        className="PromoCodeClearButton"
                        aria-label={t(
                        "Очистить промокод",
                        "Wyczyść kod promocyjny"
                        )}
                        onClick={() => {
                            haptic.light();
                            setPromoCode("");
                            setResult(null);
                        }}
                        >
                        <span aria-hidden="true">×</span>
                        </button>
                    ) : null}
                    </div>
                </div>

                <button
                    type="button"
                    className="promoInputBtn PromoActivateButton"
                    onClick={handleActivatePromo}
                    disabled={!normalizedPromoCode || isSubmitting}
                >
                {isSubmitting

                    ? t("АКТИВАЦИЯ...", "AKTYWACJA...")

                    : t(

                        "ИСПОЛЬЗОВАТЬ ПРОМОКОД",

                        "UŻYJ KODU PROMOCYJNEGO"

                    )}
                </button>

              </div>
            </section>

            <section
                className={`PromoHintCard ${
                    result ? `PromoHintCard--${result.type}` : ""
                }`}
                role={result ? "status" : undefined}
                >
                <div className="PromoHintIcon" aria-hidden="true">
                    {result
                    ? result.type === "success"
                        ? "✓"
                        : "!"
                    : "i"}
                </div>

                <div className="PromoHintText">
                    {result ? (
                    <div className="PromoHintResultText">
                        {result.message}
                    </div>
                    ) : (
                    <>
                        <div className="PromoHintTitle">
                            {t(

                            "ЕСЛИ У ВАС ЕСТЬ ПРОМОКОД — ВВЕДИТЕ ЕГО ВЫШЕ.",

                            "JEŚLI MASZ KOD PROMOCYJNY — WPISZ GO POWYŻE."

                            )}
                        </div>

                        <div className="PromoHintAccent">
                            {t(
                                "КЭШБЕК БУДЕТ ЗАЧИСЛЕН НА ВАШ БАЛАНС.",
                                "KASZBEK ZOSTANIE ZAŁADOWANY NA TWOJE KONTO."
                            )}
                        </div>
                    </>
                    )}
                </div>
            </section>

            <footer className="footerBar PromoFooterBar">
            <div
                className="footerLeft"
                role="button"
                tabIndex={0}
                onClick={() => {
                haptic.light();

                const channelUrl =
                    "https://t.me/elfduck_channel";

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
                } catch (error) {
                    console.error(
                    "Failed to open Telegram channel:",
                    error
                    );
                }

                window.open(
                    channelUrl,
                    "_blank",
                    "noopener,noreferrer"
                );
                }}
                onKeyDown={(event) => {
                if (
                    event.key === "Enter" ||
                    event.key === " "
                ) {
                    event.preventDefault();
                    event.currentTarget.click();
                }
                }}
            >
                <span>ELF DUCK</span>

                <img
                src={telegramIcon}
                alt=""
                />
            </div>

            <div
                className="footerRight"
                role="button"
                tabIndex={0}
                onClick={() => {
                haptic.light();
                navigate("/managers");
                }}
                onKeyDown={(event) => {
                if (
                    event.key === "Enter" ||
                    event.key === " "
                ) {
                    event.preventDefault();
                    event.currentTarget.click();
                }
                }}
            >
                <span>{t("Поддержка 24/7", "Wsparcie 24/7")}</span>

                <img
                src={supportIcon}
                alt=""
                />
            </div>
            </footer>
          </main>
        </div>
      </div>
    </div>
  );
}