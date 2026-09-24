import React, { useState, useMemo } from 'react';
// import { locations } from '@/lib/mockData';
import LocationCard from '@/components/shared/LocationCard';
import { sortOptions } from '@/lib/locationMetrics';
import { usePeriod } from '@/lib/PeriodContext';
import { cn } from '@/lib/utils';

export default function LocationPerformance({ data, loading = false }) {
  const { range } = usePeriod();
  const [metric, setMetric] = useState('revenue');
  const days = useMemo(() => {
    if (!range) return null;
    return Math.max(1, Math.round((range.end - range.start) / 86400000));
  }, [range]);
  const locations = Array.isArray(data?.rows)
    ? data.rows
    : [];

const getMetricKey = (metric) => {
  switch (metric) {
    case 'orders':
      return 'orders';

    case 'averageCheck':
    case 'avg':
    case 'check':
      return 'averageCheck';

    case 'growth':
      return 'revenueChange';

    case 'cancel':
    case 'cancellations':
      return 'cancellationsPercent';

    case 'repeat':
    case 'repeats':
      return 'repeatPercent';

    case 'revenue':
    default:
      return 'revenue';
  }
};

const metricKey =
  getMetricKey(metric);

const rows =
  [...locations].sort(
    (a, b) =>
      Number(
        b?.[metricKey] || 0
      ) -
      Number(
        a?.[metricKey] || 0
      )
  );

  return (
    <div className="rounded-2xl surface-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-heading text-[15px] font-semibold text-foreground">Точки продаж</h3>
        <div className="inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg border border-border bg-[hsl(232_26%_7%)] p-0.5 no-scrollbar">
          {sortOptions.map((s) => (
            <button
              key={s.key}
              onClick={() => setMetric(s.key)}
              className={cn(
                'shrink-0 whitespace-nowrap rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-all lg:py-1',
                metric === s.key
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
        <div className="mt-5 rounded-xl border border-border-soft bg-[hsl(234_22%_9%/0.45)] px-4 py-8 text-center text-[13px] text-muted-foreground">
          Загружаем точки продаж…
        </div>
      )}

      {!loading && rows.length === 0 && (
        <div className="mt-5 rounded-xl border border-border-soft bg-[hsl(234_22%_9%/0.45)] px-4 py-8 text-center text-[13px] text-muted-foreground">
          За выбранный период данных по точкам нет
        </div>
      )}

    {!loading && rows.length > 0 && (
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((l) => (
          <LocationCard
            key={l.id || l.name}
            metric={metric}
            location={l}
            days={days}
          />
        ))}
      </div>
    )}
    </div>
  );
}