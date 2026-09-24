import React, {

  useEffect,

  useState,

} from 'react';

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

import { cn } from '@/lib/utils';

const numberFormatter =
  new Intl.NumberFormat('pl-PL');

const moneyFormatter =
  new Intl.NumberFormat(
    'pl-PL',
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }
  );

function num(value) {
  return numberFormatter.format(
    Number(value || 0)
  );
}

function currency(value) {
  return `${moneyFormatter.format(
    Number(value || 0)
  )} zł`;
}

function formatChartDate(value) {
  if (!value) return '';

  const [
    year,
    month,
    day,
  ] = String(value).split('-');

  if (
    !year ||
    !month ||
    !day
  ) {
    return value;
  }

  return `${day}.${month}`;
}

const tabs = [
  {
    key: 'revenue',
    label: 'Выручка',
    fmt: currency,
  },

  {
    key: 'orders',
    label: 'Заказы',
    fmt: num,
  },

  {
    key: 'newCustomers',
    label:
      'Новые клиенты',
    fmt: num,
  },

  {
    key: 'repeatCustomers',
    label: 'Повторные',
    fmt: num,
  },
];

export default function RevenueChart({
  data = [],
  loading = false,
}) {
  const [
    tab,
    setTab,
  ] = useState('revenue');

  const cfg =
    tabs.find(
      (item) =>
        item.key === tab
    ) || tabs[0];

  const [isMobile, setIsMobile] =
    useState(
      typeof window !== 'undefined'
        ? window.innerWidth < 640
        : false
    );

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(
        window.innerWidth < 640
      );
    };

    handleResize();

    window.addEventListener(
      'resize',
      handleResize
    );

    return () => {
      window.removeEventListener(
        'resize',
        handleResize
      );
    };
  }, []);

  const tickCount =
    isMobile ? 5 : 8;
  
  const xTicks =
    data.length <= tickCount
      ? data.map(
          (item) => item.date
        )
      : Array.from(
          {
            length:
              tickCount,
          },
          (_, i) => {
            const index =
              Math.round(
                ((data.length - 1) *
                  i) /
                  (tickCount - 1)
              );

            return data[index]?.date;
          }
        ).filter(Boolean);

    const renderXAxisTick = ({
      x,
      y,
      payload,
      index,
    }) => {
      const isFirst =
        index === 0;

      const isLast =
        index ===
        xTicks.length - 1;

      return (
        <text
          x={x}
          y={y + 12}
          fill="hsl(228 10% 44%)"
          fontSize={
            isMobile ? 10 : 11
          }
          textAnchor={
            isFirst
              ? 'start'
              : isLast
                ? 'end'
                : 'middle'
          }
        >
          {formatChartDate(
            payload.value
          )}
        </text>
      );
    };

  return (
    <div className="rounded-2xl surface-card p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-heading text-[15px] font-semibold text-foreground">
            Динамика бизнеса
          </h3>

          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Тренд ключевых метрик во времени
          </p>
        </div>

        <div className="inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg border border-border bg-[hsl(232_26%_7%)] p-0.5 no-scrollbar">
          {tabs.map(
            (item) => (
              <button
                key={item.key}
                onClick={() =>
                  setTab(
                    item.key
                  )
                }
                className={cn(
                  'shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-[12px] font-medium transition-all',

                  tab === item.key
                    ? 'bg-[hsl(255_100%_68%/0.14)] text-foreground shadow-[inset_0_0_0_1px_hsl(255_100%_68%/0.22)]'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {item.label}
              </button>
            )
          )}
        </div>
      </div>

      <div className="mt-5 h-[260px] min-w-0">
        {loading ? (
          <div className="flex h-full items-center justify-center text-[12px] text-muted-foreground">
            Загрузка данных...
          </div>
        ) : (
          <ResponsiveContainer
            width="100%"
            height="100%"
          >
            <AreaChart
              data={data}
              margin={{
                top: 8,
                right: 8,
                bottom: 0,
                left: -10,
              }}
            >
              <defs>
                <linearGradient
                  id="dyn-fill"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="0%"
                    stopColor="hsl(255 100% 68%)"
                    stopOpacity={0.3}
                  />

                  <stop
                    offset="100%"
                    stopColor="hsl(255 100% 68%)"
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>

              <CartesianGrid
                stroke="hsl(234 18% 13%)"
                strokeDasharray="3 6"
                vertical={false}
              />

              <XAxis

                dataKey="date"

                ticks={xTicks}

                tick={renderXAxisTick}

                axisLine={false}

                tickLine={false}

                interval={0}

                padding={{

                  left: 0,

                  right: 0,

                }}

              />

              <YAxis
                tick={{
                  fill:
                    'hsl(228 10% 44%)',
                  fontSize: 11,
                }}
                axisLine={false}
                tickLine={false}
                width={48}
              />

              <Tooltip
                cursor={{
                  stroke:
                    'hsl(255 100% 68%)',
                  strokeWidth: 1,
                  strokeDasharray:
                    '4 4',
                }}
                contentStyle={{
                  background:
                    'hsl(232 26% 8%)',
                  border:
                    '1px solid hsl(234 18% 15%)',
                  borderRadius: 12,
                  fontSize: 12,
                  color: '#fff',
                  boxShadow:
                    '0 8px 30px -8px rgba(0,0,0,0.6)',
                }}
                labelStyle={{
                  color:
                    'hsl(228 12% 62%)',
                  fontSize: 11,
                  marginBottom: 4,
                }}
                labelFormatter={
                  formatChartDate
                }
                formatter={(value) => [
                  cfg.fmt(value),
                  cfg.label,
                ]}
              />

              <Area
                type="monotone"
                dataKey={cfg.key}
                stroke="hsl(255 100% 68%)"
                strokeWidth={2}
                fill="url(#dyn-fill)"
                dot={false}
                activeDot={{
                  r: 4,
                  fill:
                    'hsl(255 100% 68%)',
                  stroke: '#fff',
                  strokeWidth: 1.5,
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}