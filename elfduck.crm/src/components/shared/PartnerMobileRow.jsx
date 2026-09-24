import React from 'react';
import { currency, num } from '@/lib/mockData';
import Delta from '@/components/shared/Delta';
import MetricGrid from '@/components/shared/MetricGrid';

export default function PartnerMobileRow({ p, rank, showName = true, showTrend = false, showLtv = false }) {
const titleText = showName

  ? (p.name || p.username)

  : (p.username || p.handle);

const subText =

  showName && p.username

    ? `@${p.username}`

    : null;
  return (
    <div className="rounded-xl border border-border-soft bg-[hsl(232_26%_6%)] p-3.5">
      <div className="flex items-center gap-2.5">
        {rank !== undefined && (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[hsl(255_100%_68%/0.12)] text-[11px] font-semibold text-[hsl(255_100%_72%)]">
            {rank}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium text-foreground">{titleText}</div>
          {subText && <div className="truncate text-[11px] text-muted-2">{subText}</div>}
        </div>
        <div className="shrink-0 text-right">
          <div className="whitespace-nowrap text-[14px] font-semibold tabular-nums text-foreground">{currency(p.revenue)}</div>
          {showTrend ? (
            <div className="flex justify-end"><Delta value={p.trend} suffix="%" /></div>
          ) : (
            <div className="text-[10px] uppercase tracking-wider text-muted-2">выручка</div>
          )}
        </div>
      </div>
      <div className="mt-3 border-t border-border-soft pt-3">
        <MetricGrid cols={3} items={[
          { label: 'Приглашено', value: num(p.invited) },
          { label: 'Купили', value: num(p.buyers) },
          { label: 'Конверсия', value: `${p.conversion}%`, className: 'text-[hsl(255_100%_72%)]' },
        ]} />
        <div className="mt-2.5">
          <MetricGrid cols={showLtv ? 3 : 2} items={[
            { label: 'Ср. чек', value: `${p.averageCheck} zł` },
            ...(showLtv ? [{ label: 'LTV клиентов', value: `${p.ltv} zł` }] : []),
          ]} />
        </div>
      </div>
    </div>
  );
}