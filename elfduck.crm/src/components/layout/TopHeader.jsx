import React, { useState } from 'react';
import { Menu, RefreshCw } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import PeriodControl from './PeriodControl';

const HIDE_PERIOD_PATHS = new Set([
  '/sales/customers',
  '/catalog',
]);

export default function TopHeader({ title, subtitle, onMenu }) {
  const location = useLocation();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const showPeriod = !HIDE_PERIOD_PATHS.has(location.pathname);

  const refreshSystem = async () => {
    if (refreshing) return;
    setRefreshing(true);

    try {
      await queryClient.invalidateQueries({ refetchType: 'active' });
      await queryClient.refetchQueries({ type: 'active' });
    } finally {
      window.setTimeout(() => setRefreshing(false), 400);
    }
  };

  return (
    <header className="sticky top-0 z-20 flex flex-col gap-3 border-b border-border bg-[hsl(234_31%_4%/0.85)] px-4 py-3 backdrop-blur-xl lg:flex-row lg:items-center lg:justify-between lg:gap-4 sm:px-6 lg:px-7 lg:py-4">
      <div className="flex items-center gap-3">
        {onMenu && (
          <button
            onClick={onMenu}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-foreground lg:hidden"
            aria-label="Меню"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}
        <div className="min-w-0">
          <h2 className="truncate font-heading text-[16px] font-semibold tracking-tight text-foreground sm:text-[18px]">{title}</h2>
          {subtitle && <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{subtitle}</p>}
        </div>
      </div>

      <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-end lg:w-auto">
        <button
          type="button"
          onClick={refreshSystem}
          disabled={refreshing}
          className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-border bg-[hsl(232_26%_7%)] px-3 text-[12px] font-medium text-foreground transition-colors hover:border-[hsl(255_100%_68%/0.35)] hover:text-foreground disabled:opacity-60"
          title="Обновить данные CRM"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Обновляем…' : 'Обновить систему'}
        </button>

        {showPeriod ? <PeriodControl /> : null}
      </div>
    </header>
  );
}
