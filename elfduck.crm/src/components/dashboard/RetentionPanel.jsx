import React from 'react';
import {
  ResponsiveContainer,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
} from 'recharts';

const currency = (value) =>
  new Intl.NumberFormat(
    'pl-PL',
    {
      style: 'currency',
      currency: 'PLN',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }
  ).format(
    Number(value || 0)
  );

const percent = (value) => {

  const number = Number(value || 0);

  return `${

    Number.isInteger(number)

      ? number.toFixed(0)

      : number.toFixed(1)

  }%`;

};

const intervalDays = (value) => {
  const days =
    Number(value || 0);

  if (!days) return '—';

  return `${days.toFixed(1)} дней`;
};

export default function RetentionPanel({
  data,
  loading = false,
}) {
  const rate =
    Number(
      data?.rate || 0
    );

  const change =
    data?.change;

  const chartData = [
    {
      name: 'repeat',
      value: rate,
      fill:
        'hsl(255 100% 68%)',
    },
  ];

  const changeValue =
    change === null ||
    change === undefined
      ? null
      : Number(change);

  const changePositive =
    changeValue !== null &&
    changeValue >= 0;

  return (
    <div className="rounded-2xl surface-card p-6">
      <h3 className="font-heading text-[15px] font-semibold text-foreground">
        Повторные покупки
      </h3>

      <p className="mt-0.5 text-[12px] text-muted-foreground">
        Удержание клиентов
      </p>

      <div className="relative mt-2 h-[150px] min-w-0">
        <ResponsiveContainer
          width="100%"
          height="100%"
        >
          <RadialBarChart
            innerRadius="82%"
            outerRadius="98%"
            data={chartData}
            startAngle={90}
            endAngle={-270}
          >
            <PolarAngleAxis
              type="number"
              domain={[0, 100]}
              tick={false}
            />

            <RadialBar
              background={{
                fill:
                  'hsl(234 22% 11%)',
              }}
              dataKey="value"
              cornerRadius={20}
            />
          </RadialBarChart>
        </ResponsiveContainer>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-heading text-[24px] sm:text-[26px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-foreground whitespace-nowrap">
            {loading
              ? '—'
              : percent(rate)}
          </span>

          {changeValue !== null &&
            !loading && (
              <span
                className={
                  changePositive
                    ? 'mt-1 text-[12px] font-medium text-[hsl(142_70%_55%)]'
                    : 'mt-1 text-[12px] font-medium text-[hsl(0_82%_66%)]'
                }
              >
                {changePositive
                  ? '+'
                  : ''}
                {Number.isInteger(changeValue)
                  ? changeValue.toFixed(0)
                  : changeValue.toFixed(1)}
                %
              </span>
            )}
        </div>
      </div>

      <div className="mt-4 space-y-2.5 border-t border-border-soft pt-4">
        <Row
          label="Новые клиенты"
          value={
            loading
              ? '—'
              : percent(
                  data?.newShare
                )
          }
        />

        <Row
          label="Повторные"
          value={
            loading
              ? '—'
              : percent(
                  data?.repeatShare
                )
          }
        />

        <Row
          label="Средний интервал"
          value={
            loading
              ? '—'
              : intervalDays(
                  data
                    ?.averageIntervalDays
                )
          }
        />

        <Row
          label="Выручка повторных"
          value={
            loading
              ? '—'
              : currency(
                  data
                    ?.repeatRevenue
                )
          }
          accent
        />
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  accent,
}) {
  return (
    <div className="flex items-center justify-between gap-4 text-[12px]">
      <span className="text-muted-foreground">
        {label}
      </span>

      <span
        className={
          accent
            ? 'shrink-0 whitespace-nowrap font-medium tabular-nums text-[hsl(255_100%_72%)]'
            : 'shrink-0 whitespace-nowrap font-medium tabular-nums text-foreground'
        }
      >
        {value}
      </span>
    </div>
  );
}