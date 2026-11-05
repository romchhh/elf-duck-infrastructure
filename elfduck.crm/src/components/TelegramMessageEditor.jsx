import React, { useRef } from "react";
import { cn } from "@/lib/utils";
import {
  PUSH_PREVIEW_CLASS,
  renderPushPreviewHtml,
} from "@/lib/pushPreviewHtml";

/** Той самий набір, що в Push: B / I / spoiler / code / link / U / S / quote. */
export const TELEGRAM_MARKDOWN_FORMATS = [
  { label: "B", tip: "Жирный *текст*", before: "*", after: "*" },
  { label: "I", tip: "Курсив _текст_", before: "_", after: "_" },
  { label: "спойлер", tip: "Спойлер ||текст||", before: "||", after: "||" },
  { label: "`", tip: "Код", before: "`", after: "`" },
  {
    label: "🔗",
    tip: "Посилання",
    before: "[текст](",
    after: "https://)",
  },
  { label: "U", tip: "Подчёркнутый __текст__", before: "__", after: "__" },
  { label: "S", tip: "Зачёркнутый ~~текст~~", before: "~~", after: "~~" },
  { label: "❝", tip: "Цитата", before: "> ", after: "" },
];

export function insertTelegramMarkdown(el, value, before, after = before) {
  const text = String(value || "");
  const start = el?.selectionStart ?? text.length;
  const end = el?.selectionEnd ?? text.length;
  const selected = text.slice(start, end) || "текст";
  const chunk =
    before === "> "
      ? selected
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n")
      : `${before}${selected}${after}`;
  const next = text.slice(0, start) + chunk + text.slice(end);
  const cursor = start + chunk.length;
  requestAnimationFrame(() => {
    if (!el) return;
    el.focus();
    el.setSelectionRange(cursor, cursor);
  });
  return next;
}

/**
 * RU/PL + markdown toolbar + live preview (+ optional photo).
 * Один патерн з Push для текстів Telegram у CRM.
 */
export default function TelegramMessageEditor({
  lang = "ru",
  onLangChange,
  values = { ru: "", pl: "" },
  onChange,
  disabled = false,
  rows = 6,
  hint = "",
  placeholder = "",
  previewTransform,
  photoUrl = "",
  defaultPhotoUrl = "",
  onPhotoFile,
  onClearPhoto,
  photoUploading = false,
  photoLabelEmpty = "Баннер по умолчанию",
  photoLabelCustom = "Загруженное фото",
  photoReplaceLabel = "Заменить фото",
  photoAddLabel = "Добавить фото",
  photoHint = "",
  clearPhotoLabel = "Снова стандартный баннер",
  showPhoto = false,
  showLangSwitch = true,
  showFormatToolbar = true,
  showPreview = true,
  formatHint = "*жирный* _курсив_ __подчёркнутый__ ~~зачёркнутый~~ · заполните RU и PL",
}) {
  const textareaRef = useRef(null);
  const field = lang === "pl" ? "pl" : "ru";
  const body = String(values?.[field] || "");
  const previewRaw =
    typeof previewTransform === "function" ? previewTransform(body) : body;
  const previewSrc = photoUrl || defaultPhotoUrl;

  const setBody = (next) => {
    if (typeof onChange !== "function") return;
    onChange({
      ...(values || {}),
      [field]: typeof next === "function" ? next(body) : next,
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {hint ? (
          <p className="text-[11px] leading-relaxed text-muted-2">{hint}</p>
        ) : (
          <span />
        )}
        {showLangSwitch ? (
          <div className="inline-flex rounded-lg border border-border bg-[hsl(232_26%_7%)] p-0.5">
            {[
              { key: "ru", label: "RU" },
              { key: "pl", label: "PL" },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                disabled={disabled}
                onClick={() => onLangChange?.(item.key)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
                  lang === item.key
                    ? "bg-[hsl(255_100%_68%/0.18)] text-foreground"
                    : "text-muted-2 hover:text-foreground"
                )}
              >
                {item.label}
                {String(values?.[item.key] || "").trim() ? " ✓" : ""}
              </button>
            ))}
          </div>
        ) : (
          <span />
        )}
      </div>

      <div>
        <p className="mb-1.5 text-[12px] text-muted-2">
          Текст ({lang === "pl" ? "PL" : "RU"})
        </p>
        {showFormatToolbar ? (
          <div className="mb-1.5 flex flex-wrap gap-1">
            {TELEGRAM_MARKDOWN_FORMATS.map((item) => (
              <button
                key={item.label}
                type="button"
                title={item.tip}
                disabled={disabled}
                onClick={() =>
                  setBody((current) =>
                    insertTelegramMarkdown(
                      textareaRef.current,
                      current,
                      item.before,
                      item.after
                    )
                  )
                }
                className="inline-flex h-7 min-w-7 items-center justify-center rounded-md border border-border px-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
        <textarea
          ref={textareaRef}
          rows={rows}
          disabled={disabled}
          value={body}
          placeholder={placeholder}
          onChange={(e) => setBody(e.target.value)}
          className={cn(
            "w-full resize-none rounded-lg border border-border bg-transparent px-3 py-2 text-[12px] leading-relaxed disabled:opacity-60",
            showFormatToolbar && "font-mono"
          )}
        />
        {formatHint ? (
          <p className="mt-1 text-[11px] text-muted-2">{formatHint}</p>
        ) : null}
      </div>

      {showPreview ? (
        <div className="rounded-xl border border-border/70 bg-[hsl(232_26%_6%)] p-3">
          <p className="mb-2 text-[10px] uppercase tracking-wide text-muted-2">
            Предпросмотр
          </p>
          {previewSrc ? (
            <img
              src={previewSrc}
              alt=""
              className="mb-2 max-h-36 w-full rounded-lg object-contain"
            />
          ) : null}
          <div
            className={PUSH_PREVIEW_CLASS}
            dangerouslySetInnerHTML={{
              __html: renderPushPreviewHtml(previewRaw || "Текст сообщения"),
            }}
          />
        </div>
      ) : null}

      {showPhoto ? (
        <div className="space-y-2">
          <p className="text-[12px] text-muted-2">
            {photoUrl
              ? photoLabelCustom
              : `${photoLabelEmpty} (${lang === "pl" ? "PL" : "RU"})`}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <label
              className={cn(
                "cursor-pointer rounded-lg border border-border px-3 py-2 text-[12px] text-muted-foreground hover:text-foreground",
                (disabled || photoUploading) && "pointer-events-none opacity-50"
              )}
            >
              {photoUploading
                ? "Загрузка…"
                : photoUrl || defaultPhotoUrl
                  ? photoReplaceLabel
                  : photoAddLabel}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                disabled={disabled || photoUploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  onPhotoFile?.(file);
                }}
              />
            </label>
            {photoUrl ? (
              <button
                type="button"
                disabled={disabled}
                className="text-[12px] text-muted-2 hover:text-foreground"
                onClick={() => onClearPhoto?.()}
              >
                {clearPhotoLabel}
              </button>
            ) : photoHint ? (
              <span className="text-[11px] text-muted-2">{photoHint}</span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
