function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Легкий markdown + дозволені Telegram HTML-теги.
 * *жирный* **жирный** _курсив_ __подчёркнутый__ ~~зачёркнутый~~
 * ||спойлер|| `код` > цитата [текст](https://...)
 * Теги: b, i, u, s, code, pre, blockquote, tg-spoiler, a href=https
 */
export function pushMarkdownToHtml(raw) {
  let text = escapeHtml(String(raw || ""));

  text = text.replace(
    /&lt;(\/?)(b|strong|i|em|u|ins|s|strike|del|code|pre|blockquote|tg-spoiler)&gt;/gi,
    "<$1$2>"
  );
  text = text.replace(
    /&lt;a\s+href=&quot;(https?:\/\/[^"&]+)&quot;&gt;/gi,
    '<a href="$1">'
  );
  text = text.replace(/&lt;\/a&gt;/gi, "</a>");

  text = text.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi,
    (_, label, href) => {
      const safeHref = String(href || "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"');
      try {
        const parsed = new URL(safeHref);
        if (!["http:", "https:"].includes(parsed.protocol)) {
          return label;
        }
        return `<a href="${escapeHtml(parsed.toString())}">${label}</a>`;
      } catch {
        return label;
      }
    }
  );

  text = text.replace(
    /(^|\n)((?:&gt; ?[^\n]*\n?)+)/g,
    (match, lead, group) => {
      const hadBreak = /\n$/.test(String(group || ""));
      const inner = String(group || "")
        .split("\n")
        .map((line) => line.replace(/^&gt; ?/, ""))
        .join("\n")
        .replace(/\n$/, "");
      if (!inner.trim()) return match;
      return `${lead}<blockquote>${inner}</blockquote>${hadBreak ? "\n" : ""}`;
    }
  );

  text = text.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  text = text.replace(/\|\|([^|\n]+)\|\|/g, "<tg-spoiler>$1</tg-spoiler>");
  text = text.replace(/~~([^~\n]+)~~/g, "<s>$1</s>");
  text = text.replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>");
  text = text.replace(/__([^_\n]+)__/g, "<u>$1</u>");
  text = text.replace(/(?<![\w*])\*([^*\n]+)\*(?![\w*])/g, "<b>$1</b>");
  text = text.replace(/(?<![\w_])_([^_\n]+)_(?![\w_])/g, "<i>$1</i>");

  return text;
}

export function getWebAppBaseUrl() {
  return String(process.env.WEBAPP_URL || process.env.APP_URL || "")
    .trim()
    .replace(/\/+$/, "");
}

/**
 * Назви шаблонів у CRM (PL · …, PL Oferta …) — не текст для клієнта в Telegram.
 */
export function isInternalCrmPushTitle(title) {
  const t = String(title || "").trim();
  if (!t) return false;
  if (/^(PL|RU)\s*[·•\-–—]\s/i.test(t)) return true;
  if (/^PL\s+(Oferta|Nowi|Ofer)/i.test(t)) return true;
  if (/^PL\s+[Оо]фер/i.test(t)) return true;
  return false;
}

export function pushTitleForTelegram(message = {}) {
  const title = String(message?.title || "").trim();
  return isInternalCrmPushTitle(title) ? "" : title;
}

/** Не дублювати рядок «Промокод», якщо код уже є в тексті (`` `CODE` `` або слово). */
export function promoAlreadyInPushText(text, promo) {
  const code = String(promo || "").trim();
  if (!code) return true;
  const raw = String(text || "");
  const upper = raw.toUpperCase();
  const codeUpper = code.toUpperCase();
  if (upper.includes(`\`${codeUpper}\``) || upper.includes(`\`${code}\``)) {
    return true;
  }
  if (new RegExp(`\\b${code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(raw)) {
    return true;
  }
  return false;
}

/**
 * Збирає текст розсилки (markdown → HTML).
 * title/promo лишаємо для зворотної сумісності зі старими кампаніями.
 */
export function buildPushMessageHtml(message = {}) {
  const title = pushTitleForTelegram(message);
  const text = String(message?.text || "").trim();
  const promo = String(message?.promo || "").trim();

  const parts = [];

  if (title) {
    parts.push(`<b>${escapeHtml(title)}</b>`);
  }

  if (text) {
    parts.push(pushMarkdownToHtml(text));
  }

  if (promo && !promoAlreadyInPushText(text, promo)) {
    parts.push(`🎁 Промокод: <code>${escapeHtml(promo)}</code>`);
  }

  return parts.filter(Boolean).join("\n\n");
}

/**
 * PL/RU варіанти тексту розсилки.
 * Legacy `text` — якщо відповідної мови немає.
 * unknown → defaultLanguage (ru за замовчуванням).
 */
export function resolvePushTextForLanguage(message = {}, language = "") {
  const textPl = String(message?.textPl || "").trim();
  const textRu = String(message?.textRu || "").trim();
  const legacy = String(message?.text || "").trim();
  const fallback =
    String(message?.defaultLanguage || "ru").trim().toLowerCase() === "pl"
      ? "pl"
      : "ru";

  const lang =
    language === "pl" || language === "ru" ? language : fallback;

  if (lang === "ru") {
    return textRu || legacy || textPl;
  }
  return textPl || legacy || textRu;
}

/**
 * Фото окремо для RU/PL. Старе photoUrl / photoFileId —
 * спільне, якщо per-lang ще не задані.
 */
export function resolvePushPhotoForLanguage(message = {}, language = "") {
  const fallback =
    String(message?.defaultLanguage || "ru").trim().toLowerCase() === "pl"
      ? "pl"
      : "ru";
  const lang =
    language === "pl" || language === "ru" ? language : fallback;

  const photoUrlRu = String(message?.photoUrlRu || "").trim();
  const photoUrlPl = String(message?.photoUrlPl || "").trim();
  const photoFileIdRu = String(message?.photoFileIdRu || "").trim();
  const photoFileIdPl = String(message?.photoFileIdPl || "").trim();
  const legacyUrl = String(message?.photoUrl || "").trim();
  const legacyFileId = String(message?.photoFileId || "").trim();
  const hasPerLangUrl = Boolean(photoUrlRu || photoUrlPl);
  const hasPerLangFile = Boolean(photoFileIdRu || photoFileIdPl);

  if (lang === "ru") {
    return {
      photoUrl: photoUrlRu || (!hasPerLangUrl ? legacyUrl : ""),
      photoFileId: photoFileIdRu || (!hasPerLangFile ? legacyFileId : ""),
    };
  }

  return {
    photoUrl: photoUrlPl || (!hasPerLangUrl ? legacyUrl : ""),
    photoFileId: photoFileIdPl || (!hasPerLangFile ? legacyFileId : ""),
  };
}

/** Готові HTML для pl / ru / default (один раз перед циклом розсилки). */
export function buildPushMessageHtmlByLanguage(message = {}) {
  const shared = {
    title: message?.title,
    promo: message?.promo,
  };
  const textPl = resolvePushTextForLanguage(message, "pl");
  const textRu = resolvePushTextForLanguage(message, "ru");
  const defaultLang =
    String(message?.defaultLanguage || "ru").trim().toLowerCase() === "pl"
      ? "pl"
      : "ru";

  return {
    pl: buildPushMessageHtml({ ...shared, text: textPl }),
    ru: buildPushMessageHtml({ ...shared, text: textRu }),
    defaultLanguage: defaultLang,
  };
}

/**
 * Додає ?pc=<campaignId> до URL мініапу для трекінгу відкриттів з розсилки.
 */
export function appendPushCampaignParam(url, campaignId) {
  const id = String(campaignId || "").trim();
  if (!id || !url) return String(url || "");

  try {
    const parsed = new URL(String(url), getWebAppBaseUrl() || "https://local.invalid");
    parsed.searchParams.set("pc", id);
    return parsed.toString();
  } catch {
    const base = String(url);
    const sep = base.includes("?") ? "&" : "?";
    return `${base}${sep}pc=${encodeURIComponent(id)}`;
  }
}

/**
 * Інлайн-кнопки: web_app (мініап) або звичайний url.
 * buttons: [{ text, kind?: 'web_app'|'url', path?: string, url?: string }]
 * + legacy buttonText/buttonUrl
 * options.campaignId — для трекінгу відкриттів апки
 */
export function buildPushReplyMarkup(message = {}, options = {}) {
  const webAppBase = getWebAppBaseUrl();
  const campaignId = String(options?.campaignId || "").trim();
  const rows = [];

  const buttons = Array.isArray(message?.buttons) ? message.buttons : [];

  for (const button of buttons) {
    const text = String(button?.text || "").trim();
    if (!text) continue;

    const kind = String(button?.kind || "").trim().toLowerCase();
    const path = String(button?.path || "").trim();
    const url = String(button?.url || "").trim();

    if (kind === "web_app" || (path && kind !== "url")) {
      if (!webAppBase) continue;
      const normalizedPath = path
        ? path.startsWith("/")
          ? path
          : `/${path}`
        : "/";
      rows.push([
        {
          text,
          web_app: {
            url: appendPushCampaignParam(
              `${webAppBase}${normalizedPath}`,
              campaignId
            ),
          },
        },
      ]);
      continue;
    }

    if (url) {
      try {
        const parsed = new URL(url);
        if (!["http:", "https:", "tg:"].includes(parsed.protocol)) {
          continue;
        }
        rows.push([{ text, url: parsed.toString() }]);
      } catch {
        // skip invalid
      }
    }
  }

  // legacy single button
  if (!rows.length) {
    const buttonText = String(message?.buttonText || "").trim();
    const buttonUrl = String(message?.buttonUrl || "").trim();
    if (buttonText && buttonUrl) {
      const isWebApp =
        String(message?.buttonKind || "").toLowerCase() === "web_app";
      if (isWebApp && webAppBase) {
        try {
          const parsed = new URL(buttonUrl, webAppBase);
          rows.push([
            {
              text: buttonText,
              web_app: {
                url: appendPushCampaignParam(parsed.toString(), campaignId),
              },
            },
          ]);
        } catch {
          // ignore
        }
      } else {
        try {
          const parsed = new URL(buttonUrl);
          if (["http:", "https:", "tg:"].includes(parsed.protocol)) {
            rows.push([{ text: buttonText, url: parsed.toString() }]);
          }
        } catch {
          // ignore
        }
      }
    }
  }

  // Без кнопок відкриття апки не відстежити — додаємо дефолтну з pc=
  if (!rows.length && campaignId && webAppBase) {
    rows.push([
      {
        text: "Открыть магазин",
        web_app: {
          url: appendPushCampaignParam(`${webAppBase}/`, campaignId),
        },
      },
    ]);
  }

  if (!rows.length) return undefined;
  return { inline_keyboard: rows };
}

export function normalizePushButtons(rawButtons = []) {
  if (!Array.isArray(rawButtons)) return [];

  return rawButtons
    .map((button) => {
      const text = String(button?.text || "").trim().slice(0, 64);
      if (!text) return null;

      const kind =
        String(button?.kind || "web_app").trim().toLowerCase() === "url"
          ? "url"
          : "web_app";

      if (kind === "url") {
        const url = String(button?.url || "").trim();
        if (!url) return null;
        return { text, kind: "url", url, path: "" };
      }

      let path = String(button?.path || "/").trim() || "/";
      if (!path.startsWith("/")) path = `/${path}`;
      path = path.slice(0, 200);

      return { text, kind: "web_app", path, url: "" };
    })
    .filter(Boolean)
    .slice(0, 8);
}
