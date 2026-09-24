import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { currency, num } from '@/lib/mockData';
import DataTable from '@/components/shared/DataTable';
import Badge from '@/components/shared/Badge';
import Pagination from '@/components/shared/Pagination';
import KpiCard from '@/components/shared/KpiCard';
import MetricGrid from '@/components/shared/MetricGrid';
import { usePeriod } from '@/lib/PeriodContext';
import { crmFetch, CRM_API_URL } from '@/lib/crmFetch';

const statusMap = {
  done: 'done',
  cancelled: 'cancelled',
  processing: 'processing',
};

const PAGE_SIZE = 50;

function formatOrderDate(value) {
  if (!value) return '—';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Warsaw',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatDateOnly(date) {
  const year = date.getFullYear();

  const month = String(
    date.getMonth() + 1
  ).padStart(2, '0');

  const day = String(
    date.getDate()
  ).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function normalizeTelegramUsername(value) {
  return String(value || '')
    .trim()
    .replace(/^@+/, '');
}

function getCustomerDisplay(row) {
  const username =
    normalizeTelegramUsername(
      row?.username
    );

  if (username) {
    return `@${username}`;
  }

  return String(
    row?.customer ||
      row?.telegramId ||
      '—'
  );
}

function CustomerChatLink({
  row,
  className = '',
}) {
  const username =
    normalizeTelegramUsername(
      row?.username
    );

  const telegramId = String(
    row?.telegramId || ''
  ).trim();

  const label =
    getCustomerDisplay(row);

  if (
    !username &&
    !telegramId
  ) {
    return (
      <span
        className={className}
      >
        {label}
      </span>
    );
  }

  const handleClick = (
    event
  ) => {
    event.preventDefault();

    if (username) {
      window.open(
        `https://t.me/${encodeURIComponent(
          username
        )}`,
        '_blank',
        'noopener,noreferrer'
      );

      return;
    }

    const link =
      `tg://user?id=${encodeURIComponent(
        telegramId
      )}`;

    const startedAt =
      Date.now();

    let pageWasHidden =
      false;

    const handleVisibility =
      () => {
        if (
          document.visibilityState ===
          'hidden'
        ) {
          pageWasHidden =
            true;
        }
      };

    document.addEventListener(
      'visibilitychange',
      handleVisibility
    );

    window.location.href =
      link;

    window.setTimeout(
      () => {
        document.removeEventListener(
          'visibilitychange',
          handleVisibility
        );

        const elapsed =
          Date.now() -
          startedAt;

        if (
          !pageWasHidden &&
          elapsed >= 1000
        ) {
          window.alert(
            `Не удалось открыть чат с клиентом ${label}.\n\n`
          );
        }
      },
      1300
    );
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`${className} text-left hover:underline underline-offset-2`}
      title={
        username
          ? `Открыть чат с @${username}`
          : `Открыть Telegram по ID ${telegramId}`
      }
    >
      {label}
    </button>
  );
}

