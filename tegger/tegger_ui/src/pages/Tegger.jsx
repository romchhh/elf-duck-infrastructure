import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Play, Plus, RefreshCw, Square, Upload } from "lucide-react";
import { teggerClient } from "@/api/teggerClient";
import PageHeader from "@/components/PageHeader";
import Field from "@/components/Field";
import TextInput from "@/components/TextInput";
import BrandedSelect from "@/components/BrandedSelect";
import BrandButton from "@/components/BrandButton";
import StatusBadge from "@/components/StatusBadge";
import EmptyState from "@/components/EmptyState";
import { cn } from "@/lib/utils";

const STATUS_RU = {
  draft: "Черновик",
  running: "Запуск",
  stopping: "Останавливаем",
  stopped: "Остановлен",
  done: "Готово",
  error: "Ошибка",
};

const PHASE_RU = {
  connect: "Подключение к Telegram",
  resolve: "Проверка пользователей",
  interaction: "Контакт перед историей",
  pause: "Пауза перед публикацией",
  publish: "Публикация истории",
  wait: "Пауза до следующей группы",
  stopping: "Останавливаем после текущего шага",
  done: "Все группы опубликованы",
  stopped: "Остановлено",
};

function formatRemain(iso, now) {
  if (!iso) return "";
  const ms = new Date(iso).getTime() - now;
  if (!Number.isFinite(ms)) return "";
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    return `${hours}:${String(minutes % 60).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function useNow(active) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

function isLiveStatus(status) {
  return status === "running" || status === "stopping";
}

function TeggerProgress({ job }) {
  const progress = job.progress;
  const live = isLiveStatus(job.status);
  const now = useNow(live && Boolean(progress?.waitUntil));
  if (!progress) return null;

  const total = progress.total || job.usernames?.length || 0;
  const done = progress.mentioned?.length || 0;
  const failedCount = progress.failed?.length || 0;
  const stories = Array.isArray(progress.stories) ? progress.stories : [];
  const touched = Math.min(total, done + failedCount);
  const percent = total ? Math.round((touched / total) * 100) : 0;
  const remain = live ? formatRemain(progress.waitUntil, now) : "";
  const mentioned = new Set(progress.mentioned || []);
  const failed = new Map(
    (progress.failed || [])
      .filter((entry) => entry && entry.username)
      .map((entry) => [entry.username, entry.error || ""])
  );
  const current = new Set(progress.currentGroup || []);
  const phase = PHASE_RU[progress.phase] || (live ? "В работе" : "Прогресс");

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-medium">{phase}</div>
        <div className="text-xs tabular-nums text-muted-foreground">
          {done}/{total} отметок · {stories.length} групп
        </div>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
      </div>
      {remain && (
        <div className="text-xs text-muted-foreground">
          {progress.phase === "wait"
            ? `Следующая группа через ${remain}`
            : `Пауза ${remain}`}
        </div>
      )}
      <div className="space-y-2">
        {stories.map((story, index) => (
          <div key={`story-${index}`} className="text-xs">
            <div className="font-medium text-emerald-700">Группа {index + 1} · опубликована</div>
            <div className="mt-0.5 text-muted-foreground">
              {(story.usernames || []).map((name) => `@${name}`).join(" ") || "—"}
            </div>
          </div>
        ))}
        {!!progress.currentGroup?.length && (
          <div className="text-xs">
            <div className="font-medium text-orange-700">
              Группа {stories.length + 1} · сейчас
            </div>
            <div className="mt-0.5">
              {progress.currentGroup.map((name) => `@${name}`).join(" ")}
            </div>
          </div>
        )}
        {progress.pending > 0 && (
          <div className="text-xs text-muted-foreground">Ещё не в группе: {progress.pending}</div>
        )}
        {!!progress.failed?.length && (
          <div className="text-xs text-destructive">
            Не вышли:{" "}
            {progress.failed
              .map((entry) => (entry.username ? `@${entry.username}` : entry.error))
              .filter(Boolean)
              .join(", ")}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(job.usernames || []).map((name) => {
          let tone = "bg-muted text-muted-foreground";
          if (mentioned.has(name)) tone = "bg-emerald-50 text-emerald-700";
          else if (failed.has(name)) tone = "bg-destructive/10 text-destructive";
          else if (current.has(name)) tone = "bg-orange-50 text-orange-700";
          return (
            <span
              key={name}
              title={failed.get(name) || ""}
              className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", tone)}
            >
              @{name}
            </span>
          );
        })}
      </div>
    </div>
  );
}

const BUTTON_COLORS = [
  ["#2AABEE", "Telegram"],
  ["#22C55E", "Зелёный"],
  ["#111827", "Чёрный"],
  ["#F97316", "Оранжевый"],
  ["#A855F7", "Фиолетовый"],
  ["#EF4444", "Красный"],
  ["#FFFFFF", "Белый"],
];

function formatWhen(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("ru-RU");
  } catch {
    return value;
  }
}

function parseUsernames(text) {
  return text
    .split(/[\s,;]+/)
    .map((t) => t.trim().replace(/^@+/, ""))
    .filter(Boolean)
    .filter((t) => t.toLowerCase() !== "username");
}

export default function Tegger() {
  const [accounts, setAccounts] = useState([]);
  const [history, setHistory] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [senderId, setSenderId] = useState("");
  const [usernamesText, setUsernamesText] = useState("");
  const [caption, setCaption] = useState("");
  const [buttonUrl, setButtonUrl] = useState("");
  const [buttonText, setButtonText] = useState("Открыть");
  const [buttonColor, setButtonColor] = useState("#2AABEE");
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState("");

  const selected = useMemo(
    () => history.find((item) => item.id === selectedId) || null,
    [history, selectedId]
  );

  const mentionCount = parseUsernames(usernamesText).length;
  const canCreate =
    Boolean(senderId) && mentionCount > 0 && Boolean(photo) && !saving;

  const refresh = useCallback(async () => {
    setError("");
    try {
      const [accountRows, teggerRows] = await Promise.all([
        teggerClient.teggers.accounts(),
        teggerClient.teggers.list(),
      ]);
      setAccounts(accountRows);
      setHistory(teggerRows);
      setSenderId((current) => {
        if (current && accountRows.some((a) => a.id === current)) return current;
        return accountRows[0]?.id || "";
      });
      setSelectedId((current) => {
        if (current && teggerRows.some((item) => item.id === current)) return current;
        return teggerRows[0]?.id || null;
      });
    } catch (err) {
      setError(err.message || "Не удалось загрузить Тегер");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const hasRunning = history.some((item) => isLiveStatus(item.status));
    if (!hasRunning) return undefined;
    const timer = setInterval(() => {
      teggerClient.teggers
        .list()
        .then((rows) => setHistory(rows))
        .catch(() => {});
    }, 2500);
    return () => clearInterval(timer);
  }, [history]);

  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  const onPickPhoto = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const resetForm = () => {
    setUsernamesText("");
    setCaption("");
    setButtonUrl("");
    setButtonText("Открыть");
    setButtonColor("#2AABEE");
    setPhoto(null);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview("");
  };

  const handleCreate = async () => {
    if (!canCreate) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const created = await teggerClient.teggers.create({
        senderId,
        usernames: usernamesText,
        caption,
        buttonUrl,
        buttonText,
        buttonColor,
        file: photo,
      });
      setNotice("Тегер создан. Можно запускать.");
      resetForm();
      await refresh();
      setSelectedId(created.id);
    } catch (err) {
      setError(err.message || "Не удалось создать тегер");
    } finally {
      setSaving(false);
    }
  };

  const runningJob = history.find((item) => isLiveStatus(item.status)) || null;
  const selectedIsLive = Boolean(selected && isLiveStatus(selected.status));
  const stoppedAfterPublish =
    selected?.status === "stopped" && Boolean(selected.progress?.stories?.length);
  const canStartSelected =
    Boolean(selected) &&
    !selectedIsLive &&
    !stoppedAfterPublish &&
    !(runningJob && runningJob.id !== selected.id) &&
    (selected.status !== "done" || Boolean(selected.dryRun));

  const handleStart = async () => {
    if (!canStartSelected) return;
    setStarting(true);
    setError("");
    setNotice("");
    try {
      await teggerClient.teggers.start(selected.id);
      setNotice("Публикация в Telegram… статус обновится ниже.");
      await refresh();
      setSelectedId(selected.id);
    } catch (err) {
      setError(err.message || "Не удалось запустить");
    } finally {
      setStarting(false);
    }
  };

  const handleStop = async (id) => {
    const target = id || selected?.id;
    if (!target) return;
    setStopping(true);
    setError("");
    setNotice("");
    try {
      await teggerClient.teggers.stop(target);
      setNotice("Останавливаем. Текущая история может ещё выйти, следующая — нет.");
      await refresh();
      setSelectedId(target);
    } catch (err) {
      setError(err.message || "Не удалось остановить");
    } finally {
      setStopping(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Тегер"
        subtitle="Фото, текст и кнопка. Отметки как в оригинальном тегере: 2–3 человека в одной истории"
      >
        <BrandButton variant="secondary" onClick={refresh} disabled={loading}>
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} strokeWidth={2} />
          Обновить
        </BrandButton>
      </PageHeader>

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
        >
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-foreground">
          {notice}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <div>
            <h2 className="text-base font-semibold tracking-tight">Новый тегер</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Выбери аккаунт, вставь @username, загрузи фото и при желании ссылку.
            </p>
          </div>

          <Field label="Аккаунт">
            <BrandedSelect
              value={senderId || undefined}
              onChange={setSenderId}
              placeholder={accounts.length ? "Выбери аккаунт" : "Нет доступных сессий"}
              options={accounts.map((account) => [
                account.id,
                `${account.name}${account.telegram ? ` · ${account.telegram}` : ""}`,
              ])}
            />
          </Field>

          <Field
            label="Отметки"
            hint={`${mentionCount} пользователей · через пробел, запятую или с новой строки`}
          >
            <textarea
              value={usernamesText}
              onChange={(event) => setUsernamesText(event.target.value)}
              rows={5}
              placeholder={"@user1\n@user2\n@user3"}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/25"
            />
          </Field>

          <Field label="Текст истории" hint="Будет над отметками">
            <textarea
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              rows={3}
              maxLength={800}
              placeholder="Короткий текст к истории"
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/25"
            />
          </Field>

          <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
            <div>
              <h3 className="text-sm font-semibold">Кнопка-ссылка</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Рисуется на фото + кликабельная зона Stories (mediaAreaUrl). В caption — тот же текст как ссылка.
              </p>
            </div>
            <Field label="URL" hint="http(s):// · можно оставить пустым">
              <TextInput
                value={buttonUrl}
                onChange={(event) => setButtonUrl(event.target.value)}
                placeholder="https://t.me/your_bot"
              />
            </Field>
            <Field label="Текст кнопки" hint="До 40 символов">
              <TextInput
                value={buttonText}
                onChange={(event) => setButtonText(event.target.value)}
                maxLength={40}
                placeholder="Открыть магазин"
                disabled={!buttonUrl.trim()}
              />
            </Field>
            <Field label="Цвет кнопки">
              <div className="flex flex-wrap items-center gap-2">
                {BUTTON_COLORS.map(([hex, name]) => (
                  <button
                    key={hex}
                    type="button"
                    title={name}
                    disabled={!buttonUrl.trim()}
                    onClick={() => setButtonColor(hex)}
                    className={cn(
                      "h-8 w-8 rounded-full border-2 transition",
                      buttonColor.toUpperCase() === hex.toUpperCase()
                        ? "border-primary scale-110"
                        : "border-border",
                      !buttonUrl.trim() && "opacity-40"
                    )}
                    style={{ backgroundColor: hex }}
                  />
                ))}
                <input
                  type="color"
                  aria-label="Свой цвет"
                  value={/^#[0-9A-Fa-f]{6}$/.test(buttonColor) ? buttonColor : "#2AABEE"}
                  disabled={!buttonUrl.trim()}
                  onChange={(event) => setButtonColor(event.target.value)}
                  className="h-8 w-10 cursor-pointer rounded border border-border bg-transparent disabled:opacity-40"
                />
                <span className="text-xs text-muted-foreground tabular-nums">{buttonColor}</span>
              </div>
            </Field>
            {buttonUrl.trim() && (
              <div className="flex justify-center pt-1">
                <div
                  className="inline-flex min-w-[180px] items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold shadow-sm"
                  style={{
                    backgroundColor: buttonColor,
                    color:
                      (() => {
                        const hex = buttonColor.replace("#", "");
                        if (hex.length !== 6) return "#fff";
                        const r = parseInt(hex.slice(0, 2), 16);
                        const g = parseInt(hex.slice(2, 4), 16);
                        const b = parseInt(hex.slice(4, 6), 16);
                        const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
                        return lum < 0.62 ? "#fff" : "#111";
                      })(),
                  }}
                >
                  {buttonText.trim() || "Открыть"}
                </div>
              </div>
            )}
          </div>

          <Field label="Фото">
            <label
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center transition-colors hover:bg-muted/50",
                photoPreview && "border-solid"
              )}
            >
              {photoPreview ? (
                <img
                  src={photoPreview}
                  alt="Превью"
                  className="max-h-56 w-auto rounded-xl object-contain"
                />
              ) : (
                <>
                  <Upload className="h-5 w-5 text-muted-foreground" strokeWidth={1.75} />
                  <span className="text-sm text-muted-foreground">JPEG / PNG / WebP · до 8 МБ</span>
                </>
              )}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={onPickPhoto}
              />
            </label>
            {photo && (
              <div className="mt-2 text-xs text-muted-foreground truncate">{photo.name}</div>
            )}
          </Field>

          <div className="flex flex-wrap gap-2 pt-1">
            <BrandButton variant="primary" onClick={handleCreate} disabled={!canCreate}>
              <Plus className="h-4 w-4" strokeWidth={2} />
              {saving ? "Создание…" : "Создать тегер"}
            </BrandButton>
          </div>
        </section>

        <section className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold tracking-tight">Статус</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Выбранный тегер из истории — запуск и результат.
                </p>
              </div>
              {selected && (
                <StatusBadge status={STATUS_RU[selected.status] || selected.status} />
              )}
            </div>

            {!selected ? (
              <EmptyState title="Пока нет тегеров" description="Создай первый слева." />
            ) : (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="brand-eyebrow text-[10px] mb-1">Аккаунт</div>
                    <div className="font-medium">{selected.senderId}</div>
                  </div>
                  <div>
                    <div className="brand-eyebrow text-[10px] mb-1">Отметок</div>
                    <div className="font-medium">{selected.usernames?.length || 0}</div>
                  </div>
                  <div>
                    <div className="brand-eyebrow text-[10px] mb-1">Создан</div>
                    <div>{formatWhen(selected.createdAt)}</div>
                  </div>
                  <div>
                    <div className="brand-eyebrow text-[10px] mb-1">Завершён</div>
                    <div>{formatWhen(selected.finishedAt)}</div>
                  </div>
                </div>

                {selected.caption && (
                  <div>
                    <div className="brand-eyebrow text-[10px] mb-1">Текст</div>
                    <p className="whitespace-pre-wrap text-muted-foreground">{selected.caption}</p>
                  </div>
                )}

                {selected.buttonUrl && (
                  <div className="space-y-2">
                    <div className="brand-eyebrow text-[10px]">Кнопка</div>
                    <div
                      className="inline-flex min-w-[140px] items-center justify-center rounded-full px-4 py-2 text-sm font-semibold"
                      style={{
                        backgroundColor: selected.buttonColor || "#2AABEE",
                        color: "#fff",
                      }}
                    >
                      {selected.buttonText || "Открыть"}
                    </div>
                    <a
                      href={selected.buttonUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="block break-all text-xs text-primary hover:underline"
                    >
                      {selected.buttonUrl}
                    </a>
                  </div>
                )}

                {selected.progress ? (
                  <TeggerProgress job={selected} />
                ) : (
                  <div>
                    <div className="brand-eyebrow text-[10px] mb-1">Отметки</div>
                    <div className="flex flex-wrap gap-1.5">
                      {(selected.usernames || []).map((name) => (
                        <span
                          key={name}
                          className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium"
                        >
                          @{name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {selected.error && selected.status !== "error" && (
                  <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-muted-foreground">
                    {selected.error}
                  </div>
                )}
                {selected.error && selected.status === "error" && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive">
                    {selected.error}
                  </div>
                )}

                {runningJob && !selectedIsLive && (
                  <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-800">
                    <div>Сейчас идёт другой тегер — {runningJob.senderId}.</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <BrandButton
                        variant="secondary"
                        size="sm"
                        onClick={() => setSelectedId(runningJob.id)}
                      >
                        Открыть
                      </BrandButton>
                      <BrandButton
                        variant="danger"
                        size="sm"
                        onClick={() => handleStop(runningJob.id)}
                        disabled={stopping || runningJob.status === "stopping"}
                      >
                        <Square className="h-3.5 w-3.5" strokeWidth={2} />
                        {runningJob.status === "stopping" ? "Останавливаем…" : "Остановить"}
                      </BrandButton>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <BrandButton
                    variant="primary"
                    onClick={handleStart}
                    disabled={starting || !canStartSelected}
                  >
                    <Play className="h-4 w-4" strokeWidth={2} />
                    {selectedIsLive
                      ? "Публикация…"
                      : selected.status === "done" && !selected.dryRun
                        ? "Уже опубликован"
                        : stoppedAfterPublish
                          ? "Уже были публикации"
                          : starting
                            ? "Публикация…"
                            : "Запустить"}
                  </BrandButton>
                  {selectedIsLive && (
                    <BrandButton
                      variant="danger"
                      onClick={() => handleStop(selected.id)}
                      disabled={stopping || selected.status === "stopping"}
                    >
                      <Square className="h-4 w-4" strokeWidth={2} />
                      {selected.status === "stopping" || stopping ? "Останавливаем…" : "Остановить"}
                    </BrandButton>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-base font-semibold tracking-tight mb-3">История</h2>
            {loading ? (
              <div className="text-sm text-muted-foreground">Загрузка…</div>
            ) : !history.length ? (
              <EmptyState title="Пусто" description="Здесь появятся все запуски." />
            ) : (
              <ul className="divide-y divide-border">
                {history.map((item) => {
                  const active = item.id === selectedId;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(item.id)}
                        className={cn(
                          "w-full px-1 py-3 text-left transition-colors",
                          active ? "bg-primary/5" : "hover:bg-muted/40"
                        )}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">
                              {item.senderId} · {item.usernames?.length || 0} отметок
                            </div>
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              {formatWhen(item.createdAt)}
                              {item.progress &&
                                ` · ${item.progress.mentioned?.length || 0}/${item.progress.total || item.usernames?.length || 0} отметок · ${item.progress.stories?.length || 0} групп`}
                            </div>
                          </div>
                          <StatusBadge status={STATUS_RU[item.status] || item.status} />
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
