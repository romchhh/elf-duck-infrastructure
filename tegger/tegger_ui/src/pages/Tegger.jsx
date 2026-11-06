import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Play, Plus, RefreshCw, Upload } from "lucide-react";
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
  done: "Готово",
  error: "Ошибка",
};

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
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [senderId, setSenderId] = useState("");
  const [usernamesText, setUsernamesText] = useState("");
  const [caption, setCaption] = useState("");
  const [buttonUrl, setButtonUrl] = useState("");
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
    const hasRunning = history.some((item) => item.status === "running");
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

  const canStartSelected =
    Boolean(selected) &&
    selected.status !== "running" &&
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

  return (
    <div>
      <PageHeader
        title="Тегер"
        subtitle="Одна история: фото, текст, кнопка-ссылка и отметки пользователей"
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

          <Field label="Кнопка-ссылка" hint="Опционально · http(s)://">
            <TextInput
              value={buttonUrl}
              onChange={(event) => setButtonUrl(event.target.value)}
              placeholder="https://example.com"
            />
          </Field>

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
                  <div>
                    <div className="brand-eyebrow text-[10px] mb-1">Ссылка</div>
                    <a
                      href={selected.buttonUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="break-all text-primary hover:underline"
                    >
                      {selected.buttonUrl}
                    </a>
                  </div>
                )}

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

                {selected.error && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive">
                    {selected.error}
                  </div>
                )}

                <BrandButton
                  variant="primary"
                  onClick={handleStart}
                  disabled={starting || !canStartSelected}
                >
                  <Play className="h-4 w-4" strokeWidth={2} />
                  {selected.status === "running"
                    ? "Публикация…"
                    : selected.status === "done" && !selected.dryRun
                      ? "Уже опубликован"
                      : starting
                        ? "Публикация…"
                        : "Запустить"}
                </BrandButton>
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
