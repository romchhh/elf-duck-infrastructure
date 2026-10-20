import React, { useState, useEffect } from "react";
import { Save } from "lucide-react";
import { teggerClient } from "@/api/teggerClient";
import PageHeader from "@/components/PageHeader";
import Field from "@/components/Field";
import TextInput from "@/components/TextInput";
import BrandButton from "@/components/BrandButton";
import BrandedSelect from "@/components/BrandedSelect";

const SECTIONS = [
  { key: "limits", label: "Лимиты", fields: [
    "TARGETS_PER_SENDER_PER_DAY", "TARGETS_PER_STORY_MIN", "TARGETS_PER_STORY_MAX",
  ] },
  { key: "timings", label: "Тайминги", fields: [
    "STORY_INTERVAL_MIN_SECONDS", "STORY_INTERVAL_MAX_SECONDS", "INTERACTION_STORY_DELAY",
  ] },
];

export default function Settings() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [telegram, setTelegram] = useState(null);
  const [secrets, setSecrets] = useState({ api_hash: "", bot_token: "" });
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    let active = true;
    teggerClient.settings.get()
      .then((result) => { if (active) setData(result); })
      .catch((err) => { if (active) setError(err.message || "Ошибка загрузки настроек"); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    teggerClient.settings.telegram().then(setTelegram).catch((err) => setError(err.message));
  }, []);

  const saveTelegram = async () => {
    if (!telegram || saving) return;
    if (telegram.requested_mode === "PRODUCTION" && !window.confirm("Сохранить PRODUCTION? LIVE-рассылки всё равно запускаются отдельно из кампаний.")) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const payload = {
        requested_mode: telegram.requested_mode,
        chat_id: telegram.chat_id || "",
      };
      if (telegram.api_id) payload.api_id = String(telegram.api_id).trim();
      if (secrets.api_hash.trim()) payload.api_hash = secrets.api_hash.trim();
      if (secrets.bot_token.trim()) payload.bot_token = secrets.bot_token.trim();
      const result = await teggerClient.settings.saveTelegram(payload);
      setTelegram(result); setSecrets({ api_hash: "", bot_token: "" });
      setMessage(
        result.api_configured
          ? "API-ключи сохранены. Можно добавлять аккаунты через логин Telegram в разделе «Аккаунты»."
          : "Сохранено. Укажите API ID и API Hash (my.telegram.org), затем добавьте аккаунт."
      );
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const testLogBot = async () => {
    setTesting(true); setError(""); setMessage("");
    try {
      await teggerClient.settings.testLogBot();
      setMessage("Тестовое сообщение отправлено. Несохранённые значения не используются для проверки.");
    } catch (err) { setError(err.message); }
    finally { setTesting(false); }
  };

  const update = (section, name, value) => {
    setData((current) => ({ ...current, [section]: { ...current[section], [name]: value } }));
    setMessage("");
  };

  const handleSave = async () => {
    if (!data || saving) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const saved = await teggerClient.settings.save(data);
      setData(saved);
      setMessage("Настройки сохранены и будут применены к следующим DRY_RUN.");
    } catch (err) {
      setError(typeof err.message === "string" ? err.message : "Не удалось сохранить настройки");
    } finally {
      setSaving(false);
    }
  };

  if (!data && !error) return <div className="py-20 text-center text-muted-foreground">Загрузка…</div>;

  return (
    <div>
      <PageHeader title="Настройки" subtitle="Параметры планирования DRY_RUN. LIVE-запуск из интерфейса отключён.">
        <BrandButton variant="primary" disabled={!data || saving} onClick={handleSave}>
          <Save className="h-4 w-4" /> {saving ? "Сохранение…" : "Сохранить"}
        </BrandButton>
      </PageHeader>
      {error && <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      {message && <div role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{message}</div>}
      {data && <div className="space-y-5">
        <div className="rounded-xl border border-border bg-card p-5 text-sm">Режим сервера: <strong>{data.general.DRY_RUN ? "DRY RUN" : "LIVE"}</strong>. Режим и Telegram-конфигурация редактируются ниже; изменения режима требуют отдельного применения.</div>
        {telegram && <div className="rounded-xl border border-border bg-card p-5 space-y-5">
          <h2 className="text-sm font-semibold">Режим работы и Telegram</h2>
          <Field label="Режим (запрос на применение)">
            <BrandedSelect
              value={telegram.requested_mode}
              onChange={(value) => setTelegram((s) => ({ ...s, requested_mode: value }))}
              ariaLabel="Режим работы"
              options={[["DRY_RUN", "DRY RUN — тестовый"], ["PRODUCTION", "PRODUCTION — реальный"]]}
              className="w-full"
            />
          </Field>
          <div className="text-xs text-muted-foreground">
            Сейчас на сервере: <strong>{telegram.effective_mode}</strong>.
            {" "}API: <strong>{telegram.api_configured ? "заданы" : "не заданы"}</strong>
            {" "}(взять на <a className="text-primary underline" href="https://my.telegram.org" target="_blank" rel="noreferrer">my.telegram.org</a>).
            Аккаунты и сессии — в разделе «Аккаунты» (логин по телефону или импорт .session).
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Telegram API ID"><TextInput type="number" value={telegram.api_id || ""} onChange={(e) => setTelegram((s) => ({ ...s, api_id: e.target.value }))} placeholder="12345678" /></Field>
            <Field label={`Telegram API Hash ${telegram.api_hash_set ? "(установлен)" : "(не задан)"}`}><TextInput type="password" autoComplete="new-password" placeholder="Оставьте пустым, чтобы не менять" value={secrets.api_hash} onChange={(e) => setSecrets((s) => ({ ...s, api_hash: e.target.value }))} /></Field>
            <Field label={`Bot Token для логов ${telegram.bot_token_set ? "(установлен)" : "(не задан)"}`}><TextInput type="password" autoComplete="new-password" placeholder="Оставьте пустым, чтобы не менять" value={secrets.bot_token} onChange={(e) => setSecrets((s) => ({ ...s, bot_token: e.target.value }))} /></Field>
            <Field label="Chat ID для логов"><TextInput value={telegram.chat_id || ""} onChange={(e) => setTelegram((s) => ({ ...s, chat_id: e.target.value }))} /></Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <BrandButton variant="primary" disabled={saving} onClick={saveTelegram}><Save className="h-4 w-4" /> Сохранить подключение</BrandButton>
            <BrandButton variant="secondary" disabled={testing || saving} onClick={testLogBot}>{testing ? "Проверяем…" : "Проверить отправку логов"}</BrandButton>
          </div>
          <p className="text-xs text-muted-foreground">API ID/Hash нужны для авторизации сессий. Проверка бота логов отправляет одно тестовое сообщение (сначала сохраните Bot Token и Chat ID).</p>
        </div>}
        {SECTIONS.map((sec) => (
          <div key={sec.key} className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold text-foreground mb-4">{sec.label}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {sec.fields.map((name) => (
                <Field key={name} label={name}>
                  <TextInput type="number" min={name.includes("SECONDS") ? 0 : 1} value={data[sec.key][name]} onChange={(e) => update(sec.key, name, e.target.value)} />
                </Field>
              ))}
            </div>
          </div>
        ))}
      </div>}
    </div>
  );
}
