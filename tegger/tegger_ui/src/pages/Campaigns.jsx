import React, { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { teggerClient } from "@/api/teggerClient";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import BrandButton from "@/components/BrandButton";
import EmptyState from "@/components/EmptyState";
import CreateCampaignDialog from "@/components/CreateCampaignDialog";

function decodeElfduckTargets(hash) {
  const raw = String(hash || "").replace(/^#/, "");
  if (!raw.startsWith("elfduck=")) return "";

  try {
    const encoded = raw.slice("elfduck=".length);
    const binary = atob(decodeURIComponent(encoded));
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

export default function Campaigns() {
  const location = useLocation();
  const navigate = useNavigate();
  const importHandledRef = useRef(false);
  const [campaigns, setCampaigns] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [importTargets, setImportTargets] = useState("");
  const [importName, setImportName] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = async () => {
    try {
      setError("");

      const data = await teggerClient.campaigns.list();

      setCampaigns(data);
    } catch (err) {
      setError(err.message || "Не удалось загрузить кампании");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (importHandledRef.current) return;

    const params = new URLSearchParams(location.search);
    const shouldCreate = params.get("create") === "1";
    const hashText = decodeElfduckTargets(
      location.hash || window.location.hash
    );

    if (!shouldCreate && !hashText) return;

    importHandledRef.current = true;

    if (hashText.trim()) {
      setImportTargets(hashText.trim());
      setImportName(
        `ElfDuck CRM ${new Date().toLocaleDateString("ru-RU")}`
      );
    }

    setShowCreate(true);
    navigate("/campaigns", { replace: true });
  }, [location.search, location.hash, navigate]);

  return (
    <div>
      <PageHeader title="Кампании" subtitle="Управление кампаниями и назначениями">
        <BrandButton variant="primary" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" strokeWidth={2} />
          Создать кампанию
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

      {loading && (
        <div className="mb-4 text-sm text-muted-foreground">
          Загрузка кампаний…
        </div>
      )}

      {campaigns.length === 0 ? (
        <EmptyState
          title="Нет кампаний"
          description="Создайте первую кампанию, чтобы начать обработку таргетов"
          action={<BrandButton variant="primary" onClick={() => setShowCreate(true)}>+ Создать кампанию</BrandButton>}
        />
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {/* Desktop table */}
          <table className="hidden md:table w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <Th>Кампания</Th>
                <Th>Статус</Th>
                <Th>Аккаунты</Th>
                <Th>Отметок</Th>
                <Th>Выполнено</Th>
                <Th>Осталось</Th>
                <Th>Прогресс</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {campaigns.map((c) => {
                const p = c.totalTargets > 0

                  ? Math.round((c.processed / c.totalTargets) * 100)

                  : 0;
                const remaining = c.remaining ?? (c.totalTargets - c.processed);
                return (
                  <tr
                    key={c.id}
                    onClick={() => (window.location.href = `/campaigns/${c.id}`)}
                    className="hover:bg-primary/5 cursor-pointer transition"
                  >
                    <Td><span className="font-medium text-foreground">{c.name}</span></Td>
                    <Td><StatusBadge status={c.status} /></Td>
                    <Td>{c.senderIds.length}</Td>
                    <Td>{c.totalTargets.toLocaleString("ru-RU")}</Td>
                    <Td>{c.processed.toLocaleString("ru-RU")}</Td>
                    <Td>{remaining.toLocaleString("ru-RU")}</Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${p}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground tabular-nums">{p}%</span>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-border">
            {campaigns.map((c) => {
              const p = c.totalTargets > 0
                ? Math.round((c.processed / c.totalTargets) * 100)
                : 0;
              const remaining = c.remaining ?? (c.totalTargets - c.processed);
              return (
                <Link key={c.id} to={`/campaigns/${c.id}`} className="block p-4 hover:bg-muted/40">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-foreground">{c.name}</span>
                    <StatusBadge status={c.status} />
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <span>{c.senderIds.length} аккаунтов</span>
                    <span>{c.totalTargets.toLocaleString("ru-RU")} отметок</span>
                    <span>Выполнено: {c.processed.toLocaleString("ru-RU")}</span>
                    <span>Осталось: {remaining.toLocaleString("ru-RU")}</span>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${p}%` }} />
                    </div>
                    <span className="text-xs text-muted-foreground tabular-nums">{p}%</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <CreateCampaignDialog
        open={showCreate}
        initialTargets={importTargets}
        initialName={importName}
        onClose={() => {
          setShowCreate(false);
          setImportTargets("");
          setImportName("");
        }}
        onCreated={() => {
          setShowCreate(false);
          setImportTargets("");
          setImportName("");
          refresh();
        }}
      />
    </div>
  );
}

function Th({ children }) {
  return <th className="text-left font-semibold text-[11px] uppercase tracking-wide text-muted-foreground px-4 py-3">{children}</th>;
}
function Td({ children, className }) {
  return <td className={`px-4 py-3 text-foreground ${className || ""}`}>{children}</td>;
}