import React, {
  useMemo,
  useState,
} from 'react';

import {
  useQuery,
} from '@tanstack/react-query';

import LocationCard from '@/components/shared/LocationCard';

import {
  sortOptions,
} from '@/lib/locationMetrics';

import {
  usePeriod,
} from '@/lib/PeriodContext';

import {
  cn,
} from '@/lib/utils';
import { crmFetch, CRM_API_URL } from '@/lib/crmFetch';

const periodMap = {
  Сегодня: 'today',
  Неделя: 'week',
  Месяц: 'month',

  '3 мес': '3m',
  '3 месяца': '3m',

  '6 мес': '6m',
  '6 месяцев': '6m',

  Всё: 'all',
  'Всё время': 'all',
  'Все время': 'all',
};

const validPeriodKeys =
  new Set([
    'today',
    'week',
    'month',
    '3m',
    '6m',
    'all',
  ]);

function formatDateOnly(
  date
) {
  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1
    ).padStart(
      2,
      '0'
    );

  const day =
    String(
      date.getDate()
    ).padStart(
      2,
      '0'
    );

  return `${year}-${month}-${day}`;
}

export default function Locations() {
  const {
    period,
    range,
  } = usePeriod();

  const [
    metric,
    setMetric,
  ] = useState('revenue');

  const queryString =
    useMemo(
      () => {
        const periodKey =
          periodMap[period] ||
          (
            validPeriodKeys.has(
              period
            )
              ? period
              : null
          );

        /*
         * Обычный период имеет
         * приоритет над старым range.
         */
        if (periodKey) {
          return (
            `period=${encodeURIComponent(
              periodKey
            )}`
          );
        }

        if (
          range?.start &&
          range?.end
        ) {
          return (
            `from=${formatDateOnly(
              range.start
            )}` +
            `&to=${formatDateOnly(
              range.end
            )}`
          );
        }

        return '';
      },
      [
        period,
        range?.start,
        range?.end,
      ]
    );

  const {
    data,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: [
      'crm-locations',
      queryString,
    ],

    enabled:
      Boolean(
        queryString
      ),

    queryFn:
      async () => {
        if (!CRM_API_URL) {
          throw new Error(
            'VITE_CRM_API_URL is not configured'
          );
        }

        const response =
          await crmFetch(
            `/crm/locations?${queryString}`
          );

        const result =
          await response
            .json()
            .catch(
              () => ({})
            );

        if (
          !response.ok ||
          result?.ok === false
        ) {
          throw new Error(
            result?.error ||
              'LOCATIONS_LOAD_FAILED'
          );
        }

        return result;
      },
  });

  const rows =
    useMemo(
      () => {
        const source =
          Array.isArray(
            data?.rows
          )
            ? data.rows
            : [];

        return [...source].sort(
          (a, b) =>
            Number(
              b?.[metric] || 0
            ) -
            Number(
              a?.[metric] || 0
            )
        );
      },
      [
        data?.rows,
        metric,
      ]
    );

  const days =
    useMemo(() => {
      if (
        !data?.period?.from ||
        !data?.period?.to
      ) {
        return null;
      }

      const from =
        new Date(
          data.period.from
        );

      const to =
        new Date(
          data.period.to
        );

      return Math.max(
        1,
        Math.round(
          (
            to.getTime() -
            from.getTime()
          ) /
            86400000
        )
      );
    }, [
      data?.period?.from,
      data?.period?.to,
    ]);

  return (
    <div className="space-y-5">
      <div className="inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg border border-border bg-[hsl(232_26%_7%)] p-0.5 no-scrollbar">
        {sortOptions.map(
          (option) => (
            <button
              key={
                option.key
              }
              onClick={() =>
                setMetric(
                  option.key
                )
              }
              className={cn(
                'shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-[12px] font-medium transition-all',

                metric ===
                  option.key
                  ? 'bg-[hsl(255_100%_68%/0.14)] text-foreground shadow-[inset_0_0_0_1px_hsl(255_100%_68%/0.22)]'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {option.label}
            </button>
          )
        )}
      </div>

      {isLoading && (
        <div className="rounded-2xl surface-card px-4 py-12 text-center text-[13px] text-muted-foreground">
          Загружаем точки…
        </div>
      )}

      {!isLoading &&
        isError && (
          <div className="rounded-2xl surface-card px-4 py-12 text-center text-[13px] text-red-400">
            Не удалось загрузить точки:{' '}
            {error?.message ||
              'LOCATIONS_LOAD_FAILED'}
          </div>
        )}

      {!isLoading &&
        !isError &&
        rows.length === 0 && (
          <div className="rounded-2xl surface-card px-4 py-12 text-center text-[13px] text-muted-foreground">
            За выбранный период данных по точкам нет
          </div>
        )}

      {!isLoading &&
        !isError &&
        rows.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map(
              (location) => (
                <LocationCard
                  key={
                    location.id ||
                    location.name
                  }
                  metric={
                    metric
                  }
                  location={
                    location
                  }
                  days={
                    days
                  }
                />
              )
            )}
          </div>
        )}
    </div>
  );
}