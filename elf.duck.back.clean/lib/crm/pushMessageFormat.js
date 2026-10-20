function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Легкий markdown → Telegram HTML.
 * Підтримка: **bold**, *italic*, _italic_, `code`, [text](https://...)
 */
export function pushMarkdownToHtml(raw) {
  let text = escapeHtml(String(raw || ""));

  // links first (URLs already escaped — restore : / for href)
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

  text = text.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  text = text.replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>");
  text = text.replace(/__([^_\n]+)__/g, "<b>$1</b>");
  text = text.replace(/(?<![\w*])\*([^*\n]+)\*(?![\w*])/g, "<i>$1</i>");
  text = text.replace(/(?<![\w_])_([^_\n]+)_(?![\w_])/g, "<i>$1</i>");

  return text;
}

export function getWebAppBaseUrl() {
  return String(process.env.WEBAPP_URL || process.env.APP_URL || "")
    .trim()
    .replace(/\/+$/, "");
}

/**
 * Збирає текст розсилки (markdown → HTML).
 * title/promo лишаємо для зворотної сумісності зі старими кампаніями.
 */
export function buildPushMessageHtml(message = {}) {
  const title = String(message?.title || "").trim();
  const text = String(message?.text || "").trim();
  const promo = String(message?.promo || "").trim();

  const parts = [];

  if (title) {
    parts.push(`<b>${escapeHtml(title)}</b>`);
  }

  if (text) {
    parts.push(pushMarkdownToHtml(text));
  }

  if (promo) {
    parts.push(`🎁 Промокод: <code>${escapeHtml(promo)}</code>`);
  }

  return parts.filter(Boolean).join("\n\n");
}

/**
 * Інлайн-кнопки: web_app (мініап) або звичайний url.
 * buttons: [{ text, kind?: 'web_app'|'url', path?: string, url?: string }]
 * + legacy buttonText/buttonUrl
 */
export function buildPushReplyMarkup(message = {}) {
  const webAppBase = getWebAppBaseUrl();
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
          web_app: { url: `${webAppBase}${normalizedPath}` },
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
              web_app: { url: parsed.toString() },
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
