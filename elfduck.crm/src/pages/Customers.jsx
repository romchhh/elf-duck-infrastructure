import React, { useState, useMemo, useEffect } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import {

  Search,

  Star,

  ArrowUpDown,

  ArrowUp,

  ArrowDown,

} from 'lucide-react';
import DataTable from '@/components/shared/DataTable';
import Badge from '@/components/shared/Badge';
import Pagination from '@/components/shared/Pagination';
import KpiCard from '@/components/shared/KpiCard';
import MetricGrid from '@/components/shared/MetricGrid';
import { usePeriod } from '@/lib/PeriodContext';
import { cn } from '@/lib/utils';
import { crmFetch, CRM_API_URL } from '@/lib/crmFetch';
import { setCrmSessionToken } from '@/lib/crmSession';

const statusFilters = [
  { key: 'all', label: 'Все' },
  { key: 'active', label: 'Активные' },
  { key: 'sleeping', label: 'Спящие' },
  { key: 'new', label: 'Новые' },
];
const statusMap = { active: 'active', sleeping: 'sleeping', vip: 'vip', new: 'new' };
const PAGE_SIZE = 50;

const periodMap = {
  'Сегодня': 'today',
  'Неделя': 'week',
  'Месяц': 'month',
  '3 мес': '3m',
  '3 месяца': '3m',
  '6 мес': '6m',
  '6 месяцев': '6m',
  'Всё': 'all',
  'Все время': 'all',
};

const validPeriodKeys = new Set([
  'today',
  'week',
  'month',
  '3m',
  '6m',
  'all',
]);

const formatMoney = (value) =>
  `${new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 2,
  }).format(Number(value || 0))} zł`;

const formatNumber = (value) =>
  new Intl.NumberFormat('ru-RU').format(
    Number(value || 0)
  );

const formatDateOnly = (date) => {
  const year = date.getFullYear();
  const month = String(
    date.getMonth() + 1
  ).padStart(2, '0');

  const day = String(
    date.getDate()
  ).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const formatLastOrder = (value) => {
  if (!value) return '—';

  return new Intl.DateTimeFormat(
    'ru-RU',
    {
      timeZone: 'Europe/Warsaw',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }
  ).format(new Date(value));
};

function Avatar({ name }) {
  const initials = name.split(' ').map((p) => p[0]).slice(0, 2).join('');
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[hsl(234_22%_18%)] to-[hsl(234_22%_10%)] text-[11px] font-semibold text-foreground">
      {initials}
    </div>
  );
}

export default function Customers() {
  const { period, range } = usePeriod();

  const queryClient =
    useQueryClient();

  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState('');
  const [sortDirection, setSortDirection] =
    useState('desc');
  const [authOpen, setAuthOpen] = useState(false);

const [authPassword, setAuthPassword] = useState('');

const [authError, setAuthError] = useState('');

const [authLoading, setAuthLoading] = useState(false);

const [pendingFavoriteRow, setPendingFavoriteRow] = useState(null);

const baseQueryString = useMemo(() => {
  const periodKey =
    periodMap[period] ||
    (
      validPeriodKeys.has(period)
        ? period
        : null
    );

  if (periodKey) {
    return `period=${encodeURIComponent(
      periodKey
    )}`;
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
}, [
  period,
  range?.start,
  range?.end,
]);

const requestQuery =
  useMemo(() => {
    if (!baseQueryString) {
      return '';
    }

    const params =
      new URLSearchParams(
        baseQueryString
      );

    params.set(
      'page',
      String(page)
    );

    params.set(
      'limit',
      String(PAGE_SIZE)
    );

    params.set(
      'status',
      status
    );

    if (sortKey) {

  params.set(

    'sortKey',

    sortKey

  );

  params.set(

    'sortDirection',

    sortDirection

  );

}

    const trimmedQuery =
      query.trim();

    if (trimmedQuery) {
      params.set(
        'search',
        trimmedQuery
      );
    }

    return params.toString();
  }, [
    baseQueryString,
    page,
    status,
    query,
    sortKey,

sortDirection,
  ]);

useEffect(() => {

  setPage(1);

}, [

  baseQueryString,

  status,

  query,

  sortKey,

  sortDirection,

]);

const {
  data,
  isLoading,
  isError,
  error,
} = useQuery({
  queryKey: [
    'crm-customers',
    requestQuery,
  ],

  enabled:
    Boolean(requestQuery),

  queryFn: async () => {
    if (!CRM_API_URL) {
      throw new Error(
        'VITE_CRM_API_URL is not configured'
      );
    }

    const response =
      await crmFetch(
        `/crm/customers?${requestQuery}`
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
          'CUSTOMERS_LOAD_FAILED'
      );
    }

    return result;
  },
});

const favoriteMutation =
  useMutation({
    mutationFn: async ({
      telegramId,
      isFavorite,
    }) => {
      const response =
        await crmFetch(
          `/crm/customers/${encodeURIComponent(
            telegramId
          )}/favorite`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              isFavorite,
            }),
          }
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
            'CUSTOMER_FAVORITE_UPDATE_FAILED'
        );
      }

      return result;
    },

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [
          'crm-customers',
        ],
      });
    },

    onError: (
      error,
      variables
    ) => {
      if (
        error?.message ===
        'UNAUTHORIZED'
      ) {
        setPendingFavoriteRow(
          variables?.row || null
        );

        setAuthError('');
        setAuthOpen(true);
      }
    },
  });

