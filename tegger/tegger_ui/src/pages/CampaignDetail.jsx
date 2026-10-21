import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Play, ArrowLeft, Search } from "lucide-react";
import { teggerClient } from "@/api/teggerClient";
import MetricCard from "@/components/MetricCard";
import StatusBadge from "@/components/StatusBadge";
import BrandButton from "@/components/BrandButton";
import BrandedSelect from "@/components/BrandedSelect";
import EmptyState from "@/components/EmptyState";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "accounts", label: "Аккаунты" },
  { id: "targets", label: "Таргеты / отметки" },
];

export default function CampaignDetail() {
  const { campaignId } = useParams();
  const [campaign, setCampaign] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [availableAccounts, setAvailableAccounts] = useState([]);
  const [showAddSender, setShowAddSender] = useState(false);
  const [newSender, setNewSender] = useState("");
  const [addingSender, setAddingSender] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("accounts");

  const [statusError, setStatusError] = useState("");

  const [preflight, setPreflight] = useState(null);
  const [checking, setChecking] = useState(false);
  const [workerCheck, setWorkerCheck] = useState(null);

  const [dryRunResult, setDryRunResult] = useState(null);
  const [runningDryRun, setRunningDryRun] = useState(false);

  const [simulation, setSimulation] = useState(null);
  const [simulationBusy, setSimulationBusy] = useState(false);

  useEffect(() => {
    if (campaignId === "migration") return;
    let active = true;
    const poll = async () => {
      try {
        const data = await teggerClient.campaigns.simulation(campaignId);
        if (active) setSimulation(data);
      } catch (err) {
        if (active && err.status !== 409) setStatusError(err.message || "Ошибка состояния симуляции");
      }
    };
    poll();
    const timer = setInterval(poll, 1500);
    return () => { active = false; clearInterval(timer); };
  }, [campaignId]);

  const simulationAction = async (action) => {
    setSimulationBusy(true);
    setStatusError("");
    try {
      setSimulation(await teggerClient.campaigns.simulationAction(campaignId, action));
    } catch (err) {
      setStatusError(err.message || "Ошибка управления симуляцией");
    } finally {
      setSimulationBusy(false);
    }
  };

  const runDryRun = async () => {
    if (!campaign || runningDryRun) return;

    setRunningDryRun(true);
    setStatusError("");
    setDryRunResult(null);

    try {
      const result = await teggerClient.campaigns.dryRun(campaign.id);
      setDryRunResult(result);
    } catch (err) {
      setStatusError(
        typeof err.message === "string"
          ? err.message
          : JSON.stringify(err.message)
      );
    } finally {
      setRunningDryRun(false);
    }
  };

  const checkCampaign = async () => {
    if (!campaign || checking || campaign.id === "migration") {
      return;
    }

    setChecking(true);
    setStatusError("");
    setPreflight(null);
    setWorkerCheck(null);

    try {
      // 1. Проверяем конфигурацию кампании
      const report = await teggerClient.campaigns.preflight(
        campaign.id
      );

      setPreflight(report);

      if (!report.ok) {
        return;
      }

      // 2. Проверяем подключение существующего main.py
      // Только для sender_test
      if (
        campaign.senderIds.length === 1 &&
        campaign.senderIds[0] === "sender_test"
      ) {
        const workerReport =
          await teggerClient.campaigns.checkWorker(campaign.id);

        setWorkerCheck(workerReport);
      }
    } catch (err) {
      setStatusError(
        err.message || "Не удалось проверить кампанию"
      );
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    let active = true;

    async function loadCampaign() {
      if (!active) return;
      setError("");

      try {
        const [campaignData, accountsData] = await Promise.all([
          teggerClient.campaigns.get(campaignId),
          teggerClient.campaigns.accounts(campaignId),
        ]);

        if (!active) return;

        setCampaign(campaignData);
        setAccounts(accountsData);
        teggerClient.accounts.list().then((rows) => {
          if (active) setAvailableAccounts(rows);
        }).catch(() => {});
      } catch (err) {
        if (active) {
          setError(err.message || "Не удалось загрузить кампанию");
        }
      }
    }

    loadCampaign();
    // Migration statistics are read-only; refresh without starting a worker.
    const refreshTimer = campaignId === "migration"
      ? window.setInterval(loadCampaign, 15000)
      : null;

    return () => {
      active = false;
      if (refreshTimer !== null) window.clearInterval(refreshTimer);
    };
  }, [campaignId]);

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

  if (!campaign) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        Загрузка кампании…
      </div>
    );
  }
  if (!campaign.id) return <EmptyState title="Кампания не найдена" />;

  const remaining =
    campaign.remaining ??
    campaign.totalTargets - campaign.processed;

  const progress =
    campaign.totalTargets > 0
      ? Math.round(
          (campaign.processed / campaign.totalTargets) * 100
        )
      : 0;

  const assignedAccounts = accounts.filter((account) =>
    campaign.senderIds?.includes(account.id)
  );

  return (
    <div>
      <Link to="/campaigns" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary mb-4">
        <ArrowLeft className="h-3.5 w-3.5" /> К кампаниям
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-[28px] sm:text-2xl font-bold tracking-tight leading-tight">
            {campaign.name}
          </h1>
          <StatusBadge status={campaign.status} />
        </div>

        {campaign.id !== "migration" && (
          <div className="flex items-center gap-2">
            <BrandButton
              variant="primary"
              disabled={checking}
              onClick={checkCampaign}
            >
              <Play className="h-4 w-4" />
              {checking ? "Проверяем…" : "Проверить готовность"}
            </BrandButton>

            {campaign.senderIds.length === 1 &&

              campaign.senderIds[0] === "sender_test" && (

                <BrandButton

                  variant="primary"

                  disabled={runningDryRun || checking}

                  onClick={runDryRun}

                >

                  <Play className="h-4 w-4" />

                  {runningDryRun ? "Выполняется…" : "Запустить DRY_RUN"}

                </BrandButton>

              )}
          </div>
        )}
      </div>

      {campaign.id !== "migration" && (

        <div className="mb-4 rounded-lg border border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">

          Проверка готовности кампании и подключения существующего обработчика.

          Telegram API не вызывается. Доступна локальная тестовая симуляция.

        </div>

      )}

      {campaign.id !== "migration" && campaign.senderIds?.length === 1 && campaign.senderIds[0] === "sender_test" && (
        <div className="mb-4 rounded-xl border border-border bg-card p-5">
          <h3 className="mb-2 font-semibold">Менеджер тестовой кампании</h3>
          <p className="mb-3 text-xs text-muted-foreground">Локальная симуляция прогресса. Telegram API не вызывается, Stories не публикуются, состояние sender не изменяется.</p>
          <div className="mb-3 text-sm">Статус: <strong>{simulation?.status || "idle"}</strong> · Шаги: {simulation?.completed || 0}/{simulation?.total || 0} · Telegram: 0</div>
          <div className="flex flex-wrap gap-2 mb-4">
            {(!simulation || ["idle", "completed", "stopped", "interrupted", "failed"].includes(simulation.status)) && <BrandButton disabled={simulationBusy} onClick={() => simulationAction("start")}>Запустить тест</BrandButton>}
            {simulation?.status === "running" && <BrandButton disabled={simulationBusy} onClick={() => simulationAction("pause")}>Пауза</BrandButton>}
            {simulation?.status === "paused" && <BrandButton disabled={simulationBusy} onClick={() => simulationAction("resume")}>Продолжить</BrandButton>}
            {["running", "paused", "interrupted"].includes(simulation?.status) && <BrandButton disabled={simulationBusy} onClick={() => simulationAction("stop")}>Остановить</BrandButton>}
          </div>
          <div className="max-h-48 overflow-auto space-y-1 text-xs text-muted-foreground">
            {(simulation?.events || []).slice(-20).reverse().map((event, index) => <div key={`${event.at}-${index}`}>{new Date(event.at).toLocaleTimeString("ru-RU")} — {event.message}</div>)}
          </div>
        </div>
      )}

      {preflight && (
        <div className="mb-4 rounded-lg border border-border bg-card p-4 text-sm">
          <div className="font-semibold">
            {preflight.ok
              ? "Локальная проверка пройдена"
              : "Есть ошибки конфигурации"}
          </div>

          <div className="mt-2 text-muted-foreground">
            Таргетов: {preflight.totalTargets}
            {" · "}
            Аккаунтов: {preflight.senders.length}
            {" · "}
            Telegram-запросов: 0
          </div>

          {preflight.errors.map((error, index) => (
            <div key={index} className="mt-2 text-red-600">
              {error}
            </div>
          ))}

          {preflight.warnings.map((warning, index) => (
            <div key={index} className="mt-2 text-amber-600">
              {warning}
            </div>
          ))}
        </div>
      )}

      {workerCheck && (
        <div className="mb-4 rounded-lg border border-border bg-card p-4 text-sm">
          <div className="font-semibold text-emerald-600">
            Проверка подключения обработчика пройдена
          </div>

          <div className="mt-2 text-muted-foreground">
            Аккаунт: {workerCheck.sender}
          </div>

          <div className="mt-1 text-muted-foreground">
            Таргетов: {workerCheck.totalTargets}
          </div>

          <div className="mt-1 text-muted-foreground">
            Обработчик не запускался.
            Telegram-запросов: {workerCheck.telegramRequests}
          </div>
        </div>
      )}

      {dryRunResult && (
        <div className="mb-4 rounded-xl border border-border bg-card p-5">
          <h3 className="mb-4 text-base font-semibold">
            Результат DRY_RUN
          </h3>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard
              label="Доступно таргетов"
              value={dryRunResult.remainingTargets}
            />
            <MetricCard
              label="Запланировано отметок"
              value={dryRunResult.plannedTargets}
            />
            <MetricCard
              label="Запланировано Stories"
              value={dryRunResult.plannedStories}
            />
            <MetricCard
              label="Дневной лимит"
              value={`${dryRunResult.dailyCount}/${dryRunResult.dailyLimit}`}
            />
          </div>

          <div className="mt-4 text-xs text-muted-foreground">
            Аккаунт: {dryRunResult.sender} ·
            Telegram-запросов: {dryRunResult.telegramRequests} ·
            Режим: {dryRunResult.mode}
          </div>
        </div>
      )}

      {statusError && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {statusError}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <MetricCard label="Аккаунты" value={campaign.senderIds.length} />
        <MetricCard label="Всего отметок" value={campaign.totalTargets.toLocaleString("ru-RU")} />
        <MetricCard label="Выполнено" value={campaign.processed.toLocaleString("ru-RU")} />
        <MetricCard label="Осталось" value={remaining.toLocaleString("ru-RU")} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <BrandButton variant="primary" onClick={() => { setNewSender(""); setShowAddSender(true); }}>
          + Добавить теггер-аккаунт
        </BrandButton>
        {campaign.id === "migration" && <span className="text-xs text-muted-foreground">Migration: добавление заблокировано до синхронизации с Railway.</span>}
      </div>
      {showAddSender && <div className="mb-5 rounded-xl border border-border bg-card p-4 space-y-3">
        <h3 className="font-semibold">Добавить аккаунт в кампанию</h3>
        <BrandedSelect
          value={newSender}
          onChange={setNewSender}
          ariaLabel="Добавить аккаунт в кампанию"
          placeholder="Выбери неназначенный аккаунт"
          options={[
            ["", "Выбери неназначенный аккаунт"],
            ...availableAccounts
              .filter((a) => !a.campaignAssigned && !(campaign.senderIds || []).includes(a.id))
              .map((a) => [a.id, `${a.name} ${a.telegram || ""}`.trim()]),
          ]}
          className="w-full"
        />
        <p className="text-xs text-muted-foreground">Для черновиков перераспределяются только ожидающие таргеты. Выполненные сохраняются. Migration не изменяется.</p>
        <div className="flex gap-2">
          <BrandButton variant="primary" disabled={!newSender || addingSender || campaign.id === "migration"} onClick={async () => {
            setAddingSender(true); setStatusError("");
            try {
              const updated = await teggerClient.campaigns.addAccount(campaign.id, newSender);
              setCampaign(updated);
              setAccounts(await teggerClient.campaigns.accounts(campaign.id));
              setAvailableAccounts(await teggerClient.accounts.list());
              setShowAddSender(false);
            } catch (err) { setStatusError(err.message || "Не удалось назначить аккаунт"); }
            finally { setAddingSender(false); }
          }}>{addingSender ? "Добавление…" : "Добавить"}</BrandButton>
          <BrandButton variant="secondary" onClick={() => setShowAddSender(false)}>Отмена</BrandButton>
        </div>
      </div>}

      {/* Tabs */}
      <div className="flex gap-6 border-b border-border mb-4">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "py-3 text-sm font-medium border-b-2 -mb-px transition-colors duration-150",
              tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "accounts" ? (
        <AccountsTab accounts={assignedAccounts} />
      ) : (
        <TargetsTab
          campaignId={campaign.id}
          senderIds={campaign.senderIds || []}
        />
      )}

    </div>
  );
}

