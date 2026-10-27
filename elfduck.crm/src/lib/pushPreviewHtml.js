function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Той самий markdown, що й у відправці в Telegram. Нові рядки → <br/>. */
export function renderPushPreviewHtml(raw) {
  let text = escapeHtml(String(raw || ''));

  text = text.replace(
    /&lt;(\/?)(b|strong|i|em|u|ins|s|strike|del|code|pre|blockquote|tg-spoiler)&gt;/gi,
    '<$1$2>'
  );
  text = text.replace(
    /&lt;a\s+href=&quot;(https?:\/\/[^"&]+)&quot;&gt;/gi,
    '<a href="$1" class="underline">'
  );
  text = text.replace(/&lt;\/a&gt;/gi, '</a>');

  text = text.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi,
    '<a href="$2" class="underline">$1</a>'
  );

  text = text.replace(
    /(^|\n)((?:&gt; ?[^\n]*\n?)+)/g,
    (match, lead, group) => {
      const hadBreak = /\n$/.test(String(group || ''));
      const inner = String(group || '')
        .split('\n')
        .map((line) => line.replace(/^&gt; ?/, ''))
        .join('\n')
        .replace(/\n$/, '');
      if (!inner.trim()) return match;
      return `${lead}<blockquote>${inner}</blockquote>${hadBreak ? '\n' : ''}`;
    }
  );

  text = text.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  text = text.replace(/\|\|([^|\n]+)\|\|/g, '<tg-spoiler>$1</tg-spoiler>');
  text = text.replace(/~~([^~\n]+)~~/g, '<s>$1</s>');
  text = text.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
  text = text.replace(/__([^_\n]+)__/g, '<u>$1</u>');
  text = text.replace(/(?<![\w*])\*([^*\n]+)\*(?![\w*])/g, '<b>$1</b>');
  text = text.replace(/(?<![\w_])_([^_\n]+)_(?![\w_])/g, '<i>$1</i>');

  return text.replace(/\n/g, '<br/>');
}

export const PUSH_PREVIEW_CLASS =
  'whitespace-pre-wrap text-[11px] leading-snug text-muted-foreground [&_b]:font-semibold [&_b]:text-foreground [&_u]:underline [&_s]:line-through [&_code]:rounded [&_code]:bg-[hsl(255_100%_68%/0.15)] [&_code]:px-1 [&_code]:text-[hsl(255_100%_75%)] [&_i]:italic [&_blockquote]:my-1 [&_blockquote]:border-l-2 [&_blockquote]:border-[hsl(255_100%_68%/0.7)] [&_blockquote]:pl-2 [&_blockquote]:text-foreground/90 [&_tg-spoiler]:rounded [&_tg-spoiler]:bg-foreground/25 [&_tg-spoiler]:px-0.5 [&_tg-spoiler]:text-foreground [&_a]:underline';