const toggleFavorite = (row) => {
  const telegramId =
    String(
      row?.telegramId || ''
    ).trim();

  if (!telegramId) {
    return;
  }

  favoriteMutation.mutate({
    telegramId,
    isFavorite:
      !row.isFavorite,
    row,
  });
};

const submitCrmAuth =
  async (event) => {
    event?.preventDefault?.();

    if (
      !authPassword ||
      authLoading
    ) {
      return;
    }

    setAuthLoading(true);
    setAuthError('');

    try {
      const response =
        await fetch(
          `${CRM_API_URL}/crm/auth/login`,
          {
            method: 'POST',
            credentials:
              'include',

            headers: {
              'Content-Type':
                'application/json',
            },

            body:
              JSON.stringify({
                password:
                  authPassword,
              }),
          }
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
            'AUTH_FAILED'
        );
      }

      if (result?.sessionToken) {
        setCrmSessionToken(result.sessionToken);
      }

      const row =
        pendingFavoriteRow;

      setAuthOpen(false);
      setAuthPassword('');
      setPendingFavoriteRow(
        null
      );

      // Повторяем нажатие ★
      // после успешного входа.
      if (row) {
        favoriteMutation.mutate({
          telegramId:
            String(
              row?.telegramId ||
                ''
            ).trim(),

          isFavorite:
            !row.isFavorite,

          row,
        });
      }
    } catch (error) {
      setAuthError(
        error?.message ===
          'INVALID_CRM_PASSWORD'
          ? 'Неверный пароль'
          : 'Не удалось авторизоваться'
      );
    } finally {
      setAuthLoading(false);
    }
  };

const pageRows =
  Array.isArray(data?.rows)
    ? data.rows
    : [];

//     const sortedPageRows = useMemo(() => {
//   if (!sortKey) {
//     return pageRows;
//   }

//   return [...pageRows].sort((a, b) => {
//     const left = Number(
//       a?.[sortKey] || 0
//     );

//     const right = Number(
//       b?.[sortKey] || 0
//     );

//     return sortDirection === 'asc'
//       ? left - right
//       : right - left;
//   });
// }, [
//   pageRows,
//   sortKey,
//   sortDirection,
// ]);

const summaryData =
  data?.summary || {};

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

const summary = [
  {
    label: 'Клиентов',
    value:
      formatNumber(
        summaryData.customers
      ),
  },

  {
    label: 'Активных',
    value:
      formatNumber(
        summaryData.active
      ),
  },

  {
    label: 'Top LTV',
    value:
      formatMoney(
        summaryData.topLtv
      ),
  },

  {
    label: 'Средний чек',
    value:
      formatMoney(
        summaryData.averageCheck
      ),
  },
];

