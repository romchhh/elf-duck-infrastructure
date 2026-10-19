import React, { useState } from "react";
import { X, Upload, Phone, FileUp } from "lucide-react";
import { teggerClient } from "@/api/teggerClient";
import Field from "@/components/Field";
import TextInput from "@/components/TextInput";
import { cn } from "@/lib/utils";

const initial = { sender: "", proxy: "", storyTemplate: "", phone: "", code: "", password: "" };

export default function AddAccountDialog({ open, onClose, onCreated }) {
  const [method, setMethod] = useState("session");
  const [form, setForm] = useState(initial);
  const [file, setFile] = useState(null);
  const [token, setToken] = useState("");
  const [step, setStep] = useState("start");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [advanced, setAdvanced] = useState(false);

  if (!open) return null;

  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));
  const changeMethod = (next) => {
    if (busy) return;
    setMethod(next);
    setStep("start");
    setToken("");
    setError("");
  };
  const close = () => { if (!busy) onClose(); };
  const run = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      let result;
      if (method === "session") {
        if (!file) throw new Error("Выбери файл .session");
        result = await teggerClient.accounts.addImport({ ...form, file });
      } else if (step === "start") {
        result = await teggerClient.accounts.phoneStart(form);
      } else if (step === "code") {
        result = await teggerClient.accounts.phoneCode({ token, code: form.code });
      } else {
        result = await teggerClient.accounts.phonePassword({ token, password: form.password });
      }
      if (result?.status === "code_required") {
        setToken(result.token);
        setStep("code");
        return;
      }
      if (result?.status === "password_required") {
        setStep("password");
        return;
      }
      setForm(initial);
      setFile(null);
      setToken("");
      setStep("start");
      onCreated();
    } catch (err) {
      setError(err.message || "Не удалось добавить аккаунт");
    } finally {
      setBusy(false);
    }
  };

  const buttonText = busy ? "Подождите…" : method === "session" ? "Добавить" :
    step === "start" ? "Получить код" : step === "code" ? "Подтвердить код" : "Подтвердить 2FA";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={close} />
      <div role="dialog" aria-modal="true" aria-label="Добавить аккаунт"
        className="relative w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl bg-card border border-border shadow-lg max-h-[92vh] overflow-y-auto m-0 sm:m-4">
        <div className="sticky top-0 z-10 flex items-center justify-between p-5 bg-card border-b border-border">
          <h3 className="text-base font-semibold">Добавить аккаунт</h3>
          <button type="button" onClick={close} aria-label="Закрыть" disabled={busy}
            className="text-muted-foreground hover:text-foreground disabled:opacity-50"><X className="h-4 w-4" /></button>
        </div>

        <div className="p-5 space-y-5">
          <div className="grid grid-cols-2 gap-2">
            <MethodBtn active={method === "session"} onClick={() => changeMethod("session")} icon={FileUp} label="Импорт session" />
            <MethodBtn active={method === "telegram"} onClick={() => changeMethod("telegram")} icon={Phone} label="Авторизация Telegram" />
          </div>

          {method === "session" ? (
            <div className="space-y-4">
              <Field label="Внутреннее имя сендера">
                <TextInput value={form.sender} onChange={set("sender")} placeholder="sender_19" />
              </Field>
              <Field label=".session файл">
                <label className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/40 py-6 cursor-pointer hover:bg-muted">
                  <Upload className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
                  <span className="text-sm text-muted-foreground">{file ? file.name : "Выберите .session файл"}</span>
                  <input type="file" accept=".session" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                </label>
              </Field>
              <Field label="SOCKS5 proxy">
                <TextInput value={form.proxy} onChange={set("proxy")} placeholder="socks5://user:pass@host:port" />
              </Field>
              <Field label="Story template URL">
                <TextInput value={form.storyTemplate} onChange={set("storyTemplate")} placeholder="https://t.me/..." />
              </Field>
            </div>
          ) : (
            <div className="space-y-4">
              {step === "start" && <>
                <Field label="Номер телефона">
                  <TextInput value={form.phone} onChange={set("phone")} placeholder="+7 999 123 45 67" />
                </Field>
                <Field label="Внутреннее имя сендера">
                  <TextInput value={form.sender} onChange={set("sender")} placeholder="sender_19" />
                </Field>
                <button type="button" className="text-xs text-primary hover:underline" onClick={() => setAdvanced((v) => !v)}>
                  {advanced ? "Скрыть дополнительные настройки" : "Дополнительные настройки (необязательно)"}
                </button>
                {advanced && <>
                  <Field label="SOCKS5 proxy">
                    <TextInput value={form.proxy} onChange={set("proxy")} placeholder="socks5://user:pass@host:port" />
                  </Field>
                  <Field label="Story template URL">
                    <TextInput value={form.storyTemplate} onChange={set("storyTemplate")} placeholder="https://t.me/..." />
                  </Field>
                </>}
              </>}
              {step === "code" && <Field label="Код подтверждения">
                <TextInput value={form.code} onChange={set("code")} placeholder="12345" />
              </Field>}
              {step === "password" && <Field label="2FA пароль" hint="Только если включена двухфакторная авторизация">
                <TextInput type="password" value={form.password} onChange={set("password")} placeholder="••••••••" />
              </Field>}
              {step !== "start" && <div className="text-xs text-muted-foreground">
                {step === "code" ? "Код отправлен через Telegram. Введи его для подтверждения." : "Для этого аккаунта требуется пароль двухфакторной защиты."}
              </div>}
              <div className="text-xs text-muted-foreground">
                {step === "start" ? "Шаг 1 из 3" : step === "code" ? "Шаг 2 из 3" : "Шаг 3 из 3"}
              </div>
            </div>
          )}
          {error && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          <p className="text-xs text-muted-foreground">Новый аккаунт не включается в Migration или worker автоматически. Код и пароль не записываются в журнал.</p>
        </div>

        <div className="sticky bottom-0 flex gap-3 justify-end p-5 bg-card border-t border-border">
          <button type="button" onClick={close} disabled={busy}
            className="h-9 px-4 rounded-full text-sm font-medium bg-muted text-foreground hover:bg-surface disabled:opacity-50">Отмена</button>
          <button type="button" onClick={run} disabled={busy}
            className="h-9 px-4 rounded-full text-sm font-medium text-white bg-primary hover:bg-primary/90 disabled:opacity-50">
            {buttonText}
          </button>
        </div>
      </div>
    </div>
  );
}

function MethodBtn({ active, onClick, icon: Icon, label }) {
  return (
    <button type="button" onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-2 rounded-lg border p-4 text-sm font-medium transition",
        active ? "border-primary bg-blue-50 text-primary" : "border-border text-muted-foreground hover:bg-muted"
      )}>
      <Icon className="h-5 w-5" strokeWidth={1.5} />
      {label}
    </button>
  );
}
