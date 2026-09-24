import React, { useState, useMemo, useEffect } from 'react';
import { currency, num } from '@/lib/mockData';
import Sparkline from '@/components/shared/Sparkline';
import Delta from '@/components/shared/Delta';
import Pagination from '@/components/shared/Pagination';
import ProductMobileRow from '@/components/shared/ProductMobileRow';
import { usePeriod } from '@/lib/PeriodContext';
import { cn } from '@/lib/utils';

const segments = [
  { key: 'best', label: 'Лучшие' },
  { key: 'worst', label: 'Худшие' },
  { key: 'category', label: 'По категориям' },
];

const PAGE_SIZE = 10;

export default function ProductPerformance({ data, loading = false }) {
  const { period } = usePeriod();
  const [seg, setSeg] = useState('best');
  const [cat, setCat] = useState('Все категории');
  const [page, setPage] = useState(1);

  const allProducts = Array.isArray(data?.rows)
    ? data.rows
    : [];

  const productCategories = Array.isArray(data?.categories)
    ? data.categories
    : ['Все категории'];

  useEffect(() => {
    setPage(1);
  }, [period, data]);

  const filtered = useMemo(() => {
    let rows;

    if (seg === 'best') {
      rows = [...allProducts]
        .filter((p) => Number(p.revenue || 0) > 0)
        .sort(
          (a, b) =>
            Number(b.revenue || 0) -
            Number(a.revenue || 0)
        );
    } else if (seg === 'worst') {
      rows = [...allProducts].sort(
        (a, b) =>
          Number(a.revenue || 0) -
          Number(b.revenue || 0)
      );
    } else {
      rows = allProducts.filter(
        (p) =>
          cat === 'Все категории' ||
          p.category === cat
      );
    }

    return rows;
  }, [allProducts, seg, cat]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const onSegChange = (s) => { setSeg(s); setPage(1); };
  const onCatChange = (c) => { setCat(c); setPage(1); };

  const formatDays = (value) => {

    if (

      value === null ||

      value === undefined ||

      !Number.isFinite(Number(value))

    ) {

      return '—';

    }

    const number = Number(value);

    return Number.isInteger(number)

      ? number.toFixed(0)

      : number.toFixed(1);

  };

  return (
    <div className="rounded-2xl surface-card p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="font-heading text-[15px] font-semibold text-foreground">Товары</h3>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <div className="flex w-full items-center gap-0.5 rounded-lg border border-border bg-[hsl(232_26%_7%)] p-0.5 sm:w-auto">
            {segments.map((s) => (
              <button
                key={s.key}
                onClick={() => onSegChange(s.key)}
                className={cn(
                  'min-w-0 flex-1 whitespace-nowrap rounded-md px-2 py-1.5 text-[11px] font-medium transition-all sm:flex-none sm:px-2.5 sm:py-1 sm:text-[12px]',
                  seg === s.key
                    ? 'bg-[hsl(255_100%_68%/0.14)] text-foreground shadow-[inset_0_0_0_1px_hsl(255_100%_68%/0.22)]'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
          {seg === 'category' && (
            <select
              value={cat}
              onChange={(e) => onCatChange(e.target.value)}
              className="h-8 w-full rounded-lg border border-border bg-[hsl(232_26%_7%)] px-2.5 text-[12px] text-foreground outline-none focus:border-[hsl(255_100%_68%/0.4)] sm:w-auto"
            >
              {productCategories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {loading && (
        <div className="mt-4 rounded-xl border border-border-soft bg-[hsl(234_22%_9%/0.45)] px-4 py-8 text-center text-[13px] text-muted-foreground">
          Загружаем товары…
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="mt-4 rounded-xl border border-border-soft bg-[hsl(234_22%_9%/0.45)] px-4 py-8 text-center text-[13px] text-muted-foreground">
          За выбранный период данных по товарам нет
        </div>
      )}

      {/* Desktop / tablet table */}
      <div className="mt-4 hidden md:block">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[720px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-border">
                {['Товар', 'Категория', 'Выручка', 'Продано', 'Динамика', 'Остаток', 'Дн. запаса'].map((h, i) => (
                  <th key={h} className={cn('px-3 py-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-2', i >= 2 && 'text-right')}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((p) => {
                const lowStock =
                  Number(p.stock || 0) <= 10 ||
                  (
                    p.days !== null &&
                    Number(p.days) <= 2
                  );
                return (
                  <tr key={p.id} className="border-b border-border-soft hover:bg-[hsl(234_22%_11%/0.6)]">
                    <td className="px-3 py-3 font-medium text-foreground">{p.name}</td>
                    <td className="px-3 py-3 text-muted-foreground">{p.category}</td>
                    <td className="px-3 py-3 text-right font-medium text-foreground">{currency(p.revenue)}</td>
                    <td className="px-3 py-3 text-right text-muted-foreground">{num(p.sold)} шт.</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16">
                          <Sparkline
                            data={Array.isArray(p.spark) ? p.spark : []}
                            color={
                              Number(p.trend || 0) >= 0
                                ? 'hsl(255 100% 68%)'
                                : 'hsl(0_72%_58%)'
                            }
                            height={22}
                          />
                        </div>

                        {p.trend === null ||
                        p.trend === undefined ? (
                          <span className="text-[12px] text-muted-2">
                            —
                          </span>
                        ) : (
                          <Delta
                            value={Number(p.trend)}
                            suffix="%"
                          />
                        )}
                      </div>
                    </td>
                    <td className={cn('px-3 py-3 text-right', lowStock ? 'text-[hsl(36_90%_62%)]' : 'text-muted-foreground')}>{p.stock} шт.</td>
                    <td className={cn('px-3 py-3 text-right', lowStock ? 'font-medium text-[hsl(36_90%_62%)]' : 'text-muted-foreground')}>{formatDays(p.days)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile list */}
      <div className="mt-4 space-y-2.5 md:hidden">
        {pageRows.map((p) => (
          <ProductMobileRow
            key={p.id}
            p={{
              ...p,
              repeat: p.repeatPercent,
            }}
          />
        ))}
      </div>

      <Pagination
        page={safePage}
        pageCount={pageCount}
        total={filtered.length}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
      />
    </div>
  );
}