function AccountsTab({ accounts }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <table className="hidden md:table w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <Th>Аккаунт</Th>
            <Th>Статус</Th>
            <Th>Назначено</Th>
            <Th>Обработано</Th>
            <Th>Осталось</Th>
            <Th>Лимит в день</Th>
          </tr>
        </thead>

        <tbody className="divide-y divide-border">
          {accounts.map((account) => (
            <tr
              key={account.id}
              className="hover:bg-primary/5 transition"
            >
              <Td>
                <Link
                  to={`/accounts/${account.id}`}
                  className="font-medium text-primary hover:underline"
                >
                  {account.name}
                </Link>
              </Td>

              <Td>
                <StatusBadge status={account.status} />
              </Td>

              <Td>{account.assigned}</Td>
              <Td>{account.completed}</Td>
              <Td>{account.remaining}</Td>
              <Td>{account.dailyLimit}</Td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="md:hidden divide-y divide-border">
        {accounts.map((account) => (
          <Link
            key={account.id}
            to={`/accounts/${account.id}`}
            className="block p-4 hover:bg-muted/40"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium">
                {account.name}
              </span>

              <StatusBadge status={account.status} />
            </div>

            <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
              <div>
                <div className="text-muted-foreground">
                  Назначено
                </div>
                <div className="font-medium">
                  {account.assigned}
                </div>
              </div>

              <div>
                <div className="text-muted-foreground">
                  Обработано
                </div>
                <div className="font-medium">
                  {account.completed}
                </div>
              </div>

              <div>
                <div className="text-muted-foreground">
                  Осталось
                </div>
                <div className="font-medium">
                  {account.remaining}
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {accounts.length === 0 && (
        <div className="p-10 text-center text-sm text-muted-foreground">
          Нет назначенных аккаунтов
        </div>
      )}
    </div>
  );
}

function TargetsTab({ campaignId, senderIds }) {
  const [targets, setTargets] = useState([]);

  const [status, setStatus] = useState("all");
  const [sender, setSender] = useState("all");
  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadTargets() {
      setLoading(true);
      setError("");

      try {
        const data = await teggerClient.campaigns.targets(campaignId);

        if (!active) return;

        setTargets(Array.isArray(data) ? data : []);
      } catch (err) {
        if (active) {
          setError(err.message || "Не удалось загрузить таргеты");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadTargets();

    return () => {
      active = false;
    };
  }, [campaignId]);

  const filteredTargets = targets.filter((target) => {
    if (status !== "all" && target.status !== status) {
      return false;
    }

    if (sender !== "all" && target.sender !== sender) {
      return false;
    }

    if (
      search.trim() &&
      !target.username.toLowerCase().includes(search.trim().toLowerCase())
    ) {
      return false;
    }

    return true;
  });

  const stats = {
    total: targets.length,
    done: targets.filter((t) => t.status === "Отмечен").length,
    waiting: targets.filter((t) => t.status === "Ожидает").length,
    errors: targets.filter((t) => t.status === "Ошибка").length,
  };

  const senders = senderIds;

  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <MetricCard label="Всего" value={stats.total} />
        <MetricCard label="Выполнено" value={stats.done} />
        <MetricCard label="Осталось" value={stats.waiting} />
        <MetricCard label="Ошибки" value={stats.errors} />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2.5 mb-4">
        <BrandedSelect
          value={status}
          onChange={setStatus}
          ariaLabel="Все статусы"
          placeholder="Все статусы"
          options={[["all", "Все статусы"], ["Отмечен", "Отмечен"], ["Ожидает", "Ожидает"], ["Ошибка", "Ошибка"]]}
          className="sm:max-w-[200px]"
        />
        <BrandedSelect
          value={sender}
          onChange={setSender}
          ariaLabel="Все аккаунты"
          placeholder="Все аккаунты"
          options={[["all", "Все аккаунты"], ...senders.map((s) => [s, s])]}
          className="sm:max-w-[200px]"
        />
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по username"
            className="h-11 w-full rounded-[14px] border border-input bg-card pl-10 pr-4 text-sm transition-colors hover:border-primary/40 focus:outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
          />
        </div>
      </div>

      {loading && (
        <div className="mb-4 py-6 text-center text-sm text-muted-foreground">
          Загрузка таргетов…
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="mb-3 text-xs text-muted-foreground">
          Найдено: {filteredTargets.length}.
          Показано: {Math.min(filteredTargets.length, 100)}.
        </div>
      )}

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="hidden md:table w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <Th>Username</Th><Th>Sender</Th><Th>Статус</Th><Th>Ошибка / детали</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredTargets.slice(0, 100).map((t) => (
              <tr key={t.id} className="hover:bg-muted/30">
                <Td className="font-medium">{t.username}</Td>
                <Td className="text-muted-foreground">{t.sender}</Td>
                <Td><StatusBadge status={t.status} /></Td>
                <Td className="text-muted-foreground">{t.error || "—"}</Td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="md:hidden divide-y divide-border">
          {filteredTargets.slice(0, 100).map((t) => (
            <div key={t.id} className="p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm">{t.username}</span>
                <StatusBadge status={t.status} />
              </div>
              <div className="mt-1 text-xs text-muted-foreground">Sender: {t.sender}</div>
              {t.error && <div className="mt-1 text-xs text-red-600">Ошибка: {t.error}</div>}
            </div>
          ))}
        </div>
        {!loading && !error && filteredTargets.length === 0 && (
          <div className="p-10 text-center text-sm text-muted-foreground">Нет таргетов по фильтру</div>
        )}
      </div>
    </div>
  );
}

function Th({ children }) {
  return <th className="text-left font-semibold text-[11px] uppercase tracking-wide text-muted-foreground px-4 py-3">{children}</th>;
}
function Td({ children, className }) {
  return <td className={`px-4 py-3 ${className || ""}`}>{children}</td>;
}
