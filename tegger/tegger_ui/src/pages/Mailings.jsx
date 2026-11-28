import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Play, Plus, RefreshCw, Square, Upload } from "lucide-react";
import { teggerClient } from "@/api/teggerClient";
import PageHeader from "@/components/PageHeader";
import Field from "@/components/Field";
import TextInput from "@/components/TextInput";
import BrandButton from "@/components/BrandButton";
import StatusBadge from "@/components/StatusBadge";
import EmptyState from "@/components/EmptyState";
import { cn } from "@/lib/utils";

const STATUS_RU = {
  draft: "Черновик",
  running: "Отправка",
  stopping: "Останавливаем",
  stopped: "Остановлен",
  done: "Готово",
  error: "Ошибка",
};

const PHASE_RU = {
  relay: "Бот публикует шаблоны в чат",
  ready: "Шаблоны в чате",
  connect: "Подключение сендера",
  resolve: "Проверка получателя",
  send: "Пересылка в ЛС",
  wait: "Пауза",
  done: "Завершено",
  stopped: "Остановлено",
};

function formatWhen(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("ru-RU");
  } catch {
    return value;
  }
}

function isLiveStatus(status) {
  return status === "running" || status === "stopping";
}

function MailingProgress({ job }) {
  const p = job.progress;
  if (!p) return null;
  const total = p.total || job.recipientKeys?.length || 0;
  const done = p.sent?.length || 0;
  const failed = p.failed?.length || 0;
  const touched = Math.min(total, done + failed);
  const percent = total ? Math.round((touched / total) * 100) : 0;
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-3">
      <div className="flex justify-between gap-2 text-sm">
        <span className="font-medium">{PHASE_RU[p.phase] || p.phase || "—"}</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {done}/{total} доставлено
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
      </div>
      {!!p.current && (
        <div className="text-xs text-muted-foreground">Сейчас: {p.current}</div>
      )}
      {failed > 0 && (
        <div className="text-xs text-destructive">Пропусков: {failed}</div>
      )}
    </div>
  );
}

