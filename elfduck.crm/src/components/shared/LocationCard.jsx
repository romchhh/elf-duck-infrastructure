import React from 'react';
import Sparkline from '@/components/shared/Sparkline';
import { cn } from '@/lib/utils';

function formatNumber(value, digits = 0) {
  const number = Number(value || 0);

  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(number);
}

function formatCurrency(value) {
  return `${formatNumber(value, 0)} zł`;
}

function Trend({ value, invert = false }) {
  if (value === null || value === undefined) {
    return (
      <span className="text-[13px] font-medium text-muted-2">
        —
      </span>
    );
  }

  const numericValue = Number(value || 0);
  const positive = numericValue >= 0;
  const good = invert ? !positive : positive;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[13px] font-medium tabular-nums',
        good
          ? 'text-[hsl(142_70%_58%)]'
          : 'text-[hsl(0_72%_62%)]'
      )}
    >
      {positive ? '↑' : '↓'} {Math.abs(numericValue)}%
    </span>
  );
}

function getMetricView(
  metric,
  location
) {
  switch (metric) {
    case 'orders':
      return {
        value:
          formatNumber(
            location.orders
          ),

        label:
          'Заказы',

        trend:
          location.ordersChange,

        spark: [
          Number(
            location
              .previousOrders ||
              0
          ),
          Number(
            location.orders ||
              0
          ),
        ],
      };

      case 'averageCheck':

      case 'avgCheck':

      case 'average':

      case 'avg':

      case 'check':
      return {
        value:
          formatCurrency(
            location.averageCheck
          ),

        label:
          'Средний чек',

        trend:
          location
            .averageCheckChange,

        spark: [
          Number(
            location
              .previousAverageCheck ||
              0
          ),
          Number(
            location
              .averageCheck || 0
          ),
        ],
      };

    case 'growth':
    case 'trend':
      return {
        value:
          `${
            Number(
              location
                .revenueChange ||
                0
            ) > 0
              ? '+'
              : ''
          }${Number(
            location
              .revenueChange ||
              0
          )}%`,

        label:
          'Рост',

        trend: null,

        spark: [
          Number(
            location
              .previousRevenue ||
              0
          ),
          Number(
            location.revenue ||
              0
          ),
        ],
      };

    case 'cancel':
    case 'cancellations':
      return {
        value:
          `${formatNumber(
            location
              .cancellationsPercent,
            1
          )}%`,

        label:
          'Отмены',

        trend:
          location
            .cancellationsChangePoints,

        invertTrend: true,

        spark: [
          Number(
            location
              .previousCancellationsPercent ||
              0
          ),
          Number(
            location
              .cancellationsPercent ||
              0
          ),
        ],
      };

      case 'repeat':

      case 'repeats':

      case 'repeatRate':

      case 'repeatPercent':
      return {
        value:
          `${formatNumber(
            location.repeatPercent,
            1
          )}%`,

        label:
          'Повторные',

        trend:
          location
            .repeatChangePoints,

        spark: [
          Number(
            location
              .previousRepeatPercent ||
              0
          ),
          Number(
            location.repeatPercent ||
              0
          ),
        ],
      };

    case 'revenue':
    default:
      return {
        value:
          formatCurrency(
            location.revenue
          ),

        label:
          'Выручка',

        trend:
          location.revenueChange,

        spark: [
          Number(
            location
              .previousRevenue ||
              0
          ),
          Number(
            location.revenue ||
              0
          ),
        ],
      };
  }
}

export default function LocationCard({
  metric,
  location,
}) {
  const view = getMetricView(
    metric,
    location
  );

  return (
    <div className="rounded-2xl surface-card p-5 transition-colors hover:border-[hsl(255_100%_68%/0.25)]">
      <div className="flex items-start justify-between gap-3">
        <span className="text-[14px] font-semibold text-foreground">
          {location.name}
        </span>

        <Trend

          value={view.trend}

          invert={Boolean(

            view.invertTrend

          )}

        />
      </div>

      <div
        className={cn(
          'mt-2 font-heading text-[24px] font-semibold leading-none tabular-nums',
          metric === 'growth'
            ? Number(location.revenueChange || 0) >= 0
              ? 'text-[hsl(142_70%_58%)]'
              : 'text-[hsl(0_72%_62%)]'
            : 'text-foreground'
        )}
      >
        {view.value}
      </div>

      <div className="mt-1 text-[11px] uppercase tracking-[0.06em] text-muted-2">
        {view.label}
      </div>

      <div className="mt-3 h-10">
        <Sparkline
          data={view.spark}
          area
          height={40}
        />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-y-2 text-[12px] tabular-nums">
        <span className="text-muted-2">
          {formatNumber(location.orders)} заказов
        </span>

        <span className="text-center text-muted-2">
          {formatNumber(
            location.averageCheck
          )} zł чек
        </span>

        <span className="text-right text-muted-2">
          {formatNumber(
            location.customers
          )} клиентов
        </span>
      </div>

      <div className="mt-3 border-t border-border-soft pt-2.5">
        <div className="text-[11px] text-muted-2">
          {location.type === 'pickup'
            ? 'Точка самовывоза'
            : location.type === 'courier'
              ? 'Курьерская доставка'
              : location.type === 'inpost'
                ? 'Доставка InPost'
                : 'Канал продаж'}
        </div>
      </div>
    </div>
  );
}