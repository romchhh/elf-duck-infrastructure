import React from 'react';
import Sparkline from '@/components/shared/Sparkline';
import Delta from '@/components/shared/Delta';

export default function KpiCard({ label, value, delta, series, color = 'hsl(255 100% 68%)', suffix, invert }) {
  return (
    <div className="min-w-0 rounded-2xl surface-card p-4 transition-colors hover:border-[hsl(255_100%_68%/0.25)]">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[11px] font-medium uppercase tracking-[0.1em] text-muted-2">{label}</span>
        {delta !== undefined && (
          <div className="shrink-0 whitespace-nowrap">
            <Delta
              value={invert ? -Math.abs(delta) : delta}
              suffix={suffix}
            />
          </div>
        )}
      </div>
      <div className="mt-2 whitespace-nowrap font-heading text-[22px] font-semibold leading-none tracking-tight tabular-nums text-foreground sm:text-[26px]">
        {value}
      </div>
      {series && (
        <div className="mt-3 h-8 min-w-0">
          <Sparkline data={series} color={color} area />
        </div>
      )}
    </div>
  );
}