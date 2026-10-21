import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Plus, Search, Check, X, RefreshCw } from "lucide-react";
import { teggerClient } from "@/api/teggerClient";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import BrandButton from "@/components/BrandButton";
import AddAccountDialog from "@/components/AddAccountDialog";

export default function Accounts() {
  const [accounts, setAccounts] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      teggerClient.accounts.list()
        .then((rows) => { if (active) { setAccounts(rows); setError(""); } })
        .catch((err) => { if (active) setError(err.message || "Не удалось загрузить аккаунты"); })
        .finally(() => { if (active) setLoading(false); });
    };
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
    };
  }, []);

  const syncAccounts = async () => {
    if (syncing) return;
    setSyncing(true);
    setError("");
    setSyncMessage("");
    try {
      const result = await teggerClient.accounts.sync();
      setAccounts(result.accounts);
      const ok = result.results.filter((item) => item.status === "Активен").length;
      setSyncMessage(`Проверено ${result.results.length} аккаунтов, активных: ${ok}.`);
    } catch (err) {
      setError(err.message || "Не удалось синхронизировать аккаунты");
    } finally {
      setSyncing(false);
    }
  };

  const filtered = accounts.filter((a) =>
    (a.name || "").toLowerCase().includes(search.toLowerCase()) ||
    (a.telegram || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
            <AddAccountDialog open={addOpen} onClose={() => setAddOpen(false)} onCreated={() => {
        setAddOpen(false);
        teggerClient.accounts.list().then(setAccounts).catch((err) => setError(err.message));
      }} />
      <PageHeader title="Аккаунты" subtitle={`${accounts.length} сендеров`}>
        <BrandButton variant="secondary" disabled={syncing || loading} onClick={syncAccounts}>
          <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Синхронизация…" : "Синхронизировать"}
        </BrandButton>
        <span>
          <BrandButton variant="primary" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" /> Добавить аккаунт
          </BrandButton>
        </span>
      </PageHeader>
      <div className="relative max-w-sm mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по имени или username"
          className="h-10 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
      </div>
      {syncMessage && <div role="status" className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">{syncMessage}</div>}
      {error && <div role="alert" className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      {loading && <div className="mb-4 text-sm text-muted-foreground">Загрузка аккаунтов...</div>}
      {!loading && !error && <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="hidden md:table w-full text-sm">
          <thead><tr className="border-b border-border bg-muted/50">
            <Th>Аккаунт</Th><Th>Telegram</Th><Th>Статус</Th><Th>Сегодня</Th><Th>Session</Th><Th>Proxy</Th><Th>Story</Th><Th>Действия</Th>
          </tr></thead>
          <tbody className="divide-y divide-border">
            {filtered.map((a) => <tr key={a.id} className="hover:bg-primary/5">
              <Td><span className="font-medium">{a.name}</span></Td>
              <Td className="text-muted-foreground">{a.telegram || "—"}</Td>
              <Td><StatusBadge status={a.status} /></Td>
              <Td className="tabular-nums">{a.dailyCount ?? 0} / {a.dailyLimit ?? "—"}</Td>
              <Td><Flag ok={a.session} /></Td><Td><Flag ok={a.proxy} /></Td><Td><Flag ok={a.story} /></Td>
              <Td><Link to={`/accounts/${encodeURIComponent(a.id)}`} className="text-xs font-medium text-primary hover:underline">Открыть</Link></Td>
            </tr>)}
          </tbody>
        </table>
        <div className="md:hidden divide-y divide-border">
          {filtered.map((a) => <Link key={a.id} to={`/accounts/${encodeURIComponent(a.id)}`} className="block p-4 hover:bg-muted/40">
            <div className="flex items-center justify-between"><span className="font-medium">{a.name}</span><StatusBadge status={a.status} /></div>
            <div className="mt-1 text-xs text-muted-foreground">{a.telegram || "—"}</div>
            <div className="mt-2 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Сегодня: <span className="text-foreground font-medium">{a.dailyCount ?? 0}/{a.dailyLimit ?? "—"}</span></span>
              <span className="flex gap-1.5"><Flag ok={a.session} /><Flag ok={a.proxy} /><Flag ok={a.story} /></span>
            </div>
          </Link>)}
        </div>
        {filtered.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">Аккаунты не найдены</div>}
      </div>}
      <div className="mt-3 text-xs text-muted-foreground">Session, Proxy и Story показывают локальную конфигурацию, а не результат проверки Telegram.</div>
    </div>
  );
}
function Th({ children }) { return <th className="text-left font-semibold text-[11px] uppercase tracking-wide text-muted-foreground px-4 py-3">{children}</th>; }
function Td({ children, className }) { return <td className={`px-4 py-3 ${className || ""}`}>{children}</td>; }
function Flag({ ok }) { return ok ? <Check className="h-4 w-4 text-emerald-500" strokeWidth={2.5} /> : <X className="h-4 w-4 text-neutral-300" strokeWidth={2.5} />; }
