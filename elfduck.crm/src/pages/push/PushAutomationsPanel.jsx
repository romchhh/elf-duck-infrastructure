import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Smartphone } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import TelegramMessageEditor from "@/components/TelegramMessageEditor";
import { PUSH_PREVIEW_CLASS, renderPushPreviewHtml } from "@/lib/pushPreviewHtml";
import { cn } from "@/lib/utils";
import { crmFetchJson } from "@/lib/crmFetch";
import { compressImageForUpload } from "@/lib/compressImage";

const EVENTS = [
  {
    trigger: "first_purchase",
    title: "Первая покупка",
    when: "Заказ выполнен, и это первая покупка клиента.",
    delayMode: "after",
    presets: [
      { minutes: 0, label: "Сразу" },
      { minutes: 60, label: "1 час" },
      { minutes: 1440, label: "1 день" },
      { minutes: 4320, label: "3 дня" },
    ],
    placeholder:
      "Спасибо за первый заказ.\n\nВот −10% на следующий: `КОД`",
  },
  {
    trigger: "lead_followup",
    title: "Зашёл и не купил",
    when: "Отсчёт с первого захода в магазин. Если успеет купить — сообщение не уйдёт.",
    delayMode: "days",
    presets: [
      { minutes: 1440, label: "1 день" },
      { minutes: 2880, label: "2 дня" },
      { minutes: 4320, label: "3 дня" },
      { minutes: 10080, label: "7 дней" },
    ],
    placeholder: "Вы заглядывали в ElfDuck.\n\nЗаказ ещё можно оформить со скидкой.",
  },
  {
    trigger: "cashback_expiring",
    title: "Кэшбек сгорает",
    when: "Один раз, за 5 дней до сгорания. В тексте: {amount}, {days}, {date}.",
    delayMode: "none",
    presets: [],
    placeholder:
      "Кэшбек {amount} zł сгорит {date}.\nОсталось {days} дн. — успейте потратить.",
  },
  {
    trigger: "customer_sleeping",
    title: "Клиент заснул",
    when: "Статус «Спящий»: обычный интервал покупок + 7 дней тишины. После новой покупки и нового «сна» уйдёт снова.",
    delayMode: "after",
    presets: [
      { minutes: 0, label: "Сразу" },
      { minutes: 1440, label: "1 день" },
      { minutes: 4320, label: "3 дня" },
      { minutes: 10080, label: "7 дней" },
    ],
    placeholder: "Давно не виделись.\n\nВернитесь — для вас есть предложение.",
  },
];

