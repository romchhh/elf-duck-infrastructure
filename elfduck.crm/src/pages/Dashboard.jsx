import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import RevenuePanel from '@/components/dashboard/RevenuePanel';
import KpiGrid from '@/components/dashboard/KpiGrid';
import InsightsRow from '@/components/dashboard/InsightsRow';
import RevenueChart from '@/components/dashboard/RevenueChart';
import RetentionPanel from '@/components/dashboard/RetentionPanel';
import ProductPerformance from '@/components/dashboard/ProductPerformance';
import LocationPerformance from '@/components/dashboard/LocationPerformance';
import TopPartners from '@/components/dashboard/TopPartners';

import { usePeriod } from '@/lib/PeriodContext';
import { crmFetch, CRM_API_URL } from '@/lib/crmFetch';

const PERIOD_MAP = {
  'Сегодня': 'today',
  'Неделя': 'week',
  'Месяц': 'month',

  '3 мес': '3m',
  '3 месяца': '3m',

  '6 мес': '6m',
  '6 месяцев': '6m',

  'Всё время': 'all',
  'Все время': 'all',
};

function formatDateOnly(value) {
  if (!value) return '';

  const date =
    value instanceof Date
      ? value
      : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const year = date.getFullYear();

  const month = String(
    date.getMonth() + 1
  ).padStart(2, '0');

  const day = String(
    date.getDate()
  ).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export default function Dashboard() {
  const {
    period,
    customRange,
  } = usePeriod();

  const queryString = useMemo(() => {
    const params =
      new URLSearchParams();

    if (period === 'Свой период') {
      const from =
        formatDateOnly(
          customRange?.start
        );

      const to =
        formatDateOnly(
          customRange?.end
        );

      if (!from || !to) {
        return null;
      }

      params.set('from', from);
      params.set('to', to);

      return params.toString();
    }

    params.set(
      'period',
      PERIOD_MAP[period] || 'month'
    );

    return params.toString();
  }, [
    period,
    customRange?.start,
    customRange?.end,
  ]);

  const {
    data,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: [
      'crm-dashboard',
      period,
      queryString,
    ],

    enabled:
      Boolean(queryString),

    queryFn: async () => {
      if (!CRM_API_URL) {
        throw new Error(
          'VITE_CRM_API_URL is not configured'
        );
      }

      const response = await crmFetch(
        `/crm/dashboard?${queryString}`
      );

      const result =
        await response
          .json()
          .catch(() => ({}));

      if (
        !response.ok ||
        result?.ok === false
      ) {
        throw new Error(
          result?.error ||
          'DASHBOARD_LOAD_FAILED'
        );
      }

      return result;
    },
  });

  const dynamics =
    Array.isArray(
      data?.businessDynamics
    )
      ? data.businessDynamics
      : [];

  return (
    <div className="space-y-5">
      {isError && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-[13px] text-red-300">
          Не удалось загрузить данные CRM:
          {' '}
          {error?.message ||
            'неизвестная ошибка'}
        </div>
      )}

      {/* Row 1 — Revenue anchor + supporting KPIs */}
      <div className="grid grid-cols-12 gap-5">
        <div className="col-span-12 lg:col-span-5">
          <RevenuePanel
            revenue={data?.revenue}
            series={dynamics}
            loading={isLoading}
          />
        </div>

        <div className="col-span-12 lg:col-span-7">
          <KpiGrid
            data={data}
            series={dynamics}
            loading={isLoading}
          />
        </div>
      </div>

      <InsightsRow

        data={data}

        loading={isLoading}

      />

      {/* Row 3 — Dynamics + Retention */}
      <div className="grid grid-cols-12 gap-5">
        <div className="col-span-12 lg:col-span-8">
          <RevenueChart
            data={dynamics}
            loading={isLoading}
          />
        </div>

        <div className="col-span-12 lg:col-span-4">
          <RetentionPanel
            data={data?.retention}
            loading={isLoading}
          />
        </div>
      </div>

      {/* Пока остаётся mock */}
      <ProductPerformance
        data={data?.products}
        loading={isLoading}
      />

      {/* Пока остаётся mock */}
      <LocationPerformance
        data={data?.locations}
        loading={isLoading}
      />

      {/* Пока остаётся mock */}
      <TopPartners
        data={data?.topPartners}
        loading={isLoading}
      />
    </div>
  );
}