export default function Mailings() {
  const [accounts, setAccounts] = useState([]);
  const [selectedSenders, setSelectedSenders] = useState([]);
  const [history, setHistory] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [targetsText, setTargetsText] = useState("");
  const [messageLang, setMessageLang] = useState("ru");
  const [captionRu, setCaptionRu] = useState("");
  const [captionPl, setCaptionPl] = useState("");
  const [buttonUrl, setButtonUrl] = useState("");
  const [buttonTextRu, setButtonTextRu] = useState("Открыть");
  const [buttonTextPl, setButtonTextPl] = useState("Otwórz");
  const [photoRu, setPhotoRu] = useState(null);
  const [photoPl, setPhotoPl] = useState(null);
  const [photoPreviewRu, setPhotoPreviewRu] = useState("");
  const [photoPreviewPl, setPhotoPreviewPl] = useState("");
  const [langStats, setLangStats] = useState(null);
  const [targetStats, setTargetStats] = useState(null);

  const selected = useMemo(
    () => history.find((item) => item.id === selectedId) || null,
    [history, selectedId]
  );

  const targetCount = (targetsText || "")
    .split(/[\n,;]+/)
    .map((t) => t.trim())
    .filter(Boolean).length;

  const canCreate =
    selectedSenders.length > 0 &&
    targetCount > 0 &&
    Boolean(photoRu) &&
    Boolean(captionRu.trim()) &&
    !saving;

  const refresh = useCallback(async () => {
    setError("");
    try {
      const [accountRows, rows] = await Promise.all([
        teggerClient.mailings.accounts(),
        teggerClient.mailings.list(),
      ]);
      setAccounts(accountRows);
      setHistory(rows);
      setSelectedSenders((cur) => {
        const valid = cur.filter((id) => accountRows.some((a) => a.id === id));
        if (valid.length) return valid;
        return accountRows[0] ? [accountRows[0].id] : [];
      });
      setSelectedId((cur) => {
        if (cur && rows.some((r) => r.id === cur)) return cur;
        return rows[0]?.id || null;
      });
    } catch (err) {
      const raw = err.message || "";
      if (err.status === 404 || /^not found$/i.test(raw.trim())) {
        setError(
          "API «Розсилки» ще немає на сервері (404). Перезбери й перезапусти контейнер tegger-api з актуальним кодом, потім онови сторінку."
        );
      } else {
        setError(raw || "Не удалось загрузить розсилки");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const live = history.some((item) => isLiveStatus(item.status));
    if (!live) return undefined;
    const timer = setInterval(() => {
      teggerClient.mailings.list().then(setHistory).catch(() => {});
    }, 2500);
    return () => clearInterval(timer);
  }, [history]);

  useEffect(() => {
    if (!targetCount || selectedSenders.length === 0) {
      setLangStats(null);
      setTargetStats(null);
      return undefined;
    }
    const timer = setTimeout(() => {
      teggerClient.mailings
        .languagePreview(targetsText, selectedSenders.join(","))
        .then((data) => {
          setLangStats(data?.languages || null);
          setTargetStats(data?.targetStats || null);
        })
        .catch(() => {
          setLangStats(null);
          setTargetStats(null);
        });
    }, 450);
    return () => clearTimeout(timer);
  }, [targetsText, targetCount, selectedSenders]);

  const toggleSender = (id) => {
    setSelectedSenders((list) =>
      list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
    );
  };

  const onPickPhoto = (lang) => (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (lang === "pl") {
      if (photoPreviewPl) URL.revokeObjectURL(photoPreviewPl);
      setPhotoPl(file);
      setPhotoPreviewPl(URL.createObjectURL(file));
    } else {
      if (photoPreviewRu) URL.revokeObjectURL(photoPreviewRu);
      setPhotoRu(file);
      setPhotoPreviewRu(URL.createObjectURL(file));
    }
  };

  const resetForm = () => {
    setTargetsText("");
    setCaptionRu("");
    setCaptionPl("");
    setButtonUrl("");
    setButtonTextRu("Открыть");
    setButtonTextPl("Otwórz");
    setPhotoRu(null);
    setPhotoPl(null);
    if (photoPreviewRu) URL.revokeObjectURL(photoPreviewRu);
    if (photoPreviewPl) URL.revokeObjectURL(photoPreviewPl);
    setPhotoPreviewRu("");
    setPhotoPreviewPl("");
    setLangStats(null);
    setTargetStats(null);
  };

  const handleCreate = async () => {
    if (!canCreate) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const created = await teggerClient.mailings.create({
        senderIds: selectedSenders,
        targets: targetsText,
        captionRu,
        captionPl,
        buttonUrl,
        buttonTextRu,
        buttonTextPl,
        file: photoRu,
        filePl: photoPl || undefined,
      });
      setNotice("Черновик створено. Перед запуском: чат шаблонів у Налаштуваннях, бот у групі, сендери — учасники.");
      resetForm();
      await refresh();
      setSelectedId(created.id);
    } catch (err) {
      setError(err.message || "Не удалось создать розсилку");
    } finally {
      setSaving(false);
    }
  };

  const runningJob = history.find((item) => isLiveStatus(item.status)) || null;
  const selectedIsLive = Boolean(selected && isLiveStatus(selected.status));
  const canStartSelected =
    Boolean(selected) &&
    !selectedIsLive &&
    selected?.status !== "done" &&
    !(runningJob && runningJob.id !== selected.id);

  const handleStart = async () => {
    if (!canStartSelected) return;
    setStarting(true);
    setError("");
    try {
      await teggerClient.mailings.start(selected.id);
      setNotice("Запущено: бот публікує в чат шаблонів, сендери пересилають одержувачам.");
      await refresh();
    } catch (err) {
      setError(err.message || "Не удалось запустить");
    } finally {
      setStarting(false);
    }
  };

  const handleStop = async (id) => {
    setStopping(true);
    try {
      await teggerClient.mailings.stop(id);
      await refresh();
    } catch (err) {
      setError(err.message || "Не удалось остановить");
    } finally {
      setStopping(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Розсилки в ЛС"
        subtitle="Бот постит RU/PL в чат шаблонов; аккаунты пересылают из чата по @username или ID"
      >
        <BrandButton variant="secondary" onClick={refresh} disabled={loading}>
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} strokeWidth={2} />
          Обновить
        </BrandButton>
      </PageHeader>

      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">{notice}</div>
      )}

      <div className="mb-4 rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground space-y-1">
        <p className="font-medium text-foreground">Как это работает</p>
        <ol className="list-decimal list-inside space-y-1 text-xs sm:text-sm">
          <li>
            Налаштування: бот шаблонів + Chat ID групи (напр. чат для оцінок). Бот пише в групу; усі сендери в ній.
          </li>
          <li>При запуску бот кладе в цей чат <strong>два</strong> повідомлення (RU і PL): фото, текст, inline-кнопка.</li>
          <li>Акаунти сендерів <strong>пересилають</strong> потрібне з чату в ЛС по @username або числовому id.</li>
        </ol>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <h2 className="text-base font-semibold">Новая розсилка</h2>

          <Field label="Аккаунты-сендеры" hint={`Выбрано: ${selectedSenders.length}`}>
            <div className="max-h-40 overflow-y-auto rounded-lg border border-border p-2 space-y-1">
              {accounts.map((a) => (
                <label
                  key={a.id}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer hover:bg-muted",
                    selectedSenders.includes(a.id) && "bg-primary/10"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => toggleSender(a.id)}
                    className={cn(
                      "h-4 w-4 rounded border flex items-center justify-center",
                      selectedSenders.includes(a.id) ? "bg-primary border-primary" : "border-input"
                    )}
                  >
                    {selectedSenders.includes(a.id) && (
                      <Check className="h-3 w-3 text-white" strokeWidth={3} />
                    )}
                  </button>
                  <span className="font-medium">{a.name}</span>
                  <span className="text-xs text-muted-foreground">{a.telegram}</span>
                </label>
              ))}
            </div>
          </Field>

          <Field
            label="Получатели"
            hint="@username, числовой ID или CSV — получатели чередуются по сендерам"
          >
            <textarea
              value={targetsText}
              onChange={(e) => setTargetsText(e.target.value)}
              rows={8}
              placeholder={"1002548271\n@user1\n7123456789\n\nили CSV:\ntelegram_id,username"}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-mono outline-none focus:ring-2 focus:ring-primary/25"
            />
          </Field>

          {targetStats && (
            <p className="text-xs text-muted-foreground">
              @ {targetStats.username || 0} · id {targetStats.id || 0}
              {langStats ? ` · PL ${langStats.pl || 0} · RU ${langStats.ru || 0} · н/д ${langStats.unknown || 0}` : ""}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {["ru", "pl"].map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setMessageLang(key)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium border",
                  messageLang === key ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
                )}
              >
                {key.toUpperCase()}
              </button>
            ))}
          </div>

          {messageLang === "ru" ? (
            <Field label="Текст (RU)" hint="HTML из бота: &lt;b&gt;, ссылки, кастомные эмодзи">
              <textarea
                value={captionRu}
                onChange={(e) => setCaptionRu(e.target.value)}
                rows={4}
                maxLength={1024}
                className="w-full rounded-xl border border-border px-3 py-2 text-sm"
              />
            </Field>
          ) : (
            <Field label="Текст (PL)">
              <textarea
                value={captionPl}
                onChange={(e) => setCaptionPl(e.target.value)}
                rows={4}
                maxLength={1024}
                placeholder="Tekst po polsku (опционально — иначе RU)"
                className="w-full rounded-xl border border-border px-3 py-2 text-sm"
              />
            </Field>
          )}

          <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
            <h3 className="text-sm font-semibold">Inline-кнопка со ссылкой</h3>
            <Field label="URL">
              <TextInput value={buttonUrl} onChange={(e) => setButtonUrl(e.target.value)} placeholder="https://t.me/elfduck_store_bot" />
            </Field>
            <Field label={messageLang === "pl" ? "Название кнопки (PL)" : "Название кнопки (RU)"}>
              <TextInput
                value={messageLang === "pl" ? buttonTextPl : buttonTextRu}
                onChange={(e) =>
                  messageLang === "pl" ? setButtonTextPl(e.target.value) : setButtonTextRu(e.target.value)
                }
                disabled={!buttonUrl.trim()}
              />
            </Field>
          </div>

          <Field label={messageLang === "pl" ? "Фото (PL)" : "Фото (RU)"}>
            <label className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border py-8 cursor-pointer hover:bg-muted/40">
              {(messageLang === "pl" ? photoPreviewPl : photoPreviewRu) ? (
                <img
                  src={messageLang === "pl" ? photoPreviewPl : photoPreviewRu}
                  alt=""
                  className="max-h-48 rounded-lg object-contain"
                />
              ) : (
                <>
                  <Upload className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">JPEG / PNG / WebP</span>
                </>
              )}
              <input type="file" accept="image/*" className="hidden" onChange={onPickPhoto(messageLang)} />
            </label>
          </Field>

          <BrandButton variant="primary" onClick={handleCreate} disabled={!canCreate}>
            <Plus className="h-4 w-4" />
            {saving ? "Создание…" : "Создать черновик"}
          </BrandButton>
        </section>

        <section className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
            <div className="flex justify-between items-start gap-2">
              <h2 className="text-base font-semibold">История</h2>
              {selected && <StatusBadge status={STATUS_RU[selected.status] || selected.status} />}
            </div>
            {!selected ? (
              <EmptyState title="Нет розсилок" description="Создай черновик слева." />
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <div className="text-[10px] uppercase text-muted-foreground">Сендеры</div>
                    <div className="font-medium">{(selected.senderIds || []).join(", ")}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-muted-foreground">Получателей</div>
                    <div className="font-medium">{selected.recipientKeys?.length || 0}</div>
                  </div>
                </div>
                {selected.botUsername && (
                  <p className="text-xs text-muted-foreground">Бот: @{selected.botUsername}</p>
                )}
                {selected.relayChatId && (
                  <p className="text-xs text-muted-foreground">Чат шаблонів: {selected.relayChatId}</p>
                )}
                {selected.progress && <MailingProgress job={selected} />}
                {selected.error && (
                  <p className={cn("text-sm", selected.status === "error" ? "text-destructive" : "text-muted-foreground")}>
                    {selected.error}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <BrandButton variant="primary" onClick={handleStart} disabled={starting || !canStartSelected}>
                    <Play className="h-4 w-4" />
                    {selectedIsLive ? "Идёт…" : starting ? "Запуск…" : "Запустить"}
                  </BrandButton>
                  {selectedIsLive && (
                    <BrandButton variant="danger" onClick={() => handleStop(selected.id)} disabled={stopping}>
                      <Square className="h-4 w-4" />
                      Остановить
                    </BrandButton>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 max-h-[420px] overflow-y-auto space-y-1">
            {history.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => setSelectedId(row.id)}
                className={cn(
                  "w-full text-left rounded-lg px-3 py-2 text-sm hover:bg-muted",
                  row.id === selectedId && "bg-primary/10"
                )}
              >
                <div className="font-medium truncate">{row.captionRu?.split("\n")[0] || row.id.slice(0, 8)}</div>
                <div className="text-xs text-muted-foreground">
                  {formatWhen(row.createdAt)} · {STATUS_RU[row.status] || row.status}
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}