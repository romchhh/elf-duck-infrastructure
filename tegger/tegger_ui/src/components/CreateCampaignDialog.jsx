import React, { useState, useEffect } from "react";

import { X, Check, Upload } from "lucide-react";

import { teggerClient } from "@/api/teggerClient";

import Field from "@/components/Field";

import TextInput from "@/components/TextInput";

import { cn } from "@/lib/utils";

export default function CreateCampaignDialog({ open, onClose, onCreated }) {
  const [name, setName] = useState("");
  const [selected, setSelected] = useState([]);
  const [method, setMethod] = useState("paste");
  const [pasteText, setPasteText] = useState("");
  const [fileName, setFileName] = useState("");
  const [creating, setCreating] = useState(false);

  const [accounts, setAccounts] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;

    let active = true;

    teggerClient.accounts
      .list()
      .then((data) => {
        if (active) {
          setAccounts(data);
          setError("");
        }
      })
      .catch((err) => {
        if (active) {
          setError(
            err.message || "Не удалось загрузить аккаунты"
          );
        }
      });

    return () => {
      active = false;
    };
  }, [open]);

  if (!open) return null;

  const toggle = (id) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const parsedTargets = (() => {
    const text = pasteText;
    return text
      .split(/[\s,\n]+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => (t.startsWith("@") ? t : `@${t}`))
      .map((username, i) => ({
        username,
        sender: selected[i % Math.max(selected.length, 1)] || selected[0] || "tegger",
      }));
  })();

  const handleCreate = async () => {
    if (!name.trim() || selected.length === 0) {
      return;
    }

    setCreating(true);
    setError("");

    try {
      await teggerClient.campaigns.create({

        name: name.trim(),

        senderIds: selected,

        targets: parsedTargets.map((target) => target.username),

      });

      setName("");
      setSelected([]);
      setPasteText("");
      setFileName("");

      onCreated();
    } catch (err) {
      setError(
        err.message || "Не удалось создать кампанию"
      );
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl bg-card border border-border shadow-lg max-h-[92vh] overflow-y-auto m-0 sm:m-4">
        <div className="sticky top-0 flex items-center justify-between p-5 bg-card border-b border-border">
          <h3 className="text-base font-semibold">Создать кампанию</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <Field label="Название кампании">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Campaign #4" />
          </Field>

          <Field label="Аккаунты сендеров" hint={`Выбрано: ${selected.length}`}>
            <div className="max-h-40 overflow-y-auto rounded-lg border border-border p-2 space-y-1">
              {accounts.map((a) => (
                <label
                  key={a.id}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm cursor-pointer hover:bg-muted",
                    selected.includes(a.id) && "bg-blue-50"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => toggle(a.id)}
                    className={cn(
                      "h-4 w-4 rounded border flex items-center justify-center shrink-0",
                      selected.includes(a.id) ? "bg-primary border-primary" : "border-input"
                    )}
                  >
                    {selected.includes(a.id) && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                  </button>
                  <span className="font-medium">{a.name}</span>
                  <span className="text-xs text-muted-foreground">{a.telegram}</span>
                </label>
              ))}
            </div>
          </Field>

          <Field label="Импорт таргетов">
            <div className="flex gap-2 mb-2">
              <TabBtn active={method === "paste"} onClick={() => setMethod("paste")}>Вставить usernames</TabBtn>
              <TabBtn active={method === "upload"} onClick={() => setMethod("upload")}>TXT загрузка</TabBtn>
            </div>
            {method === "paste" ? (
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="@user1&#10;@user2&#10;@user3"
                rows={5}
                className="w-full rounded-lg border border-input bg-white px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            ) : (
              <label className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/40 py-8 cursor-pointer hover:bg-muted">
                <Upload className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
                <span className="text-sm text-muted-foreground">
                  {fileName || "Выберите .txt файл"}
                </span>
                <input
                  type="file"
                  accept=".txt"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files[0];
                    if (f) {
                      setFileName(f.name);
                      const reader = new FileReader();
                      reader.onload = () => {
                        setPasteText(String(reader.result || ""));
                      };
                      reader.readAsText(f);
                    }
                  }}
                />
              </label>
            )}
          </Field>

          <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted p-3 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Выбранные аккаунты</div>
              <div className="font-semibold">{selected.length}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Импортировано таргетов</div>
              <div className="font-semibold">{parsedTargets.length}</div>
            </div>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="mx-5 mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        <div className="px-5 pb-3 text-xs text-muted-foreground">
          Кампания будет создана как черновик.
          Импорт таргетов пока не подключён к серверу.
        </div>

        <div className="sticky bottom-0 flex gap-3 justify-end p-5 bg-card border-t border-border">
          <button onClick={onClose} className="h-9 px-4 rounded-full text-sm font-medium bg-muted text-foreground hover:bg-surface">
            Отмена
          </button>
          <button
            onClick={handleCreate}
            disabled={
              !name.trim() ||
              selected.length === 0 ||
              parsedTargets.length === 0 ||
              creating
            }
            className="h-9 px-4 rounded-full text-sm font-medium text-white bg-primary hover:bg-primary/90 disabled:opacity-50"
          >
            {creating ? "Создание..." : "Создать кампанию"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "h-8 px-3 rounded-full text-xs font-medium transition",
        active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-surface"
      )}
    >
      {children}
    </button>
  );
}