function plural(n, one, few, many) {
  const abs = Math.abs(Number(n) || 0);
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function splitDelay(minutes) {
  const value = Math.max(0, Number(minutes || 0));
  if (value > 0 && value % 1440 === 0) return { amount: value / 1440, unit: "days" };
  if (value > 0 && value % 60 === 0) return { amount: value / 60, unit: "hours" };
  return { amount: value, unit: "minutes" };
}

function joinDelay(amount, unit) {
  const value = Math.max(0, Number(amount || 0));
  const max = 14 * 1440;
  if (unit === "days") return Math.min(max, Math.round(value * 1440));
  if (unit === "hours") return Math.min(max, Math.round(value * 60));
  return Math.min(max, Math.round(value));
}

function formatDelay(event, minutes) {
  if (event?.delayMode === "none") return "за 5 дней до сгорания";
  const m = Math.max(0, Number(minutes || 0));
  if (m <= 0) return "сразу";
  if (m % 1440 === 0) {
    const days = m / 1440;
    return `через ${days} ${plural(days, "день", "дня", "дней")}`;
  }
  if (m % 60 === 0) {
    const hours = m / 60;
    return `через ${hours} ${plural(hours, "час", "часа", "часов")}`;
  }
  return `через ${m} ${plural(m, "минуту", "минуты", "минут")}`;
}

function snippet(text) {
  const line = String(text || "")
    .replace(/[*_~`>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!line) return "";
  return line.length > 72 ? `${line.slice(0, 72)}…` : line;
}

function normalizeButtons(buttons = []) {
  return (Array.isArray(buttons) ? buttons : [])
    .map((btn) => ({
      text: String(btn?.text || ""),
      kind: btn?.kind === "url" ? "url" : "web_app",
      path: String(btn?.path || "/"),
      url: String(btn?.url || ""),
    }))
    .filter((btn) => btn.text.trim());
}

function messageFromTemplate(template) {
  if (!template) return null;
  const lang =
    String(template.language || "").trim().toLowerCase() === "pl" ? "pl" : "ru";
  const text = String(template.text || template.preview || "").trim();
  return {
    ru: lang === "ru" ? text : String(template.textRu || "").trim(),
    pl: lang === "pl" ? text : String(template.textPl || "").trim(),
    buttons: normalizeButtons(template.buttons),
    photoUrl: String(template.photoUrl || template.photoPreviewUrl || "").trim(),
    photoFileId: String(template.photoFileId || "").trim(),
    templateId: String(template.id || "").trim(),
  };
}

function draftFromRow(row, event) {
  const message = row?.message || {};
  let ru = String(message.textRu || "").trim();
  let pl = String(message.textPl || "").trim();
  const text = String(message.text || "").trim();
  if (!ru && !pl && text) {
    if (String(message.defaultLanguage || "ru") === "pl") pl = text;
    else ru = text;
  }
  const photoUrl = String(
    message.photoUrl || message.photoPreviewUrl || ""
  ).trim();
  const saved = Boolean(row?.updatedAt);
  const delay = saved
    ? Math.max(0, Number(row?.delayMinutes || 0))
    : event.delayMode === "days"
      ? 2880
      : 0;

  return {
    enabled: row?.enabled === true,
    delayMinutes: String(delay),
    ru,
    pl,
    photoUrl,
    photoFileId: String(message.photoFileId || "").trim(),
    mediaPreviewUrl: photoUrl,
    buttons: normalizeButtons(message.buttons),
    promo: String(message.promo || "").trim(),
    templateId: String(message.templateId || "").trim(),
  };
}

function draftKey(draft) {
  return JSON.stringify({
    enabled: draft?.enabled === true,
    delayMinutes: String(draft?.delayMinutes ?? "0"),
    ru: String(draft?.ru || ""),
    pl: String(draft?.pl || ""),
    photoUrl: String(draft?.photoUrl || ""),
    photoFileId: String(draft?.photoFileId || ""),
    buttons: draft?.buttons || [],
    promo: String(draft?.promo || ""),
    templateId: String(draft?.templateId || ""),
  });
}

function hasContent(draft) {
  return Boolean(
    String(draft?.ru || "").trim() ||
      String(draft?.pl || "").trim() ||
      String(draft?.photoUrl || draft?.photoFileId || "").trim() ||
      String(draft?.promo || "").trim()
  );
}

async function uploadMedia(file) {
  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if (!allowed.includes(file.type)) {
    throw new Error("Можно загрузить JPG, PNG или WEBP");
  }
  const uploadFile = await compressImageForUpload(file, {
    maxEdge: 1920,
    maxBytes: 2.5 * 1024 * 1024,
    quality: 0.85,
  });
  const formData = new FormData();
  formData.append("file", uploadFile, uploadFile.name || "push.jpg");
  const data = await crmFetchJson("/crm/push/upload-media", {
    method: "POST",
    body: formData,
  });
  const photoUrl = String(data?.url || data?.photoPreviewUrl || "").trim();
  return {
    photoUrl,
    photoFileId: String(data?.fileId || "").trim(),
    previewUrl: photoUrl || URL.createObjectURL(uploadFile),
  };
}

function Toggle({ on, onClick, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.();
      }}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full transition-colors",
        on ? "bg-[hsl(142_55%_38%)]" : "bg-[hsl(232_16%_24%)]"
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
          on ? "translate-x-[22px]" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

export default function PushAutomationsPanel({ templates = [] }) {
  const touchedRef = useRef(new Set());
  const [activeTrigger, setActiveTrigger] = useState("first_purchase");
  const [drafts, setDrafts] = useState({});
  const [editingTrigger, setEditingTrigger] = useState(null);
  const [lang, setLang] = useState("ru");
  const [delayAmount, setDelayAmount] = useState("0");
  const [delayUnit, setDelayUnit] = useState("hours");
  const [togglePending, setTogglePending] = useState("");
  const [photoUploading, setPhotoUploading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["crm-push-automations"],
    queryFn: () => crmFetchJson("/crm/push/automations"),
    staleTime: 30_000,
  });

  useEffect(() => {
    const automations = data?.automations;
    if (!automations) return;
    setDrafts((current) => {
      const next = { ...current };
      for (const event of EVENTS) {
        if (touchedRef.current.has(event.trigger)) continue;
        next[event.trigger] = draftFromRow(automations[event.trigger], event);
      }
      return next;
    });
  }, [data]);

  const activeEvent =
    EVENTS.find((item) => item.trigger === activeTrigger) || EVENTS[0];
  const serverDraft = draftFromRow(
    data?.automations?.[activeTrigger],
    activeEvent
  );
  const draft = drafts[activeTrigger] || serverDraft;
  const dirty =
    Boolean(drafts[activeTrigger]) &&
    draftKey(draft) !== draftKey(serverDraft);

  const setDraft = (updater) => {
    touchedRef.current.add(activeTrigger);
    setDrafts((current) => {
      const prev = current[activeTrigger] || serverDraft;
      const next = typeof updater === "function" ? updater(prev) : updater;
      return { ...current, [activeTrigger]: next };
    });
  };
  const previewText = lang === "pl" ? draft.pl : draft.ru;
  const previewPhoto = draft.mediaPreviewUrl || draft.photoUrl;

  const rowsByTrigger = data?.automations || {};

  const cardState = (event) => {
    const saved = draftFromRow(rowsByTrigger[event.trigger], event);
    const source = drafts[event.trigger] || saved;
    return {
      source,
      unsaved:
        Boolean(drafts[event.trigger]) &&
        draftKey(source) !== draftKey(saved),
    };
  };

  const queryClient = useQueryClient();
  const saveMutation = useMutation({
    mutationFn: () => {
      if (!hasContent(draft)) {
        throw new Error("Напишите текст или добавьте фото");
      }
      return crmFetchJson(`/crm/push/automations/${activeTrigger}`, {
        method: "PUT",
        body: JSON.stringify({
          enabled: draft.enabled === true,
          delayMinutes:
            activeEvent.delayMode === "none"
              ? 0
              : Number(draft.delayMinutes || 0),
          message: {
            text: String(draft.pl || draft.ru || "").trim(),
            textRu: String(draft.ru || "").trim(),
            textPl: String(draft.pl || "").trim(),
            defaultLanguage: "ru",
            promo: String(draft.promo || "").trim(),
            photoUrl: String(draft.photoUrl || "").trim(),
            photoFileId: String(draft.photoFileId || "").trim(),
            buttons: normalizeButtons(draft.buttons),
            templateId: String(draft.templateId || "").trim(),
          },
        }),
      });
    },
    onSuccess: async (payload) => {
      touchedRef.current.delete(activeTrigger);
      const saved = payload?.automation;
      if (saved) {
        queryClient.setQueryData(["crm-push-automations"], (prev) => {
          if (!prev?.automations) return prev;
          return {
            ...prev,
            automations: {
              ...prev.automations,
              [activeTrigger]: saved,
            },
          };
        });
      }
      setDrafts((current) => {
        const next = { ...current };
        delete next[activeTrigger];
        return next;
      });
      toast({ title: "Сценарий сохранён" });
    },
    onError: (error) => {
      toast({
        title: "Не удалось сохранить",
        description: error?.message || "SAVE_FAILED",
        variant: "destructive",
      });
    },
  });

  const applyTemplate = (id) => {
    const template = (templates || []).find((item) => item.id === id);
    const built = messageFromTemplate(template);
    if (!built) return;
    setDraft((current) => ({
      ...current,
      ru:
        lang === "ru"
          ? built.ru || built.pl || current.ru
          : built.ru || current.ru,
      pl:
        lang === "pl"
          ? built.pl || built.ru || current.pl
          : built.pl || current.pl,
      buttons: built.buttons.length ? built.buttons : current.buttons,
      photoUrl: built.photoUrl || current.photoUrl,
      photoFileId: built.photoFileId || current.photoFileId,
      mediaPreviewUrl: built.photoUrl || current.mediaPreviewUrl,
      templateId: built.templateId,
    }));
  };

  const onPhoto = async (file) => {
    if (!file) return;
    setPhotoUploading(true);
    try {
      const uploaded = await uploadMedia(file);
      if (draft.mediaPreviewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(draft.mediaPreviewUrl);
      }
      setDraft((current) => ({
        ...current,
        photoUrl: uploaded.photoUrl,
        photoFileId: uploaded.photoFileId,
        mediaPreviewUrl: uploaded.previewUrl,
      }));
    } catch (error) {
      toast({
        title: "Не удалось загрузить фото",
        description: error?.message,
        variant: "destructive",
      });
    } finally {
      setPhotoUploading(false);
    }
  };

  const clearPhoto = () => {
    if (draft.mediaPreviewUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(draft.mediaPreviewUrl);
    }
    setDraft((current) => ({
      ...current,
      photoUrl: "",
      photoFileId: "",
      mediaPreviewUrl: "",
    }));
  };

  const delayValue = Number(draft.delayMinutes || 0);

  const summary = useMemo(() => {
    const on = EVENTS.filter((event) => {
      const saved = draftFromRow(rowsByTrigger[event.trigger], event);
      const source = drafts[event.trigger] || saved;
      return source.enabled;
    }).length;
    return `${on} из ${EVENTS.length} включено`;
  }, [drafts, rowsByTrigger]);

  const templateName = (id) => {
    const item = (templates || []).find((row) => row.id === id);
    return String(item?.name || item?.title || "").trim();
  };

  const langTemplates = (templates || []).filter((template) => {
    const language =
      String(template.language || "ru").trim().toLowerCase() === "pl"
        ? "pl"
        : "ru";
    return language === lang;
  });

  const openEdit = (trigger) => {
    const event = EVENTS.find((item) => item.trigger === trigger) || EVENTS[0];
    const source =
      drafts[trigger] || draftFromRow(rowsByTrigger[trigger], event);
    const split = splitDelay(source.delayMinutes);
    setDelayAmount(String(split.amount));
    setDelayUnit(split.unit);
    setLang("ru");
    setActiveTrigger(trigger);
    setEditingTrigger(trigger);
  };

  const changeDelay = (amount, unit) => {
    setDelayAmount(String(amount));
    setDelayUnit(unit);
    setDraft((current) => ({
      ...current,
      delayMinutes: String(joinDelay(amount, unit)),
    }));
  };

  const toggleRow = async (event) => {
    const saved = draftFromRow(rowsByTrigger[event.trigger], event);
    const source = drafts[event.trigger] || saved;
    const next = { ...source, enabled: !source.enabled };
    if (next.enabled && !hasContent(next)) {
      toast({
        title: "Сначала выберите шаблон",
        description: "Откройте редактирование и укажите готовый текст.",
      });
      openEdit(event.trigger);
      return;
    }

    setTogglePending(event.trigger);
    try {
      const payload = await crmFetchJson(
        `/crm/push/automations/${event.trigger}`,
        {
          method: "PUT",
          body: JSON.stringify({
            enabled: next.enabled === true,
            delayMinutes:
              event.delayMode === "none" ? 0 : Number(next.delayMinutes || 0),
            message: {
              text: String(next.pl || next.ru || "").trim(),
              textRu: String(next.ru || "").trim(),
              textPl: String(next.pl || "").trim(),
              defaultLanguage: "ru",
              promo: String(next.promo || "").trim(),
              photoUrl: String(next.photoUrl || "").trim(),
              photoFileId: String(next.photoFileId || "").trim(),
              buttons: normalizeButtons(next.buttons),
              templateId: String(next.templateId || "").trim(),
            },
          }),
        }
      );
      touchedRef.current.delete(event.trigger);
      const savedRow = payload?.automation;
      if (savedRow) {
        queryClient.setQueryData(["crm-push-automations"], (prev) => {
          if (!prev?.automations) return prev;
          return {
            ...prev,
            automations: {
              ...prev.automations,
              [event.trigger]: savedRow,
            },
          };
        });
      }
      setDrafts((current) => {
        const copy = { ...current };
        delete copy[event.trigger];
        return copy;
      });
    } catch (error) {
      toast({
        title: "Не удалось переключить",
        description: error?.message || "SAVE_FAILED",
        variant: "destructive",
      });
    } finally {
      setTogglePending("");
    }
  };

  return (
    <section className="rounded-2xl surface-card p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-heading text-[15px] font-semibold text-foreground">
            Автоматические рассылки
          </h3>
          <p className="mt-1 max-w-xl text-[12px] leading-relaxed text-muted-2">
            {editingTrigger
              ? "Выберите язык, готовый шаблон и когда отправить."
              : "Включите сценарий тумблером. Текст и время — в редактировании."}
          </p>
        </div>
        <p className="text-[12px] tabular-nums text-muted-2">{summary}</p>
      </div>

      {isLoading ? (
        <div className="mt-4 space-y-2">
          {EVENTS.map((event) => (
            <div
              key={event.trigger}
              className="h-14 animate-pulse rounded-xl bg-[hsl(232_18%_12%)]"
            />
          ))}
        </div>
      ) : editingTrigger ? (
        <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setEditingTrigger(null)}
                className="text-[12px] text-muted-2 hover:text-foreground"
              >
                ← К списку
              </button>
              <p className="text-[13px] font-medium text-foreground">
                {activeEvent.title}
              </p>
            </div>
            <p className="text-[12px] leading-relaxed text-muted-2">
              {activeEvent.when}
            </p>

            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-2">
                Язык
              </p>
              <div className="mt-1.5 inline-flex rounded-lg border border-border bg-[hsl(232_26%_7%)] p-0.5">
                {[
                  { key: "ru", label: "Русский" },
                  { key: "pl", label: "Polski" },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setLang(item.key)}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-[12px] font-medium",
                      lang === item.key
                        ? "bg-[hsl(255_100%_68%/0.18)] text-foreground"
                        : "text-muted-2 hover:text-foreground"
                    )}
                  >
                    {item.label}
                    {String(draft[item.key] || "").trim() ? " ✓" : ""}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-2">
                Шаблон ({lang === "pl" ? "PL" : "RU"})
              </p>
              {langTemplates.length ? (
                <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                  {langTemplates.map((template) => {
                    const selected = draft.templateId === template.id;
                    const preview = String(
                      template.preview || template.text || ""
                    )
                      .replace(/\s+/g, " ")
                      .trim();
                    return (
                      <button
                        key={template.id}
                        type="button"
                        onClick={() => applyTemplate(template.id)}
                        className={cn(
                          "rounded-xl border px-3 py-2 text-left",
                          selected
                            ? "border-[hsl(255_100%_68%/0.55)] bg-[hsl(255_100%_68%/0.08)]"
                            : "border-border hover:border-[hsl(255_20%_40%)]"
                        )}
                      >
                        <div className="text-[12px] font-medium text-foreground">
                          {template.name || template.title || "Без названия"}
                        </div>
                        <p className="mt-1 line-clamp-2 text-[11px] text-muted-2">
                          {preview || "Пустой текст"}
                        </p>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-1.5 text-[12px] text-amber-200/90">
                  Нет шаблонов на {lang === "pl" ? "польском" : "русском"}.
                  Создайте его в форме рассылки выше.
                </p>
              )}
            </div>

            {activeEvent.delayMode === "none" ? (
              <p className="text-[12px] text-muted-2">
                Время фиксировано: за 5 дней до сгорания кэшбека.
              </p>
            ) : (
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-2">
                  Когда отправить
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max={delayUnit === "days" ? 14 : delayUnit === "hours" ? 336 : 20160}
                    value={delayAmount}
                    onChange={(event) =>
                      changeDelay(event.target.value, delayUnit)
                    }
                    className="input-base w-24"
                  />
                  <div className="inline-flex rounded-lg border border-border p-0.5">
                    {[
                      { key: "minutes", label: "мин" },
                      { key: "hours", label: "час" },
                      { key: "days", label: "дней" },
                    ].map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => changeDelay(delayAmount, item.key)}
                        className={cn(
                          "rounded-md px-2.5 py-1.5 text-[12px]",
                          delayUnit === item.key
                            ? "bg-[hsl(255_100%_68%/0.18)] text-foreground"
                            : "text-muted-2 hover:text-foreground"
                        )}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                  <span className="text-[12px] text-muted-2">
                    {formatDelay(activeEvent, delayValue)}
                  </span>
                </div>
              </div>
            )}

            <TelegramMessageEditor
              lang={lang}
              onLangChange={setLang}
              values={{ ru: draft.ru, pl: draft.pl }}
              onChange={(next) =>
                setDraft((current) => ({
                  ...current,
                  ru: next.ru,
                  pl: next.pl,
                }))
              }
              rows={5}
              placeholder={activeEvent.placeholder}
              hint="Шаблон уже подставил текст. Здесь можно поправить формулировку."
              showLangSwitch={false}
              showPreview={false}
              showPhoto
              photoUrl={draft.photoUrl}
              photoUploading={photoUploading}
              photoLabelEmpty="Без фото"
              photoAddLabel="Добавить фото"
              photoHint="Уйдёт вместе с текстом."
              clearPhotoLabel="Убрать фото"
              onPhotoFile={onPhoto}
              onClearPhoto={clearPhoto}
            />

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-[11px] uppercase tracking-wider text-muted-2">
                  Кнопки
                </p>
                <button
                  type="button"
                  className="text-[12px] text-[hsl(255_100%_75%)] hover:underline"
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      buttons: [
                        ...(current.buttons || []),
                        {
                          text: "Открыть магазин",
                          kind: "web_app",
                          path: "/",
                          url: "",
                        },
                      ],
                    }))
                  }
                >
                  Добавить
                </button>
              </div>
              {draft.buttons.length ? (
                <div className="space-y-2">
                  {draft.buttons.map((btn, index) => (
                    <div
                      key={`auto-btn-${index}`}
                      className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
                    >
                      <input
                        value={btn.text}
                        onChange={(event) => {
                          const text = event.target.value;
                          setDraft((current) => ({
                            ...current,
                            buttons: current.buttons.map((row, i) =>
                              i === index ? { ...row, text } : row
                            ),
                          }));
                        }}
                        placeholder="Текст кнопки"
                        className="input-base"
                      />
                      <input
                        value={btn.kind === "url" ? btn.url : btn.path || "/"}
                        onChange={(event) => {
                          const value = event.target.value;
                          const external = /^https?:\/\//i.test(value.trim());
                          setDraft((current) => ({
                            ...current,
                            buttons: current.buttons.map((row, i) =>
                              i === index
                                ? {
                                    ...row,
                                    kind: external ? "url" : "web_app",
                                    path: external ? "/" : value,
                                    url: external ? value.trim() : "",
                                  }
                                : row
                            ),
                          }));
                        }}
                        placeholder="Путь / или https://…"
                        className="input-base"
                      />
                      <button
                        type="button"
                        className="rounded-lg border border-border px-2 text-[12px] text-muted-2 hover:text-foreground"
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            buttons: current.buttons.filter(
                              (_row, i) => i !== index
                            ),
                          }))
                        }
                      >
                        Убрать
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[12px] text-muted-2">
                  Кнопки подтянутся из шаблона. Можно добавить свою.
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || !hasContent(draft)}
                className="inline-flex h-9 items-center justify-center rounded-lg bg-[hsl(255_100%_68%)] px-4 text-[12px] font-semibold text-[hsl(232_40%_10%)] disabled:opacity-50"
              >
                {saveMutation.isPending ? "Сохраняем…" : "Сохранить"}
              </button>
              {dirty ? (
                <span className="text-[12px] text-amber-200/90">
                  Есть несохранённые правки
                </span>
              ) : null}
            </div>
          </div>

          <aside className="lg:sticky lg:top-4">
            <p className="text-[11px] uppercase tracking-wider text-muted-2">
              Как увидит клиент
            </p>
            <div className="mt-2 rounded-[24px] border border-border bg-[hsl(232_26%_6%)] p-3">
              <div className="mb-3 flex items-center justify-between text-[10px] text-muted-2">
                <span className="inline-flex items-center gap-1.5">
                  <Smartphone className="h-3 w-3" />
                  {lang === "pl" ? "Polski" : "Русский"}
                </span>
                <span>{formatDelay(activeEvent, delayValue)}</span>
              </div>
              <div className="rounded-xl bg-[hsl(234_22%_11%)] p-3">
                {previewPhoto ? (
                  <img
                    src={previewPhoto}
                    alt=""
                    className="mb-2 max-h-36 w-full rounded-lg object-cover"
                  />
                ) : null}
                <div
                  className={PUSH_PREVIEW_CLASS}
                  dangerouslySetInnerHTML={{
                    __html: renderPushPreviewHtml(
                      previewText || "Выберите шаблон"
                    ),
                  }}
                />
                {draft.buttons
                  .filter((btn) => btn.text.trim())
                  .map((btn) => (
                    <div
                      key={btn.text}
                      className="mt-2 rounded-md border border-[hsl(255_100%_68%/0.35)] px-2 py-1 text-center text-[11px] font-medium text-[hsl(255_100%_75%)]"
                    >
                      {btn.text}
                    </div>
                  ))}
              </div>
            </div>
          </aside>
        </div>
      ) : (
        <div className="mt-4 divide-y divide-border/70">
          {EVENTS.map((event) => {
            const { source } = cardState(event);
            const name = templateName(source.templateId);
            const preview =
              name ||
              snippet(source.ru) ||
              snippet(source.pl) ||
              "Шаблон не выбран";
            return (
              <div
                key={event.trigger}
                className="flex items-center gap-3 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-foreground">
                    {event.title}
                  </div>
                  <p className="mt-0.5 truncate text-[12px] text-muted-2">
                    {formatDelay(event, source.delayMinutes)}
                    {" · "}
                    {preview}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openEdit(event.trigger)}
                  className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-[12px] text-foreground hover:border-[hsl(255_100%_68%/0.45)]"
                >
                  Редактировать
                </button>
                <Toggle
                  on={source.enabled}
                  label={`${source.enabled ? "Выключить" : "Включить"} ${event.title}`}
                  onClick={() => {
                    if (togglePending) return;
                    toggleRow(event);
                  }}
                />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
