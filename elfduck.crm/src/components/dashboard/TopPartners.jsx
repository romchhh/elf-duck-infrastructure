import React, { useState } from 'react';

import { currency } from '@/lib/mockData';

import PartnerMobileRow from '@/components/shared/PartnerMobileRow';

import { cn } from '@/lib/utils';

const sortOptions = [
  { key: 'revenue', label: 'По выручке' },
  { key: 'orders', label: 'По покупкам' },
  { key: 'conversion', label: 'По конверсии' },
];

export default function TopPartners({ data, loading = false }) {
  const [sort, setSort] = useState('revenue');

  const partners = Array.isArray(data?.rows)
    ? data.rows
    : [];

  const rows = [...partners]
    .sort(
      (a, b) =>
        Number(b?.[sort] || 0) -
        Number(a?.[sort] || 0)
    )
    .slice(0, 5);

  return (
    <div className="rounded-2xl surface-card p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="font-heading text-[15px] font-semibold text-foreground">Топ партнёров</h3>
        <div className="flex w-full items-center gap-0.5 rounded-lg border border-border bg-[hsl(232_26%_7%)] p-0.5 sm:w-auto">
          {sortOptions.map((s) => (
            <button
              key={s.key}
              onClick={() => setSort(s.key)}
              className={cn(
                'min-w-0 flex-1 whitespace-nowrap rounded-md px-2 py-1.5 text-[11px] font-medium transition-all sm:flex-none sm:px-2.5 sm:py-1 sm:text-[12px]',
                sort === s.key
                  ? 'bg-[hsl(255_100%_68%/0.14)] text-foreground shadow-[inset_0_0_0_1px_hsl(255_100%_68%/0.22)]'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="mt-4 rounded-xl border border-border-soft bg-[hsl(232_26%_6%)] px-4 py-8 text-center text-[13px] text-muted-foreground">
          Загружаем партнёров…
        </div>
      )}

      {!loading && rows.length === 0 && (
        <div className="mt-4 rounded-xl border border-border-soft bg-[hsl(232_26%_6%)] px-4 py-8 text-center text-[13px] text-muted-foreground">
          За выбранный период данных по партнёрам нет
        </div>
      )}

      {/* Mobile — full-width compact rows */}
      <div className="mt-4 space-y-2.5 md:hidden">
        {rows.map((p, i) => (
          <PartnerMobileRow
            key={p.id || p.telegramId}
            p={p}
            rank={i + 1}
          />
        ))}
      </div>

      {/* Desktop / tablet — original cards */}
      <div className="mt-4 hidden grid-cols-2 gap-3 md:grid lg:grid-cols-3 xl:grid-cols-5">
        {rows.map((p, i) => (
          <div key={p.id || p.telegramId}className="rounded-xl border border-border-soft bg-[hsl(232_26%_6%)] p-4 transition-colors hover:border-[hsl(255_100%_68%/0.25)]">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[hsl(255_100%_68%/0.12)] text-[11px] font-semibold text-[hsl(255_100%_72%)]">
                {i + 1}
              </span>
              <span className="truncate text-[13px] font-medium text-foreground">@{p.username}</span>
            </div>
            <div className="mt-3 space-y-1.5 text-[12px]">
              <div className="flex justify-between"><span className="text-muted-2">Приглашено</span><span className="text-muted-foreground">{p.invited}</span></div>
              <div className="flex justify-between"><span className="text-muted-2">Купили</span><span className="text-muted-foreground">{p.buyers}</span></div>
              <div className="flex justify-between"><span className="text-muted-2">Конверсия</span><span className="font-medium tabular-nums text-[hsl(255_100%_72%)]">{p.conversion}%</span></div>
            </div>
            <div className="mt-3 border-t border-border-soft pt-2.5">
              <div className="text-[11px] text-muted-2">Приведённая выручка</div>
              <div className="text-[15px] font-semibold tabular-nums text-foreground">{currency(p.revenue)}</div>
              <div className="mt-1 text-[11px] text-muted-2">Средний чек: <span className="tabular-nums text-muted-foreground">{p.averageCheck} zł</span></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}