import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Play, ChevronRight, Activity } from "lucide-react";
import { teggerClient } from "@/api/teggerClient";
import MetricCard from "@/components/MetricCard";
import ModeBadge from "@/components/ModeBadge";
import StatusBadge from "@/components/StatusBadge";
import BrandButton from "@/components/BrandButton";
import ConfirmDialog from "@/components/ConfirmDialog";
import { cn } from "@/lib/utils";

function displayCampaignStatus(campaign) {
  if (campaign?.id === "migration" && campaign.status === "Статус запуска неизвестен") {
    return "Ожидает запуска"; // UI label only; worker state is not verified.
  }
  return campaign?.status;
}

export default function Dashboard() {
const [status, setStatus] = useState({
  mode: "DRY RUN",
  accounts: 0,
  campaigns: 0,
  processed: 0,
  remaining: 0,
  totalTargets: 0,
  workerStatus: "Не проверен",
});

const [campaigns, setCampaigns] = useState([]);
const [logs, setLogs] = useState([]);
const [showStart, setShowStart] = useState(false);
const [selectedCampaignId, setSelectedCampaignId] = useState("");
const [simulation, setSimulation] = useState(null);
const [simulationBusy, setSimulationBusy] = useState(false);
const [liveWorker, setLiveWorker] = useState(null);
const [liveBusy, setLiveBusy] = useState(false);
const [consentChecked, setConsentChecked] = useState(false);



const [loading, setLoading] = useState(true);
const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      try {
        const [dashboard, campaignList, recentLogs] = await Promise.all([
          teggerClient.dashboard(),
          teggerClient.campaigns.list(),
          teggerClient.logs.list(),
        ]);

        if (!cancelled) {
          setStatus(dashboard);
          setCampaigns(campaignList);
          setLogs(recentLogs.slice(0, 8));
          setError("");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Не удалось загрузить данные");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadDashboard();
    // Refresh read-only statistics while this page is open.
    const refreshTimer = window.setInterval(loadDashboard, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
    };
  }, []);

  const active = campaigns.find((c) => c.id === selectedCampaignId) ||
    campaigns.find((c) => c.status === "Активна") || campaigns[0];

  useEffect(() => {
    if (!active?.id || status.mode !== "DRY RUN") { setSimulation(null); return; }
    let cancelled = false;
    const poll = async () => {
      try {
        const data = await teggerClient.campaigns.simulation(active.id);
        if (!cancelled) setSimulation(data);
      } catch (err) {
        if (!cancelled) setError(err.message || "Ошибка проверки симуляции");
      }
    };
    poll();
    const timer = window.setInterval(poll, 1500);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [active?.id, status.mode]);

  const simulationAction = async (action) => {
    if (!active?.id || simulationBusy) return;
    setSimulationBusy(true);
    setError("");
    try {
      const data = await teggerClient.campaigns.simulationAction(active.id, action);
      setSimulation(data);
      setShowStart(false);
    } catch (err) {
      setError(err.message || "Ошибка управления симуляцией");
    } finally {
      setSimulationBusy(false);
    }
  };

  useEffect(() => {
    let active = true;
    const poll = () => teggerClient.worker.status().then(data => { if (active) setLiveWorker(data); }).catch(err => { if (active) setError(err.message); });
    poll();
    const timer = window.setInterval(poll, 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  const liveAction = async (action) => {
    if (!active?.id || liveBusy) return;
    setLiveBusy(true); setError("");
    try {
      const state = action === "start" ? await teggerClient.worker.start(active.id, consentChecked) : await teggerClient.worker.stop(active.id);
      setLiveWorker(state); setShowStart(false);
    } catch (err) { setError(err.message); }
    finally { setLiveBusy(false); }
  };
  const totalProcessed = status.processed ?? 0;
  const totalRemaining = status.remaining ?? 0;

  const todayCount = status.todayCount ?? null;

  const progress = active?.totalTargets
    ? Math.round((active.processed / active.totalTargets) * 100)
    : 0;

  const execStatus = status.workerStatus || "Не отслеживается";

  return (
    <div>
      
      {error && (
        <div
          role="alert"
          className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {loading && (
        <div className="mb-4 text-sm text-muted-foreground">
          Загрузка данных...
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-[28px] sm:text-2xl font-bold tracking-tight leading-tight">Tegger</h1>
          <div className="mt-2">
            <ModeBadge mode={status.mode} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <select
              aria-label="Выбрать кампанию"
              className="appearance-none min-w-[220px] rounded-xl border border-border bg-card py-2.5 pl-4 pr-10 text-sm font-medium text-foreground shadow-sm outline-none transition hover:border-primary/50 focus:border-primary focus:ring-2 focus:ring-primary/20"
              value={active?.id || ""}
              onChange={(e) => setSelectedCampaignId(e.target.value)}
            >
              {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <ChevronRight aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 rotate-90 text-muted-foreground" />
          </div>
          {status.mode === "LIVE" && (
            <>
              <BrandButton
                variant="primary"
                disabled={!active || liveBusy || liveWorker?.status === "running" || liveWorker?.status === "stopping"}
                onClick={() => { setConsentChecked(false); setShowStart(true); }}
              >
                <Play className="h-4 w-4" strokeWidth={2} />
                Запустить
              </BrandButton>
              {liveWorker?.campaignId === active?.id && ["running", "stopping"].includes(liveWorker?.status) && (
                <BrandButton disabled={liveBusy || liveWorker?.status === "stopping"} onClick={() => liveAction("stop")}>Остановить</BrandButton>
              )}
            </>
          )}
          {status.mode === "DRY RUN" && (
            <>
              <BrandButton
                variant="primary"
                disabled={!active || simulationBusy || simulation?.status === "running" || simulation?.status === "paused"}
                title="Только симуляция: Telegram не используется"
                onClick={() => setShowStart(true)}
              >
                <Play className="h-4 w-4" strokeWidth={2} />
                Запустить тест (DRY RUN)
              </BrandButton>
              {simulation?.status === "running" && <BrandButton disabled={simulationBusy} onClick={() => simulationAction("pause")}>Пауза теста</BrandButton>}
              {simulation?.status === "paused" && <BrandButton disabled={simulationBusy} onClick={() => simulationAction("resume")}>Продолжить тест</BrandButton>}
              {["running", "paused", "interrupted"].includes(simulation?.status) && <BrandButton disabled={simulationBusy} onClick={() => simulationAction("stop")}>Остановить тест</BrandButton>}
            </>
          )}
        </div>
      </div>

      {simulation && <div className="mb-4 rounded-lg border border-border bg-card p-3 text-sm" role="status">
        Тестовая симуляция «{active?.name}»: <strong>{simulation.status}</strong> ·
        {" "}{simulation.completed}/{simulation.total} шагов · Telegram-запросов: 0.
        <span className="block text-xs text-muted-foreground">Не является запуском Telegram worker; реальная статистика и прогресс не изменяются.</span>
      </div>}
      {liveWorker && <div className="mb-4 rounded-lg border p-3 text-sm" role="status">
        Railway worker: {liveWorker.status} · Кампания: {liveWorker.campaignId || "—"} · Публикаций: {liveWorker.storiesPublished || 0}
        {liveWorker.lastError && <div className="text-red-600">{liveWorker.lastError}</div>}
      </div>}
      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <MetricCard label="Аккаунты" value={status.accounts ?? 0} />
        <MetricCard label="Кампании" value={status.campaigns ?? 0} />
        <MetricCard
          label="Обработано"
          value={totalProcessed.toLocaleString("ru-RU")}
        />
        <MetricCard
          label="Осталось"
          value={totalRemaining.toLocaleString("ru-RU")}
        />
        <MetricCard label="Сегодня" value={todayCount ?? "Нет данных"} />
      </div>

      {/* Current execution */}
      <div className="rounded-xl border border-border bg-card p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold">Текущее выполнение (реальный worker: {execStatus})</h2>
          <Activity className="h-4 w-4 text-primary" strokeWidth={1.75} />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div>
              <div className="brand-eyebrow text-[10px] mb-1.5">Статус</div>
              <StatusBadge status={execStatus} />
            </div>
            <div>
              <div className="brand-eyebrow text-[10px] mb-1.5">Обработано / всего</div>
              <div className="text-xl font-bold tabular-nums">
                {active ? `${active.processed.toLocaleString("ru-RU")} / ${active.totalTargets.toLocaleString("ru-RU")}` : "—"}
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="brand-eyebrow text-[10px]">Прогресс</span>
                <span className="text-xs font-semibold text-primary">{progress}%</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              Последнее выполнение: {status.lastExecution || "Нет данных"}
            </div>
          </div>
          <div className="lg:border-l lg:border-border lg:pl-6">
            <div className="brand-eyebrow text-[10px] mb-1.5">Статус кампании</div>
            {active ? (
              <div className="space-y-2">
                <div className="font-medium text-foreground">{active.name}</div>
                <StatusBadge status={displayCampaignStatus(active)} />
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">Нет активной кампании</span>
            )}
          </div>
        </div>
      </div>

      {/* Campaigns + Recent events */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Campaigns */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold">Кампании</h2>
            <Link to="/campaigns" className="text-xs font-medium text-primary hover:underline">
              Все кампании →
            </Link>
          </div>
          <div className="space-y-2.5">
            {campaigns.map((c) => {
              const p = c.totalTargets
                ? Math.round((c.processed / c.totalTargets) * 100)
                : 0;
              return (
                <Link
                  key={c.id}
                  to={`/campaigns/${c.id}`}
                  className="block rounded-xl border border-border bg-card p-4 hover:border-primary/40 hover:shadow-sm transition group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-foreground group-hover:text-primary transition">
                        {c.name}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {c.senderIds.length} аккаунтов · {c.totalTargets.toLocaleString("ru-RU")} отметок
                      </div>
                    </div>
                    <StatusBadge status={displayCampaignStatus(c)} />
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${p}%` }} />
                    </div>
                    <span className="text-xs font-medium text-muted-foreground tabular-nums whitespace-nowrap">
                      {c.processed.toLocaleString("ru-RU")} / {c.totalTargets.toLocaleString("ru-RU")}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Recent events */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold">Последние события</h2>
            <Link to="/logs" className="text-xs font-medium text-primary hover:underline">
              Все логи →
            </Link>
          </div>
            <div className="rounded-xl border border-border bg-card divide-y divide-border">
              {logs.length === 0 && (
                <div className="px-4 py-4 text-xs text-muted-foreground">
                  Пока нет записанных событий
                </div>
              )}

              {logs.map((l) => (
              <div key={l.id} className="px-4 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-foreground truncate">{l.event}</span>
                  <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">{l.time}</span>
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground truncate">{l.sender} · {l.detail}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <ConfirmDialog open={showStart && status.mode === "LIVE"} onClose={() => setShowStart(false)}
        onConfirm={() => liveAction("start")} title="Запустить реальные отметки" confirmLabel="Запустить LIVE">
        <label className="flex gap-2 p-4 text-sm"><input type="checkbox" checked={consentChecked} onChange={e => setConsentChecked(e.target.checked)} />
          Подтверждаю, что все получатели заранее согласились на отметки в Stories.</label>
      </ConfirmDialog>
      {/* Start confirmation */}
      <ConfirmDialog
        open={showStart && status.mode === "DRY RUN"}
        onClose={() => setShowStart(false)}
        onConfirm={() => simulationAction("start")}
        title="Тестовая симуляция (без Telegram)"
        confirmLabel="Запустить тест"
      >
        <div className="mt-4 space-y-2 rounded-lg bg-muted p-4 text-sm">
          <Row label="Кампания" value={active?.name || "—"} />
          <Row label="Аккаунты" value={active ? `${active.senderIds.length}` : "—"} />
          <Row label="Отметок" value={active ? active.totalTargets.toLocaleString("ru-RU") : "—"} />
          <Row label="Режим" value="DRY RUN — без Telegram" />
        </div>
      </ConfirmDialog>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}