export default function Orders() {
  const { period, range } = usePeriod();

  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [
    period,
    range?.start,
    range?.end,
    query,
  ]);

  const queryString = useMemo(() => {
    const params =
      new URLSearchParams();

    const periodMap = {
      Сегодня: 'today',
      Неделя: 'week',
      Месяц: 'month',
      '3 мес': '3m',
      '3 месяца': '3m',
      '6 мес': '6m',
      '6 месяцев': '6m',
      Всё: 'all',
      'Все время': 'all',
    };

    if (
      range?.start &&
      range?.end
    ) {
      params.set(
        'from',
        formatDateOnly(
          range.start
        )
      );

      params.set(
        'to',
        formatDateOnly(
          range.end
        )
      );
    } else {
      params.set(
        'period',
        periodMap[period] ||
          'month'
      );
    }

    params.set(
      'page',
      String(page)
    );

    params.set(
      'limit',
      String(PAGE_SIZE)
    );

    const search =
      query.trim();

    if (search) {
      params.set(
        'search',
        search
      );
    }

    return params.toString();
  }, [
    period,
    range?.start,
    range?.end,
    page,
    query,
  ]);

  const {
    data,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: [
      'crm-orders',
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

      const response =
        await crmFetch(
          `/crm/orders?${queryString}`
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
            'ORDERS_LOAD_FAILED'
        );
      }

      return result;
    },
  });

  const pageRows =
    Array.isArray(data?.rows)
      ? data.rows
      : [];

  const pagination =
    data?.pagination || {};

  const safePage =
    Number(
      pagination.page || page
    );

  const pageCount =
    Number(
      pagination.pageCount || 1
    );

  const total =
    Number(
      pagination.total || 0
    );

  const summary =
    useMemo(() => {
      const apiSummary =
        data?.summary || {};

      return [
        {
          label: 'Заказов',
          value: num(
            apiSummary.orders || 0
          ),
        },

        {
          label: 'Выручка',
          value: currency(
            apiSummary.revenue || 0
          ),
        },

        {
          label: 'Средний чек',
          value: `${Math.round(
            Number(
              apiSummary.averageCheck ||
                0
            )
          )} zł`,
        },

        {
          label: 'Отмен',
          value: `${Number(
            apiSummary
              .cancellationsPercent ||
              0
          )}%`,
        },
      ];
    }, [data]);

  const columns = [
    {
      key: 'orderNo',
      header: 'ID',
      render: (r) => (
        <span className="font-mono text-[12px] text-muted-foreground">
          {r.orderNo}
        </span>
      ),
    },

    {
      key: 'customer',
      header: 'Клиент',
      render: (r) => (
        <CustomerChatLink
          row={r}
          className="font-medium text-foreground"
        />
      ),
    },

    {
      key: 'date',
      header: 'Дата',
      render: (r) => (
        <span className="text-muted-foreground">
          {formatOrderDate(
            r.date
          )}
        </span>
      ),
    },

    {
      key: 'items',
      header: 'Товары',
      render: (r) => (
        <span className="text-muted-foreground">
          {r.items}
        </span>
      ),
    },

    {
      key: 'amount',
      header: 'Сумма',
      align: 'right',
      render: (r) => (
        <span className="font-medium text-foreground">
          {r.amount} zł
        </span>
      ),
    },

    {
      key: 'payment',
      header: 'Оплата',
      render: (r) => (
        <span className="text-muted-foreground">
          {r.payment}
        </span>
      ),
    },

    // {
    //   key: 'delivery',
    //   header: 'Доставка',
    //   render: (r) => (
    //     <span className="text-muted-foreground">
    //       {r.delivery}
    //     </span>
    //   ),
    // },

    {
      key: 'location',
      header: 'Точка',
      render: (r) => (
        <span className="text-muted-foreground">
          {r.location}
        </span>
      ),
    },

    {
      key: 'status',
      header: 'Статус',
      render: (r) => (
        <Badge
          status={
            statusMap[r.status]
          }
        />
      ),
    },
  ];

  return (
    <div className="space-y-5">

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {summary.map((s) => (
          <KpiCard
            key={s.label}
            label={s.label}
            value={s.value}
          />
        ))}
      </div>

      <div className="flex justify-end">
        <div className="relative w-full sm:w-64">

          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-2" />

          <input
            value={query}
            onChange={(e) =>
              setQuery(
                e.target.value
              )
            }
            placeholder="Поиск заказа…"
            className="h-9 w-full rounded-lg border border-border bg-[hsl(232_26%_7%)] pl-9 pr-3 text-[13px] outline-none focus:border-[hsl(255_100%_68%/0.4)]"
          />

        </div>
      </div>

      <div className="rounded-2xl surface-card p-2">

        {isLoading && (
          <div className="px-4 py-10 text-center text-[13px] text-muted-foreground">
            Загружаем заказы…
          </div>
        )}

        {isError && (
          <div className="px-4 py-10 text-center text-[13px] text-red-400">
            Не удалось загрузить
            заказы
            {error?.message
              ? `: ${error.message}`
              : ''}
          </div>
        )}

        {!isLoading &&
          !isError &&
          pageRows.length ===
            0 && (
            <div className="px-4 py-10 text-center text-[13px] text-muted-foreground">
              За выбранный период
              заказов нет
            </div>
          )}

        {!isLoading &&
          !isError &&
          pageRows.length >
            0 && (
            <div className="hidden md:block">
              <DataTable
                columns={columns}
                rows={pageRows}
                dense
              />
            </div>
          )}

        {!isLoading &&
          !isError &&
          pageRows.length >
            0 && (
            <div className="space-y-2.5 p-1 md:hidden">

              {pageRows.map(
                (r) => (
                  <OrderMobileRow
                    key={r.id}
                    r={r}
                  />
                )
              )}

            </div>
          )}

        {!isLoading &&
          !isError &&
          total > 0 && (
            <Pagination
              page={safePage}
              pageCount={
                pageCount
              }
              total={total}
              pageSize={
                PAGE_SIZE
              }
              onPageChange={
                setPage
              }
            />
          )}

      </div>
    </div>
  );
}

function OrderMobileRow({
  r,
}) {
  return (
    <div className="rounded-xl border border-border-soft bg-[hsl(232_26%_6%)] p-3.5">

      <div className="flex items-start justify-between gap-2">

        <div className="min-w-0">

          <div className="font-mono text-[11px] text-muted-foreground">
            {r.orderNo}
          </div>

          <div className="truncate text-[13px] font-medium text-foreground">

            <CustomerChatLink

              row={r}

            />

          </div>

          <div className="text-[11px] text-muted-2">
            {formatOrderDate(
              r.date
            )}
          </div>

        </div>

        <Badge
          status={
            statusMap[r.status]
          }
        />

      </div>

      <div className="mt-2 text-[12px] text-muted-foreground">
        {r.items}
      </div>

      <div className="mt-3 border-t border-border-soft pt-3">

      <MetricGrid
        cols={2}
        items={[
          {
            label: 'Сумма',
            value: `${r.amount} zł`,
            className:
              'text-foreground',
          },
          {
            label: 'Оплата',
            value: r.payment,
          },
        ]}
      />

        <div className="mt-2 text-[11px] text-muted-2">
          Точка:{' '}
          <span className="text-muted-foreground">
            {r.location}
          </span>
        </div>

      </div>
    </div>
  );
}