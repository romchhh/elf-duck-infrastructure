import React, { useState, useEffect } from "react";
import { Search } from "lucide-react";
import { teggerClient } from "@/api/teggerClient";
import PageHeader from "@/components/PageHeader";
import BrandedSelect from "@/components/BrandedSelect";
import { cn } from "@/lib/utils";

const LEVEL_STYLES = {
  SUCCESS: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  ERROR: "bg-destructive/10 text-destructive ring-1 ring-red-200",
  WARNING: "bg-orange-50 text-orange-700 ring-1 ring-orange-200",
  INFO: "bg-primary/10 text-primary ring-1 ring-primary/20",
};

export default function Logs() {
  const [logs, setLogs] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [error, setError] = useState("");
  const [level, setLevel] = useState("ALL");
  const [sender, setSender] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let active = true;
    teggerClient.accounts.list().then((items) => { if (active) setAccounts(items); })
      .catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = () => teggerClient.logs.list({ level, sender, search })
      .then((items) => { if (active) { setLogs(items); setError(""); } })
      .catch((err) => { if (active) setError(err.message); });
    refresh();
    const timer = setInterval(refresh, 10000);
    return () => { active = false; clearInterval(timer); };
  }, [level, sender, search]);

  return (
    <div>
      <PageHeader title="Логи" subtitle="Операционные события выполнения" />

      <div className="flex flex-col sm:flex-row gap-2.5 mb-4">
        <div className="inline-flex p-1 rounded-full bg-muted self-start overflow-x-auto max-w-full">
          {["ALL", "INFO", "SUCCESS", "WARNING", "ERROR"].map((l) => (
            <button
              key={l}
              onClick={() => setLevel(l)}
              className={cn(
                "h-8 px-3 rounded-full text-xs font-medium transition-colors duration-150 whitespace-nowrap",
                level === l ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {l}
            </button>
          ))}
        </div>
        <BrandedSelect
          value={sender}
          onChange={setSender}
          ariaLabel="Все аккаунты"
          placeholder="Все аккаунты"
          options={[["all", "Все аккаунты"], ...accounts.map((a) => [a.id, a.name])]}
          className="sm:max-w-[220px]"
        />
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск"
            className="h-11 w-full rounded-[14px] border border-input bg-card pl-10 pr-4 text-sm transition-colors hover:border-primary/40 focus:outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
          />
        </div>
      </div>

      {error && <div role="alert" className="mb-4 text-sm text-destructive">{error}</div>}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="hidden md:table w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <Th>Время</Th><Th>Sender</Th><Th>Событие</Th><Th>Детали</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {logs.map((l) => (
              <tr key={l.id} className="hover:bg-muted/30">
                <Td className="text-muted-foreground tabular-nums whitespace-nowrap">{l.date} {l.time}</Td>
                <Td className="font-medium whitespace-nowrap">{l.sender}</Td>
                <Td>
                  <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium", LEVEL_STYLES[l.level])}>
                    {l.event}
                  </span>
                </Td>
                <Td className="text-muted-foreground">{l.detail}</Td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="md:hidden divide-y divide-border">
          {logs.map((l) => (
            <div key={l.id} className="p-4">
              <div className="flex items-center justify-between gap-2">
                <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium", LEVEL_STYLES[l.level])}>{l.event}</span>
                <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">{l.date} {l.time}</span>
              </div>
              <div className="mt-1.5 text-sm font-medium text-foreground">{l.sender}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{l.detail}</div>
            </div>
          ))}
        </div>
        {logs.length === 0 && <div className="p-10 text-center text-sm text-muted-foreground">Нет событий</div>}
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