const toggleSort = (key) => {
  if (sortKey === key) {
    setSortDirection(
      (current) =>
        current === 'desc'
          ? 'asc'
          : 'desc'
    );

    return;
  }

  setSortKey(key);
  setSortDirection('desc');
};

const renderSortableHeader =
  (key, label) => (
    <button
      type="button"
      onClick={() =>
        toggleSort(key)
      }
      className="inline-flex items-center gap-1.5 whitespace-nowrap text-inherit transition-colors hover:text-foreground"
    >
      <span>{label}</span>

      {sortKey !== key ? (
        <ArrowUpDown className="h-3 w-3 text-muted-2" />
      ) : sortDirection ===
        'desc' ? (
        <ArrowDown className="h-3 w-3 text-[hsl(255_100%_72%)]" />
      ) : (
        <ArrowUp className="h-3 w-3 text-[hsl(255_100%_72%)]" />
      )}
    </button>
  );

  const columns = [
{
  key: 'name',
  header: 'Клиент',

  render: (r) => (
    <div className="flex items-center gap-2">

      <button
        type="button"

        onClick={() =>
          toggleFavorite(r)
        }

        title={
          r.isFavorite
            ? 'Убрать из избранных'
            : 'Добавить в избранные'
        }

        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-all',

          r.isFavorite
            ? 'text-amber-400 hover:bg-amber-400/10'
            : 'text-muted-2 hover:bg-amber-400/10 hover:text-amber-400'
        )}
      >
        <Star
          className={cn(
            'h-4 w-4',

            r.isFavorite &&
              'fill-current'
          )}
        />
      </button>

      <Avatar name={r.name} />

      <div>
        <div className="font-medium text-foreground">
          {r.name}
        </div>

        <div className="text-[11px] text-muted-2">
          {r.handle}
        </div>
      </div>

    </div>
  ),
},
    { key: 'status', header: 'Статус', render: (r) => <Badge status={statusMap[r.status]} /> },
    { key: 'segment', header: 'Сегмент', render: (r) => <span className="text-muted-foreground">{r.segment}</span> },
    {
      key: 'ltv',
      header:

  renderSortableHeader(

    'ltv',

    'LTV'

  ),
      align: 'right',
      render: (r) => (
        <span className="font-medium text-foreground">
          {formatMoney(r.ltv)}
        </span>
      ),
    },
    {
  key: 'purchases',

  header:
    renderSortableHeader(
      'purchases',
      'Покупки'
    ),

  align: 'right',

  render: (r) => (
    <span className="text-muted-foreground">
      {r.purchases}
    </span>
  ),
},
    { key: 'interval', header: 'Период.', align: 'right', render: (r) => <span className="text-muted-foreground">{r.interval ? `${r.interval} дн.` : '—'}</span> },
{

  key: 'avgCheck',

  header:

    renderSortableHeader(

      'avgCheck',

      'Ср. чек'

    ),
      align: 'right',
      render: (r) => (
        <span className="text-muted-foreground">
          {formatMoney(r.avgCheck)}
        </span>
      ),
    },
    {
      key: 'lastOrder',
      header: 'Последний',
      align: 'right',
      render: (r) => (
        <span className="text-muted-foreground">
          {formatLastOrder(r.lastOrder)}
        </span>
      ),
    },
    {
      key: 'cashback',
      header:

  renderSortableHeader(

    'cashback',

    'Кэшбэк'

  ),
      align: 'right',
      render: (r) => (
        <span className="font-medium text-[hsl(255_100%_72%)]">
          {formatMoney(r.cashback)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {summary.map((s) => (
          <KpiCard key={s.label} label={s.label} value={s.value} />
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg border border-border bg-[hsl(232_26%_7%)] p-0.5 no-scrollbar">
          {statusFilters.map((s) => (
            <button
              key={s.key}
              onClick={() => setStatus(s.key)}
              className={cn(
                'shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-[12px] font-medium transition-all',
                status === s.key
                  ? 'bg-[hsl(255_100%_68%/0.14)] text-foreground shadow-[inset_0_0_0_1px_hsl(255_100%_68%/0.22)]'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-auto">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск клиента…"
            className="h-9 w-full rounded-lg border border-border bg-[hsl(232_26%_7%)] pl-9 pr-3 text-[13px] outline-none focus:border-[hsl(255_100%_68%/0.4)] sm:w-64"
          />
        </div>
      </div>

      <div className="rounded-2xl surface-card p-2">
        <div className="hidden md:block">
          <DataTable

  columns={columns}

rows={pageRows}

  dense

/>
        </div>
        <div className="space-y-2.5 p-1 md:hidden">
          {pageRows.map((r) => (
            <CustomerMobileRow

              key={r.id}

              r={r}

              onToggleFavorite={

                toggleFavorite

              }

            />
          ))}
        </div>
        <Pagination
          page={safePage}
          pageCount={pageCount}
          total={total}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
        />
      </div>
      {authOpen && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
    <form
      onSubmit={submitCrmAuth}
      className="w-full max-w-sm rounded-2xl border border-border bg-[hsl(232_26%_7%)] p-5 shadow-2xl"
    >
      <div className="text-base font-semibold text-foreground">
        Авторизация CRM
      </div>

      <div className="mt-1 text-[12px] text-muted-2">
        Введите пароль, чтобы изменять избранных клиентов.
      </div>

      <input
        autoFocus
        type="password"
        value={authPassword}
        onChange={(e) =>
          setAuthPassword(
            e.target.value
          )
        }
        placeholder="Пароль"
        className="mt-4 h-10 w-full rounded-lg border border-border bg-[hsl(232_26%_6%)] px-3 text-[13px] text-foreground outline-none"
      />

      {authError && (
        <div className="mt-2 text-[12px] text-red-400">
          {authError}
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            setAuthOpen(false);
            setAuthPassword('');
            setAuthError('');
            setPendingFavoriteRow(
              null
            );
          }}
          className="h-9 rounded-lg border border-border px-3 text-[12px]"
        >
          Отмена
        </button>

        <button
          type="submit"
          disabled={
            authLoading ||
            !authPassword
          }
          className="h-9 rounded-lg bg-[hsl(255_100%_68%)] px-4 text-[12px] font-semibold text-white disabled:opacity-50"
        >
          {authLoading
            ? 'Вход…'
            : 'Войти'}
        </button>
      </div>
    </form>
  </div>
)}
    </div>
  );
}

function CustomerMobileRow({

  r,

  onToggleFavorite,

}) {
  return (
    <div className="rounded-xl border border-border-soft bg-[hsl(232_26%_6%)] p-3.5">
      <div className="flex items-center gap-2">

  <button
    type="button"

    onClick={() =>
      onToggleFavorite(r)
    }

    title={
      r.isFavorite
        ? 'Убрать из избранных'
        : 'Добавить в избранные'
    }

    className={cn(
      'flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-all',

      r.isFavorite
        ? 'text-amber-400'
        : 'text-muted-2'
    )}
  >
    <Star
      className={cn(
        'h-4 w-4',

        r.isFavorite &&
          'fill-current'
      )}
    />
  </button>

  <Avatar name={r.name} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium text-foreground">{r.name}</div>
          <div className="truncate text-[11px] text-muted-2">{r.handle}</div>
        </div>
        <Badge status={statusMap[r.status]} />
      </div>
      <div className="mt-3 border-t border-border-soft pt-3">
        <MetricGrid cols={3} items={[
          {
            label: 'LTV',
            value: formatMoney(r.ltv),
            className: 'text-foreground',
          },
          { label: 'Покупки', value: r.purchases },
          {
            label: 'Ср. чек',
            value: formatMoney(r.avgCheck),
          },
        ]} />
        <div className="mt-2.5">
          <MetricGrid cols={3} items={[
            { label: 'Период', value: r.interval ? `${r.interval} дн.` : '—' },
            {
              label: 'Кэшбэк',
              value: formatMoney(r.cashback),
              className: 'text-[hsl(255_100%_72%)]',
            },

            {
              label: 'Последний',
              value: formatLastOrder(r.lastOrder),
            },
          ]} />
        </div>
        <div className="mt-2 text-[11px] text-muted-2">Сегмент: <span className="text-muted-foreground">{r.segment}</span></div>
      </div>
    </div>
  );
}