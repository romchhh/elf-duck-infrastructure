import React, { useState, useEffect } from "react";
import { Download, Search, FileText, Check } from "lucide-react";
import { teggerClient } from "@/api/teggerClient";
import PageHeader from "@/components/PageHeader";
import Field from "@/components/Field";
import TextInput from "@/components/TextInput";
import BrandedSelect from "@/components/BrandedSelect";
import BrandButton from "@/components/BrandButton";
import { cn } from "@/lib/utils";

const ACTIVITY_OPTIONS = [
  ["24h", "24ч. назад"],
  ["48h", "48ч. назад"],
  ["recent", "недавно"],
  ["24h_recent", "24ч. назад + недавно"],
  ["48h_recent", "48ч. назад + недавно"],
];

const TRI_OPTIONS = [
  ["all", "Все"],
  ["yes", "Да"],
  ["no", "Нет"],
];

const TRI_LABELS = {
  premium: { all: "Все", yes: "Да", no: "Нет" },
  avatar: { all: "Все", yes: "Есть", no: "Нету" },
  username: { all: "Все", yes: "Есть", no: "Нету" },
};

export default function Parser() {
  const [accounts, setAccounts] = useState([]);
  const [config, setConfig] = useState({
    chat: "",
    account: "",
    historyDays: 30,
    minActiveDays: 3,
    activityFilter: "24h",
    premium: "all",
    avatar: "all",
    username: "all",
  });
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    teggerClient.parser.accounts().then((list) => {
      setAccounts(list);
      const active = list.find((a) => a.status === "Активен");
      setConfig((c) => ({ ...c, account: active ? active.id : list[0]?.id || "" }));
    }).catch((err) => setError(err.message || "Не удалось загрузить аккаунты"));
  }, []);

  const set = (key, value) => setConfig((c) => ({ ...c, [key]: value }));

  const canRun = config.chat.trim() && config.account && !running;

  const handleRun = async () => {
    setRunning(true);
    setResult(null);
    setError("");
    try {
      const res = await teggerClient.parser.run(config);
      setResult(res);
    } catch (err) {
      setError(err.message || "Ошибка парсинга");
    } finally {
      setRunning(false);
    }
  };

  const handleDownload = () => {
    if (!result) return;
    const header = [
      `# Tegger Parser Results`,
      `# Chat: ${result.chat}`,
      `# Date: ${new Date(result.timestamp).toLocaleString("ru-RU")}`,
      `# Total scanned: ${result.totalScanned}`,
      `# Matched: ${result.count}`,
      "",
    ].join("\n");
    const body = result.usernames.join("\n");
    const blob = new Blob([header + body], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeChat = (result.chat || "chat").replace(/[^a-zA-Z0-9_@-]/g, "_");
    a.download = `parsed_${safeChat}_${result.count}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader title="Парсер" subtitle="Сбор активных пользователей из чата" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Configuration */}
        <div className="lg:col-span-2 space-y-6">
          {/* Source */}
          <Section title="Источник">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Чат для парсинга" hint="@username или ссылка">
                <TextInput
                  value={config.chat}
                  onChange={(e) => set("chat", e.target.value)}
                  placeholder="@target_chat"
                />
              </Field>
              <Field label="Аккаунт-парсер" hint="Кто будет читать историю">
                <BrandedSelect
                  value={config.account}
                  onChange={(v) => set("account", v)}
                  ariaLabel="Аккаунт-парсер"
                  placeholder="Выберите аккаунт"
                  options={accounts.map((a) => [a.id, a.name])}
                />
              </Field>
            </div>
          </Section>

          {/* Parsing config */}
          <Section title="Конфигурация парсинга">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Читать историю за (дней)">
                <TextInput
                  type="number"
                  min="1"
                  max="365"
                  value={config.historyDays}
                  onChange={(e) => set("historyDays", parseInt(e.target.value) || 0)}
                />
              </Field>
              <Field label="Мин. кол-во разных активных дней">
                <TextInput
                  type="number"
                  min="0"
                  max="30"
                  value={config.minActiveDays}
                  onChange={(e) => set("minActiveDays", parseInt(e.target.value) || 0)}
                />
              </Field>
              <Field label="Фильтр активности">
                <BrandedSelect
                  value={config.activityFilter}
                  onChange={(v) => set("activityFilter", v)}
                  ariaLabel="Фильтр активности"
                  options={ACTIVITY_OPTIONS}
                />
              </Field>
              <Field label="Премиум">
                <BrandedSelect
                  value={config.premium}
                  onChange={(v) => set("premium", v)}
                  ariaLabel="Премиум"
                  options={TRI_OPTIONS}
                />
              </Field>
              <Field label="Аватар">
                <BrandedSelect
                  value={config.avatar}
                  onChange={(v) => set("avatar", v)}
                  ariaLabel="Аватар"
                  options={TRI_OPTIONS}
                />
              </Field>
              <Field label="Юзернейм">
                <BrandedSelect
                  value={config.username}
                  onChange={(v) => set("username", v)}
                  ariaLabel="Юзернейм"
                  options={TRI_OPTIONS}
                />
              </Field>
            </div>
          </Section>

          {error && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
          {/* Action */}
          <div className="flex items-center gap-3">
            <BrandButton variant="primary" onClick={handleRun} disabled={!canRun}>
              <Search className="h-4 w-4" strokeWidth={2} />
              {running ? "Парсинг..." : "Запустить парсинг"}
            </BrandButton>
            {running && (
              <span className="text-sm text-muted-foreground inline-flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                Читаем историю чата…
              </span>
            )}
          </div>
        </div>

        {/* Results panel */}
        <div className="lg:col-span-1">
          <div className="rounded-xl border border-border bg-card p-5 sticky top-6">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="h-4 w-4 text-primary" strokeWidth={1.75} />
              <h2 className="text-sm font-semibold">Результат</h2>
            </div>

            {!result && !running && (
              <div className="py-10 text-center">
                <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground mb-3">
                  <Search className="h-5 w-5" strokeWidth={1.5} />
                </div>
                <p className="text-sm text-muted-foreground">
                  Настройте параметры и запустите парсинг
                </p>
              </div>
            )}

            {running && (
              <div className="py-10 text-center">
                <div className="mx-auto h-8 w-8 border-4 border-muted border-t-primary rounded-full animate-spin mb-3" />
                <p className="text-sm text-muted-foreground">Обработка…</p>
              </div>
            )}

            {result && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Stat label="Найдено" value={result.count} accent />
                  <Stat label="Просканировано" value={result.totalScanned} />
                </div>
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  <InfoRow label="Чат" value={result.chat} />
                  <InfoRow label="Время" value={new Date(result.timestamp).toLocaleString("ru-RU")} />
                </div>
                <div className="rounded-lg bg-muted/50 p-3">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 mb-1">
                    <Check className="h-3.5 w-3.5" /> Готово к выгрузке
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Файл .txt со списком юзернеймов
                  </div>
                </div>
                <BrandButton variant="primary" className="w-full" onClick={handleDownload}>
                  <Download className="h-4 w-4" strokeWidth={2} />
                  Скачать .txt
                </BrandButton>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-sm font-semibold mb-4">{title}</h2>
      {children}
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className={cn("rounded-lg p-3", accent ? "bg-primary/10" : "bg-muted/50")}>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={cn("text-xl font-bold tabular-nums mt-0.5", accent && "text-primary")}>
        {value.toLocaleString("ru-RU")}
      </div>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground truncate text-right">{value}</span>
    </div>
  );
}