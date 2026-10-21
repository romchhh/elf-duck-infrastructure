import React, { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  Pencil,
  Upload,
  Plus,
  Pin,
  LogOut,
} from "lucide-react";

import { teggerClient } from "@/api/teggerClient";

import MetricCard from "@/components/MetricCard";
import StatusBadge from "@/components/StatusBadge";
import EmptyState from "@/components/EmptyState";
import BrandButton from "@/components/BrandButton";
import BrandedSelect from "@/components/BrandedSelect";
import Field from "@/components/Field";
import TextInput from "@/components/TextInput";
import { cn } from "@/lib/utils";

export default function AccountDetail() {
  const { sender } = useParams();

  const [account, setAccount] = useState(null);
  const [telegramStatus, setTelegramStatus] = useState(null);
  const [telegramStatusError, setTelegramStatusError] = useState("");
  const [telegramChecking, setTelegramChecking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [editing, setEditing] = useState(false);
  const [campaigns, setCampaigns] = useState([]);
  const [campaignId, setCampaignId] = useState("");

  const [form, setForm] = useState({});

  const [profileAvatarFile, setProfileAvatarFile] = useState(null);

  const [channelAvatarFile, setChannelAvatarFile] = useState(null);
  const [channelPostFile, setChannelPostFile] = useState(null);

  const [channelAvatarVersion, setChannelAvatarVersion] = useState(0);
  const [channelPostVersion, setChannelPostVersion] = useState(0);

  const [channelState, setChannelState] = useState(null);
  const [channelBusy, setChannelBusy] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [channelError, setChannelError] = useState("");

  const [profileAvatarVersion, setProfileAvatarVersion] = useState(0);

  const [saving, setSaving] = useState(false);

  const [saveError, setSaveError] = useState("");

  const [saveSuccess, setSaveSuccess] = useState("");

  useEffect(() => {
    let active = true;

    async function loadAccount() {
      setLoading(true);
      setError("");
      setAccount(null);
      setEditing(false);

      try {
        const [data, appearance] = await Promise.all([
          teggerClient.accounts.get(sender),
          teggerClient.accounts.getAppearance(sender),
        ]);

        if (!active) return;

        setAccount(data);

        if (true) {
          try {
            const state = await teggerClient.accounts.getChannel(sender);

            if (active) {
              setChannelState(state);
            }
          } catch (err) {
            if (active) {
              setChannelError(
                err.message || "Не удалось получить состояние канала"
              );
            }
          }
        }

        setForm({
          name: data.name || "",
          proxyUri: data.proxyUri || "",
          storyTemplate: data.storyTemplate || "",

          firstName: appearance.firstName || "",
          username: appearance.username || "",
          bio: appearance.bio || "",

          channelTitle: appearance.channelTitle || "",
          channelUsername: appearance.channelUsername || "",
          channelBio: appearance.channelBio || "",

          postText: appearance.postText || "",
          actionText: appearance.actionText || "",
          actionUrl: appearance.actionUrl || "",
        });
      } catch (err) {
        if (!active) return;

        setError(err.message || "Не удалось загрузить аккаунт");
      } finally {
        if (active) setLoading(false);
      }
    }

    loadAccount();

    return () => {
      active = false;
    };
  }, [sender]);

  useEffect(() => {
    let active = true;

    async function checkTelegram() {
      setTelegramChecking(true);
      setTelegramStatusError("");

      try {
        const result = await teggerClient.accounts.getTelegramStatus(sender);

        if (!active) return;

        setTelegramStatus(result);
      } catch (err) {
        if (!active) return;

        setTelegramStatus(null);
        setTelegramStatusError(
          err.message || "Не удалось проверить Telegram-сессию"
        );
      } finally {
        if (active) {
          setTelegramChecking(false);
        }
      }
    }

    checkTelegram();

    return () => {
      active = false;
    };
  }, [sender]);

  useEffect(() => {
    let active = true;
    teggerClient.campaigns.list().then((items) => {
      if (active) setCampaigns(Array.isArray(items) ? items : []);
    }).catch(() => { if (active) setCampaigns([]); });
    return () => { active = false; };
  }, []);

  const updateForm = (field, value) => {

    setForm((previous) => ({

      ...previous,

      [field]: value,

    }));

  };

  const saveAppearance = async () => {
    if (!window.confirm("Применить имя, username, Bio и выбранные изображения к Telegram этого аккаунта?")) return;
    setSaving(true);
    setSaveError("");
    setSaveSuccess("");

    try {
      const payload = {
        firstName: form.firstName || "",
        username: form.username || "",
        bio: form.bio || "",

        channelTitle: form.channelTitle || "",
        channelUsername: form.channelUsername || "",
        channelBio: form.channelBio || "",

        postText: form.postText || "",
        actionText: form.actionText || "",
        actionUrl: form.actionUrl || "",
      };

      const result = await teggerClient.accounts.saveAppearance(
        sender,
        payload
      );

      let avatarUpdated = false;

      if (profileAvatarFile) {
        await teggerClient.accounts.uploadAvatar(
          sender,
          profileAvatarFile
        );

        avatarUpdated = true;

        setProfileAvatarFile(null);

        setProfileAvatarVersion((value) => value + 1);
      }

      if (channelAvatarFile) {

        await teggerClient.accounts.uploadChannelAsset(

          sender,

          "avatar",

          channelAvatarFile

        );

        setChannelAvatarFile(null);

        setChannelAvatarVersion((value) => value + 1);

      }

      if (channelPostFile) {

        await teggerClient.accounts.uploadChannelAsset(

          sender,

          "post",

          channelPostFile

        );

        setChannelPostFile(null);

        setChannelPostVersion((value) => value + 1);

      }

      if (true) {
        const changed = [...(result.telegram?.changed || [])];

        if (avatarUpdated) {
          changed.push("avatar");
        }

        setSaveSuccess(
          changed.length
            ? `Изменения применены к Telegram: ${changed.join(", ")}`
            : "Данные проверены. Изменений в Telegram не требуется."
        );
      } else {
        setSaveSuccess(
          "Сохранено. Проверь результат Telegram API."
        );
      }

      setEditing(false);
    } catch (err) {
      setSaveError(err.message || "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  const terminateSession = async () => {
    if (logoutBusy || telegramMutationLocked) return;
    const confirmation = window.prompt(`Завершить Telegram-сессию ${sender}? Это отключит аккаунт в Telegram. Введи ${sender} для подтверждения:`);
    if (confirmation !== sender) return;
    setLogoutBusy(true);
    setSaveError("");
    try {
      await teggerClient.accounts.logout(sender, confirmation);
      setTelegramStatus({ authorized: false, connected: false });
      setAccount((previous) => previous ? { ...previous, status: "Не авторизован" } : previous);
      setSaveSuccess("Telegram-сессия завершена. Для повторного использования потребуется авторизация.");
    } catch (err) {
      setSaveError(err.message || "Не удалось завершить Telegram-сессию");
    } finally {
      setLogoutBusy(false);
    }
  };

  const createChannel = async () => {
    if (
            editing ||
      saving ||
      telegramMutationLocked ||
      channelBusy
    ) {
      return;
    }

    const confirmed = window.confirm(
      channelState?.channelId ? "Сохранить изменения существующего Telegram-канала? Первый пост повторно не публикуется." : "Создать Telegram-канал и сразу опубликовать первый пост?"
    );

    if (!confirmed) return;

    setChannelBusy(true);
    setChannelError("");
    setSaveSuccess("");

    try {
      const result = await teggerClient.accounts.createChannel(sender);

      setChannelState(result);

      setSaveSuccess(
        channelState?.channelId ? "Оформление существующего канала обновлено. Пост повторно не публиковался." : "Канал создан, первый пост опубликован."
      );
    } catch (err) {
      setChannelError(
        err.message || "Не удалось создать канал"
      );

      // Telegram мог создать канал до возникновения ошибки.
      // Получаем состояние, чтобы не создавать дубликат.
      try {
        const state = await teggerClient.accounts.getChannel(sender);
        setChannelState(state);
      } catch (_) {
        // Исходная ошибка уже отображается.
      }
    } finally {
      setChannelBusy(false);
    }
  };

  const pinChannel = async () => {
    if (
            editing ||
      saving ||
      telegramMutationLocked ||
      channelBusy
    ) {
      return;
    }

    const confirmed = window.confirm(
      "Добавить созданный канал в профиль Telegram?"
    );

    if (!confirmed) return;

    setChannelBusy(true);
    setChannelError("");
    setSaveSuccess("");

    try {
      const result = await teggerClient.accounts.pinChannel(sender);

      setChannelState(result);

      setSaveSuccess(
        "Канал добавлен в профиль Telegram."
      );
    } catch (err) {
      setChannelError(
        err.message || "Не удалось закрепить канал"
      );
    } finally {
      setChannelBusy(false);
    }
  };
  
  if (loading) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        Загрузка аккаунта…
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
      >
        {error}
      </div>
    );
  }

  if (!account?.id) {
    return <EmptyState title="Аккаунт не найден" />;
  }

  const telegramMutationLocked = account.campaignAssigned && campaigns.some((c) => c.id === "migration" && (c.senderIds || []).includes(sender));
  const assigned = account.assigned ?? 0;
  const completed = account.completed ?? 0;
  const remaining = account.remaining ?? 0;

  const progress = assigned
    ? Number(((completed / assigned) * 100).toFixed(2))
    : 0;

  return (
    <div>
      {/* Back */}

      <Link
        to="/accounts"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary mb-4"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        К аккаунтам
      </Link>

      {/* Header */}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-full bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center text-primary font-bold">
            {account.name?.[0]?.toUpperCase() || "S"}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[22px] sm:text-xl font-bold tracking-tight">
                {account.name}
              </h1>

              <StatusBadge
                status={
                  true
                    ? telegramChecking
                      ? "Проверка"
                      : telegramStatus?.authorized
                        ? "Авторизована"
                        : telegramStatusError
                          ? "Ошибка проверки"
                          : "Не авторизована"
                    : account.status
                }
              />
            </div>

            <div className="mt-1 text-xs text-muted-foreground">
              {account.telegram || "—"} · ID: {telegramStatus?.telegramId || account.id}
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <BrandButton
            variant="secondary"
            onClick={() => setEditing((value) => !value)}
          >
            <Pencil className="h-3.5 w-3.5" />
            {editing ? "Закрыть редактирование" : "Редактировать"}
          </BrandButton>

          <BrandButton variant="dangerOutline" onClick={terminateSession} disabled={logoutBusy || saving || channelBusy || telegramMutationLocked || !telegramStatus?.authorized}>
            <LogOut className="h-3.5 w-3.5" />
            {logoutBusy ? "Завершение…" : "Завершить сессию"}
          </BrandButton>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <MetricCard label="Сегодня" value={`${account.dailyCount ?? 0} / ${account.dailyLimit ?? "—"}`} />
        <MetricCard label="Осталось отметок" value={remaining.toLocaleString("ru-RU")} />
        <MetricCard label="Выполнено за всё время кампании" value={completed.toLocaleString("ru-RU")} />
      </div>

      {/* Campaign context */}
      <Section title="Кампания" className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          {(() => {
            const mine = campaigns.filter((c) => (c.senderIds || []).includes(account.id));
            if (mine.length === 0) return <Link to="/campaigns" className="text-sm font-medium text-primary hover:underline">Назначить кампанию →</Link>;
            const chosen = mine.find((c) => c.id === campaignId) || mine[0];
            return <><BrandedSelect value={chosen.id} onChange={setCampaignId} ariaLabel="Кампания" options={mine.map((c) => [c.id, c.name])} className="w-full sm:max-w-xs" />
              <Link to={`/campaigns/${encodeURIComponent(chosen.id)}`} className="text-xs font-medium text-primary hover:underline">Открыть кампанию →</Link></>;
          })()}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Метрики выше отражают локальную статистику сендера; выбор кампании не меняет их.</p>
      </Section>

      {/* Configuration */}

      <Section title="Конфигурация" className="mb-6">
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Внутреннее имя сендера">
              <TextInput
                value={form.name}
                disabled
              />
            </Field>

            <Field label="Telegram session">
              <div className="flex items-center gap-2 h-10 text-sm">
                {telegramChecking ? (
                  <span className="text-muted-foreground">
                    Проверка подключения…
                  </span>
                ) : telegramStatus?.authorized ? (
                  <>
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />

                    <span className="text-emerald-600 font-medium">
                      Авторизована
                    </span>
                  </>
                ) : (
                  <>
                    <span className="h-2 w-2 rounded-full bg-red-500" />

                    <span className="text-red-600">
                      {telegramStatusError ||
                        (telegramStatus?.connected
                          ? "Не авторизована"
                          : "Нет подключения")}
                    </span>
                  </>
                )}
              </div>
            </Field>

            <Field label="SOCKS5 proxy">
              <TextInput
                value={
                  form.proxyUri ||
                  (account.proxyConfigured
                    ? "Настроен"
                    : "Не настроен")
                }
                disabled
              />
            </Field>

            <Field label="Daily limit">
              <TextInput
                value={String(account.dailyLimit ?? "")}
                disabled
              />
            </Field>

            <Field
              label="Story template URL"
              className="sm:col-span-2"
            >
              <TextInput
                value={form.storyTemplate}
                disabled
              />
            </Field>
          </div>

          {/* Profile appearance */}

          <SubSection title="Оформление аккаунта">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Аватарка">

              <AvatarControl

                disabled={!editing}

                onFileChange={setProfileAvatarFile}

                savedUrl={

                  true

                    ? `${teggerClient.accounts.getAvatarUrl(sender)}?v=${profileAvatarVersion}`

                    : null

                }

              />

            </Field>

              <div className="space-y-4">
                <Field label="Имя">
                  <TextInput
                    value={form.firstName}
                    onChange={(e) =>
                      updateForm("firstName", e.target.value)
                    }
                    disabled={!editing}
                  />
                </Field>

                <Field label="Username">
                  <TextInput
                    value={form.username}
                    onChange={(e) =>
                      updateForm("username", e.target.value)
                    }
                    disabled={!editing}
                  />
                </Field>

                <Field label="Описание">
                  <TextInput
                    value={form.bio}
                    onChange={(e) =>
                      updateForm("bio", e.target.value)
                    }
                    disabled={!editing}
                  />
                </Field>
              </div>
            </div>
          </SubSection>

          {/* Channel appearance */}

          <SubSection title="Оформление канала">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Аватарка канала">

                <AvatarControl

                  key={`channel-avatar-${channelAvatarVersion}`}

                  disabled={!editing}

                  onFileChange={setChannelAvatarFile}

                  savedUrl={

                    true

                      ? `${teggerClient.accounts

                          .getAvatarUrl(sender)

                          .replace(/\/avatar$/, "/channel/assets/avatar")}?v=${channelAvatarVersion}`

                      : null

                  }

                />

              </Field>

              <Field label="Картинка поста">
                <AvatarControl
                  key={`channel-post-${channelPostVersion}`}
                  label="Картинка поста"
                  disabled={!editing}
                  onFileChange={setChannelPostFile}
                  savedUrl={
                    true
                      ? `${teggerClient.accounts
                          .getAvatarUrl(sender)
                          .replace(/\/avatar$/, "/channel/assets/post")}?v=${channelPostVersion}`
                      : null
                  }
                />
              </Field>

              <Field label="Название">
                <TextInput
                  value={form.channelTitle}
                  onChange={(e) =>
                    updateForm("channelTitle", e.target.value)
                  }
                  disabled={!editing}
                />
              </Field>

              <Field label="Username">
                <TextInput
                  value={form.channelUsername}
                  onChange={(e) =>
                    updateForm("channelUsername", e.target.value)
                  }
                  disabled={!editing}
                />
              </Field>

              <Field
                label="Описание"
                className="sm:col-span-2"
              >
                <TextInput
                  value={form.channelBio}
                  onChange={(e) =>
                    updateForm("channelBio", e.target.value)
                  }
                  disabled={!editing}
                />
              </Field>

              <Field
                label="Текст поста"
                className="sm:col-span-2"
              >
                <TextInput
                  value={form.postText}
                  onChange={(e) =>
                    updateForm("postText", e.target.value)
                  }
                  disabled={!editing}
                />
              </Field>

              <Field label="Action-текст">
                <TextInput
                  value={form.actionText}
                  onChange={(e) =>
                    updateForm("actionText", e.target.value)
                  }
                  disabled={!editing}
                  placeholder="Перейти в новый бот"
                />
              </Field>

              <Field label="Action-ссылка">
                <TextInput
                  value={form.actionUrl}
                  onChange={(e) =>
                    updateForm("actionUrl", e.target.value)
                  }
                  disabled={!editing}
                  placeholder="https://t.me/example_bot"
                />
              </Field>
            </div>

            {/* Channel controls */}

            <div className="mt-4 rounded-lg border border-border bg-muted/40 p-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-sm font-medium">
                    {channelState?.channelId
                      ? `Канал #${channelState.channelId}`
                      : "Канал ещё не создан"}
                  </div>

                  <div className="mt-1 text-xs text-muted-foreground">
                    {channelState?.pinned
                      ? "Канал добавлен в профиль Telegram."
                      : channelState?.posted
                        ? "Первый пост опубликован. Канал можно добавить в профиль."
                        : channelState?.channelId
                          ? "Канал создан, но первый пост ещё не опубликован."
                          : "Сохрани оформление, затем создай канал."}
                  </div>
                </div>

                <div className="flex gap-2">
                  <BrandButton
                    variant="primary"
                    size="sm"
                    onClick={createChannel}
                    disabled={
                                            editing ||
                      saving ||
                      telegramMutationLocked ||
                      channelBusy ||
                      false
                    }
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {channelBusy ? "Выполнение…" : channelState?.channelId ? "Сохранить канал" : "Создать канал"}
                  </BrandButton>

                  <BrandButton
                    variant="secondary"
                    size="sm"
                    onClick={pinChannel}
                    disabled={
                                            editing ||
                      saving ||
                      telegramMutationLocked ||
                      channelBusy ||
                      !channelState?.channelId ||
                      !channelState?.posted ||
                      Boolean(channelState?.pinned)
                    }
                  >
                    <Pin className="h-3.5 w-3.5" />
                    Закрепить канал
                  </BrandButton>
                </div>
              </div>
            </div>

            {channelError && (
              <div
                role="alert"
                className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
              >
                {channelError}
              </div>
            )}
          </SubSection>

          {editing && (
            <div className="flex flex-col gap-3">
              <div className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-xs text-primary">
                Имя, username, Bio и изображения применяются к Telegram после подтверждения. Канал создаётся и публикуется отдельно. Migration защищена от изменений.
              </div>

              <div>
                <BrandButton
                  variant="primary"
                  onClick={saveAppearance}
                  disabled={saving || telegramMutationLocked}
                >
                  {saving ? "Сохранение…" : "Сохранить изменения"}
                </BrandButton>
              </div>
            </div>
          )}

          {saveError && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
            >
              {saveError}
            </div>
          )}

          {saveSuccess && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
              {saveSuccess}
            </div>
          )}
        </div>
      </Section>

      {/* State */}

      <Section title="Состояние" className="mb-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StateItem

            label="Статус"

            value={

              true

                ? telegramChecking

                  ? "Проверка"

                  : telegramStatus?.authorized

                    ? "Авторизована"

                    : telegramStatusError

                      ? "Ошибка проверки"

                      : "Не авторизована"

                : account.status || "Не проверен"

            }

          />

          <StateItem label="daily_count" value={account.dailyCount ?? 0} />

          <StateItem label="cooldown_until" value={account.cooldownUntil || "—"} />

          <StateItem label="last error" value={account.lastError || "—"} />
        </div>

        <div className="mt-5 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
          Статистика и состояние получены из FastAPI. Проверка Telegram-сессии выполняется для выбранного аккаунта.
          Создание и закрепление канала выполняются только после подтверждения.
        </div>
      </Section>
    </div>
  );
}

