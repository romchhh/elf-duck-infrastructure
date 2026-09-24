import React from 'react';
import { Menu } from 'lucide-react';
import PeriodControl from './PeriodControl';

export default function TopHeader({ title, subtitle, onMenu }) {
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
      <PeriodControl />
    </header>
  );
}