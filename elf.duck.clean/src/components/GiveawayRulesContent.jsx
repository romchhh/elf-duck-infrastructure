import zlotyIcon from "../assets/zlotyIcon.webp";
import CartInfoIcon from "../assets/CartInfoIcon.webp";
import doneIcon from "../assets/doneIcon.webp";
import buyIcon from "../assets/buyIcon.webp";
import blikIcon from "../assets/blikIcon.webp";
import cashbackCoinsIcon from "../assets/cashbackCoinsIcon.svg";
import promoTicketIcon from "../assets/promoTicketIcon.svg";
import { t } from "../utils/i18n";

function RuleRow({ icon, iconClassName = "", children }) {
  return (
    <li className="giveawayRulesRow">
      <span className={`giveawayRulesIconWrap ${iconClassName}`.trim()}>
        <img src={icon} className="giveawayRulesIcon" alt="" />
      </span>
      <span className="giveawayRulesRowText">{children}</span>
    </li>
  );
}

/** Структуровані правила (як у CRM); кастомний текст — plain fallback. */
export default function GiveawayRulesContent({ rulesText = "" }) {
  const custom = String(rulesText || "").trim();
  const looksLikeDefault =
    !custom ||
    /2\s*000\s*zł/i.test(custom) ||
    /Elf\s*Duck|ELF\s*DUCK/i.test(custom);

  if (!looksLikeDefault) {
    return <pre className="giveawayRulesText giveawayRulesText--plain">{custom}</pre>;
  }

  return (
    <div className="giveawayRulesStructured">
      <div className="giveawayRulesHero">
        <span className="giveawayRulesHeroIconWrap">
          <img src={zlotyIcon} className="giveawayRulesIcon" alt="" />
        </span>
        <div className="giveawayRulesHeroText">
          <p className="giveawayRulesHeroTitle">
            {t(
              "Каждый месяц ELF DUCK раздаёт 2 000 zł среди 25 победителей.",
              "Co miesiąc ELF DUCK rozdaje 2 000 zł wśród 25 zwycięzców."
            )}
          </p>
        </div>
      </div>

      <ul className="giveawayRulesList">
        <RuleRow icon={CartInfoIcon}>
          {t(
            "Период участия — с 1-го по 25-е число каждого месяца.",
            "Okres udziału — od 1. do 25. dnia każdego miesiąca."
          )}
        </RuleRow>
        <RuleRow icon={doneIcon}>
          {t(
            "25-го числа случайным образом определяем 25 победителей.",
            "25. dnia losujemy 25 zwycięzców."
          )}
        </RuleRow>
        <RuleRow icon={buyIcon}>
          {t(
            "Один оплаченный заказ = один шанс на победу. Сумма заказа не важна.",
            "Jedno opłacone zamówienie = jedna szansa na wygraną. Kwota zamówienia nie ma znaczenia."
          )}
        </RuleRow>
        <RuleRow icon={blikIcon} iconClassName="giveawayRulesIconWrap--blik">
          {t(
            "Заказы, оплаченные через BLIK, в розыгрыше не участвуют.",
            "Zamówienia opłacone BLIK-iem nie biorą udziału w losowaniu."
          )}
        </RuleRow>
        <RuleRow icon={promoTicketIcon} iconClassName="giveawayRulesIconWrap--ticket">
          {t(
            "Призы: 1–5-е места — по 150 zł, 6–10-е — по 100 zł, 11–25-е — по 50 zł.",
            "Nagrody: miejsca 1–5 — po 150 zł, 6–10 — po 100 zł, 11–25 — po 50 zł."
          )}
        </RuleRow>
        <RuleRow icon={cashbackCoinsIcon} iconClassName="giveawayRulesIconWrap--coins">
          {t(
            "Выигрыш автоматически начисляется на ваш баланс.",
            "Wygrana jest automatycznie dodawana do Twojego salda."
          )}
        </RuleRow>
      </ul>
    </div>
  );
}
