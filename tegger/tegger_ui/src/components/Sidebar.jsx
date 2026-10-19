import React, { useState, useEffect } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { Home, Megaphone, Users, ScrollText, Settings, Asterisk, Radar } from "lucide-react";
import { cn } from "@/lib/utils";
import { services, SYSTEM_STATUS } from "@/lib/mockData";
import ModeBadge from "@/components/ModeBadge";

const NAV = [
  { to: "/", label: "Главная", icon: Home, exact: true },
  { to: "/campaigns", label: "Кампании", icon: Megaphone },
  { to: "/accounts", label: "Аккаунты", icon: Users },
  { to: "/logs", label: "Логи", icon: ScrollText },
  { to: "/parser", label: "Парсер", icon: Radar },
];

export default function Sidebar({ onNavigate }) {
  const [status, setStatus] = useState(SYSTEM_STATUS);

  useEffect(() => {
    services.system.getStatus().then(setStatus);
    const id = setInterval(() => services.system.getStatus().then(setStatus), 5000);
    return () => clearInterval(id);
  }, []);

  return (
    <aside className="hidden lg:flex w-[220px] shrink-0 flex-col border-r border-border bg-white h-screen sticky top-0">
      {/* Logo */}
      <div className="flex items-center gap-2 h-16 px-5 border-b border-border">
        <Asterisk className="h-5 w-5 text-primary" strokeWidth={2.5} />
        <span className="text-lg font-bold tracking-tight">Tegger</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.exact}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-blue-50 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )
            }
          >
            <item.icon className="h-4 w-4" strokeWidth={1.75} />
            {item.label}
          </NavLink>
        ))}
        <NavLink
          to="/settings"
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-blue-50 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )
          }
        >
          <Settings className="h-4 w-4" strokeWidth={1.75} />
          Настройки
        </NavLink>
      </nav>

      {/* Bottom status */}
      <div className="px-4 py-4 border-t border-border space-y-3">
        <div>
          <div className="brand-eyebrow text-[10px] mb-1.5">Система</div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-sm font-medium text-foreground">{status.system}</span>
          </div>
        </div>
        <div>
          <div className="brand-eyebrow text-[10px] mb-1.5">Режим</div>
          <ModeBadge mode={status.mode} />
        </div>
      </div>
    </aside>
  );
}

export function MobileTopBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [status, setStatus] = useState(SYSTEM_STATUS);
  const onSettings = location.pathname === "/settings";

  useEffect(() => {
    services.system.getStatus().then(setStatus);
  }, []);

  return (
    <div className="lg:hidden sticky top-0 z-30 flex items-center justify-between h-14 px-4 bg-white/95 backdrop-blur-sm border-b border-border">
      <div className="flex items-center gap-2 min-w-0">
        <Asterisk className="h-5 w-5 text-primary shrink-0" strokeWidth={2.5} />
        <span className="text-base font-bold tracking-tight">Tegger</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <ModeBadge mode={status.mode} compact className="sm:hidden" />
        <ModeBadge mode={status.mode} className="hidden sm:inline-flex" />
        <button
          type="button"
          aria-label="Настройки"
          onClick={() => navigate("/settings")}
          className={cn(
            "inline-flex h-11 w-11 items-center justify-center rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 active:bg-muted",
            onSettings
              ? "bg-blue-50 text-primary"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          <Settings className="h-5 w-5" strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}

export function MobileNav() {
  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-border pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-4">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.exact}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                isActive ? "text-primary" : "text-muted-foreground"
              )
            }
          >
            <item.icon className="h-5 w-5" strokeWidth={1.75} />
            {item.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}