function AvatarControl({
  label = "Аватарка",
  disabled = false,
  onFileChange,
  savedUrl = null,
}) {
  const inputRef = useRef(null);

  const [preview, setPreview] = useState(null);

  const [fileName, setFileName] = useState("");

  const [savedImageAvailable, setSavedImageAvailable] = useState(
    Boolean(savedUrl)
  );

  useEffect(() => {
    return () => {
      if (preview) {
        URL.revokeObjectURL(preview);
      }
    };
  }, [preview]);

  useEffect(() => {
    setSavedImageAvailable(Boolean(savedUrl));
  }, [savedUrl]);

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      alert("Выбери JPG, PNG или WEBP");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert("Максимальный размер изображения — 5 МБ");
      return;
    }

    const url = URL.createObjectURL(file);

    setPreview(url);

    setFileName(file.name);

    onFileChange?.(file);
  };

  const imageUrl =
    preview || (savedImageAvailable ? savedUrl : null);

  return (
    <div className="flex items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        disabled={disabled}
        onChange={handleFileChange}
      />

      <div className="h-14 w-14 rounded-full bg-muted border border-border overflow-hidden flex items-center justify-center text-muted-foreground">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={label}
            className="h-full w-full object-cover"
            onError={() => {
              if (!preview) {
                setSavedImageAvailable(false);
              }
            }}
          />
        ) : (
          <Upload
            className="h-4 w-4"
            strokeWidth={1.5}
          />
        )}
      </div>

      <div className="flex flex-col gap-1">
        <BrandButton
          variant="secondary"
          size="sm"
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          {imageUrl ? "Заменить" : "Загрузить / Заменить"}
        </BrandButton>

        {fileName && (
          <span className="text-xs text-muted-foreground truncate max-w-[180px]">
            {fileName}
          </span>
        )}
      </div>
    </div>
  );
}

function Section({ title, children, className }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-5",
        className
      )}
    >
      <h2 className="text-sm font-semibold mb-4">
        {title}
      </h2>

      {children}
    </div>
  );
}

function SubSection({ title, children }) {
  return (
    <div className="pt-5 border-t border-border">
      <div className="brand-eyebrow text-[10px] mb-3">
        {title}
      </div>

      {children}
    </div>
  );
}

function StateItem({ label, value }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">
        {label}
      </div>

      <div className="mt-1 font-medium text-foreground truncate">
        {value}
      </div>
    </div>
  );
}