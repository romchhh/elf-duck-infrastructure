import React, { useEffect, useState } from "react";
import { X, Upload, Phone, KeyRound } from "lucide-react";
import { teggerClient } from "@/api/teggerClient";
import Field from "@/components/Field";
import TextInput from "@/components/TextInput";
import { cn } from "@/lib/utils";

const initial = {
  sender: "",
  proxy: "",
  storyTemplate: "",
  phone: "",
  code: "",
  password: "",
  apiId: "",
  apiHash: "",
  sessionString: "",
};

function resetFormState(setters) {
  const {
    setMethod,
    setSessionKind,
    setForm,
    setFile,
    setToken,
    setStep,
    setHint,
    setBusy,
    setError,
    setExtras,
  } = setters;
  setMethod("phone");
  setSessionKind("string");
  setForm(initial);
  setFile(null);
  setToken("");
  setStep("start");
  setHint("");
  setBusy(false);
  setError("");
  setExtras(false);
}

export default function AddAccountDialog({ open, onClose, onCreated }) {
  const [method, setMethod] = useState("phone");
  const [sessionKind, setSessionKind] = useState("string");
  const [form, setForm] = useState(initial);
  const [file, setFile] = useState(null);
  const [token, setToken] = useState("");
  const [step, setStep] = useState("start");
  const [hint, setHint] = useState("");
  const [hashFromSettings, setHashFromSettings] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [extras, setExtras] = useState(false);

  useEffect(() => {
    if (!open) return;

    resetFormState({
      setMethod,
      setSessionKind,
      setForm,
      setFile,
      setToken,
      setStep,
      setHint,
      setBusy,
      setError,
      setExtras,
    });

    teggerClient.settings
      .telegram()
      .then((row) => {
        setHashFromSettings(Boolean(row?.api_hash_set));
        if (row?.api_id) {
          setForm((prev) =>
            prev.apiId ? prev : { ...prev, apiId: String(row.api_id) }
          );
        }
      })
      .catch(() => {});
  }, [open]);

  if (!open) return null;

  const set = (key) => (event) =>
    setForm((prev) => ({ ...prev, [key]: event.target.value }));
  const credentials = () => ({
    apiId: form.apiId.trim(),
    apiHash: form.apiHash.trim(),
  });

  const changeMethod = (next) => {
    if (busy || method === next) return;
    setMethod(next);
    setError("");
    setHint("");
    setToken("");
    setStep("start");
    setForm((prev) => ({ ...prev, code: "", password: "" }));
    setFile(null);
  };

  const restartPhone = () => {
    if (busy) return;
    setToken("");
    setStep("start");
    setHint("");
    setError("");
    setForm((prev) => ({ ...prev, code: "", password: "" }));
  };

  const close = () => {
    if (!busy) onClose();
  };

  const finish = () => {
    resetFormState({
      setMethod,
      setSessionKind,
      setForm,
      setFile,
      setToken,
      setStep,
      setHint,
      setBusy,
      setError,
      setExtras,
    });
    onCreated();
  };

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (method === "session") {
        await teggerClient.accounts.addImport({
          sender: form.sender.trim(),
          proxy: form.proxy,
          storyTemplate: form.storyTemplate,
          ...credentials(),
          file: sessionKind === "file" ? file : null,
          sessionString:
            sessionKind === "string" ? form.sessionString.trim() : "",
        });
        finish();
        return;
      }

      if (step === "start") {
        const result = await teggerClient.accounts.phoneStart({
          sender: form.sender.trim(),
          phone: form.phone.trim(),
          proxy: form.proxy,
          storyTemplate: form.storyTemplate,
          ...credentials(),
        });
        setToken(result.token);
        setHint(
          result.hint ||
            "Код отправлен. Введи цифры из последнего сообщения."
        );
        setStep("code");
        return;
      }

      if (step === "code") {
        const result = await teggerClient.accounts.phoneCode({
          token,
          code: form.code,
        });
        if (result?.status === "password_required") {
          setStep("password");
          setHint("На аккаунте включена двухфакторная защита.");
          return;
        }
        finish();
        return;
      }

      await teggerClient.accounts.phonePassword({
        token,
        password: form.password,
      });
      finish();
    } catch (err) {
      setError(err.message || "Не удалось добавить аккаунт");
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (busy || !token) return;
    setBusy(true);
    setError("");
    try {
      const result = await teggerClient.accounts.phoneResend({ token });
      setHint(
        result.hint || "Новый код отправлен. Старый больше не подойдёт."
      );
      setForm((prev) => ({ ...prev, code: "" }));
    } catch (err) {
      setError(err.message || "Не удалось отправить код ещё раз");
    } finally {
      setBusy(false);
    }
  };

  const buttonText = busy
    ? "Подождите…"
    : method === "session"
      ? "Добавить"
      : step === "start"
        ? "Отправить код"
        : step === "code"
          ? "Подтвердить код"
          : "Подтвердить 2FA";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={close}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Добавить аккаунт"
        className="relative w-full sm:max-w-xl rounded-t-3xl sm:rounded-3xl bg-card border border-border shadow-lg max-h-[92vh] overflow-y-auto"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 bg-card border-b border-border">
          <div>
            <h3 className="text-base font-semibold">Новый аккаунт</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Телефон и ключи API — в одной форме
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Закрыть"
            disabled={busy}
            className="h-8 w-8 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <X className="h-4 w-4 mx-auto" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-muted/50 p-1">
            <ModeTab
              active={method === "phone"}
              disabled={busy}
              onClick={() => changeMethod("phone")}
              icon={Phone}
              label="Телефон"
            />
            <ModeTab
              active={method === "session"}
              disabled={busy}
              onClick={() => changeMethod("session")}
              icon={KeyRound}
              label="Сессия"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Имя сендера" className="sm:col-span-2">
              <TextInput
                value={form.sender}
                onChange={set("sender")}
                placeholder="sender_19"
                disabled={method === "phone" && step !== "start"}
              />
            </Field>
            <Field label="API ID" hint="my.telegram.org">
              <TextInput
                value={form.apiId}
                onChange={set("apiId")}
                placeholder="12345678"
                inputMode="numeric"
                disabled={method === "phone" && step !== "start"}
              />
            </Field>
            <Field
              label="API Hash"
              hint={
                hashFromSettings && !form.apiHash
                  ? "Пусто — возьмём из настроек"
                  : "Секрет приложения"
              }
            >
              <TextInput
                type="password"
                autoComplete="new-password"
                value={form.apiHash}
                onChange={set("apiHash")}
                placeholder={
                  hashFromSettings ? "уже есть в настройках" : "вставь hash"
                }
                disabled={method === "phone" && step !== "start"}
              />
            </Field>
          </div>

          {method === "phone" ? (
            <div className="space-y-3 rounded-2xl border border-border p-4">
              <Field label="Номер">
                <TextInput
                  value={form.phone}
                  onChange={set("phone")}
                  placeholder="+48123456789"
                  disabled={step !== "start"}
                />
              </Field>
              {step !== "start" && (
                <Field label="Код из Telegram" hint={hint}>
                  <TextInput
                    value={form.code}
                    onChange={set("code")}
                    placeholder="12345"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    className="tracking-[0.3em] text-center text-base"
                  />
                </Field>
              )}
              {step === "password" && (
                <Field label="Пароль 2FA" hint={hint}>
                  <TextInput
                    type="password"
                    value={form.password}
                    onChange={set("password")}
                    placeholder="пароль облака Telegram"
                  />
                </Field>
              )}
              {step !== "start" && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  {step === "code" && (
                    <button
                      type="button"
                      onClick={resend}
                      disabled={busy || !token}
                      className="text-xs text-primary hover:underline disabled:opacity-50"
                    >
                      Код не подошёл — отправить новый
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={restartPhone}
                    disabled={busy}
                    className="text-xs text-muted-foreground hover:text-foreground hover:underline disabled:opacity-50"
                  >
                    Начать заново
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3 rounded-2xl border border-border p-4">
              <div className="grid grid-cols-2 gap-2">
                <ModeTab
                  active={sessionKind === "string"}
                  onClick={() => setSessionKind("string")}
                  label="Строка"
                />
                <ModeTab
                  active={sessionKind === "file"}
                  onClick={() => setSessionKind("file")}
                  label="Файл .session"
                />
              </div>
              {sessionKind === "string" ? (
                <Field
                  label="String session"
                  hint="Та же пара API ID / Hash, с которой сессию создавали"
                >
                  <textarea
                    value={form.sessionString}
                    onChange={set("sessionString")}
                    rows={4}
                    placeholder="1AQA..."
                    className="w-full rounded-[14px] border border-input bg-card px-4 py-3 text-sm font-mono focus:outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
                  />
                </Field>
              ) : (
                <label className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-muted/40 py-6 cursor-pointer hover:bg-muted">
                  <Upload
                    className="h-5 w-5 text-muted-foreground"
                    strokeWidth={1.5}
                  />
                  <span className="text-sm text-muted-foreground">
                    {file ? file.name : "Выбери файл .session"}
                  </span>
                  <input
                    type="file"
                    accept=".session"
                    className="hidden"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
                </label>
              )}
            </div>
          )}

          <button
            type="button"
            className="text-xs text-primary hover:underline"
            onClick={() => setExtras((v) => !v)}
          >
            {extras ? "Скрыть прокси и story" : "Прокси и story template"}
          </button>
          {extras && (
            <div className="grid gap-3">
              <Field label="SOCKS5 proxy">
                <TextInput
                  value={form.proxy}
                  onChange={set("proxy")}
                  placeholder="socks5://user:pass@host:port"
                  disabled={method === "phone" && step !== "start"}
                />
              </Field>
              <Field label="Story template URL">
                <TextInput
                  value={form.storyTemplate}
                  onChange={set("storyTemplate")}
                  placeholder="https://t.me/..."
                  disabled={method === "phone" && step !== "start"}
                />
              </Field>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="rounded-2xl bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
            >
              {error}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 flex gap-3 justify-end px-5 py-4 bg-card border-t border-border">
          <button
            type="button"
            onClick={close}
            disabled={busy}
            className="h-10 px-4 rounded-full text-sm font-medium bg-muted text-foreground hover:bg-surface disabled:opacity-50"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={run}
            disabled={busy}
            className="h-10 px-5 rounded-full text-sm font-medium text-white bg-primary hover:bg-primary/90 disabled:opacity-50"
          >
            {buttonText}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModeTab({ active, onClick, icon: Icon, label, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition disabled:opacity-40",
        active
          ? "bg-card text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {Icon ? <Icon className="h-4 w-4" strokeWidth={1.5} /> : null}
      {label}
    </button>
  );
}
