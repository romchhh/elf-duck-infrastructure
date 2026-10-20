import React, { useState, useMemo, useEffect } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { Search, Star, Download } from 'lucide-react';
import DataTable from '@/components/shared/DataTable';
import Badge from '@/components/shared/Badge';
import Pagination from '@/components/shared/Pagination';
import KpiCard from '@/components/shared/KpiCard';
import MetricGrid from '@/components/shared/MetricGrid';
import { cn } from '@/lib/utils';
import { crmFetch, CRM_API_URL } from '@/lib/crmFetch';
import { setCrmSessionToken } from '@/lib/crmSession';
import { TEGGER_URL } from '@/lib/navConfig';
import { useTableSort } from '@/lib/tableSort';

const statusFilters = [
  { key: 'all', label: 'Все' },
  { key: 'favorites', label: 'Избранные' },
  { key: 'active', label: 'Активные' },
  { key: 'sleeping', label: 'Спящие' },
  { key: 'new', label: 'Новые' },
];
const statusMap = { active: 'active', sleeping: 'sleeping', vip: 'vip', new: 'new' };
const PAGE_SIZE = 50;

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
  const queryClient = useQueryClient();

  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [page, setPage] = useState(1);
  const { sortKey, sortDirection, toggleSort, appendSortParams } =
    useTableSort();
  const [authOpen, setAuthOpen] = useState(false);
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [pendingFavoriteRow, setPendingFavoriteRow] = useState(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 350);

    return () => window.clearTimeout(timer);
  }, [query]);

  const requestQuery = useMemo(() => {
    const params = new URLSearchParams();
    params.set('period', 'all');
    params.set('page', String(page));
    params.set('limit', String(PAGE_SIZE));
    params.set('status', status);

    appendSortParams(params);

    if (debouncedQuery) {
      params.set('search', debouncedQuery);
    }

    return params.toString();
  }, [page, status, debouncedQuery, appendSortParams]);

  useEffect(() => {
    setPage(1);
  }, [status, debouncedQuery, sortKey, sortDirection]);

  const {
    data,
    isLoading,
    isError,
    error,
    isFetching,
  } = useQuery({
    queryKey: ['crm-customers', requestQuery],
    enabled: Boolean(requestQuery),
    placeholderData: (previous) => previous,
    staleTime: 60_000,
    queryFn: async () => {
      if (!CRM_API_URL) {
        throw new Error('VITE_CRM_API_URL is not configured');
      }

      const response = await crmFetch(`/crm/customers?${requestQuery}`);
      const result = await response.json().catch(() => ({}));

      if (!response.ok || result?.ok === false) {
        throw new Error(result?.error || 'CUSTOMERS_LOAD_FAILED');
      }

      return result;
    },
  });

  const patchFavoriteInCache = (telegramId, isFavorite) => {
    queryClient.setQueriesData(
      { queryKey: ['crm-customers'] },
      (current) => {
        if (!current || !Array.isArray(current.rows)) {
          return current;
        }

        return {
          ...current,
          rows: current.rows.map((row) =>
            String(row?.telegramId || '') === telegramId
              ? { ...row, isFavorite }
              : row
          ),
        };
      }
    );
  };

  const favoriteMutation = useMutation({
    mutationFn: async ({ telegramId, isFavorite }) => {
      const response = await crmFetch(
        `/crm/customers/${encodeURIComponent(telegramId)}/favorite`,
        {
          method: 'PATCH',
          body: JSON.stringify({ isFavorite }),
        }
      );

      const result = await response.json().catch(() => ({}));

      if (!response.ok || result?.ok === false) {
        throw new Error(
          result?.error || 'CUSTOMER_FAVORITE_UPDATE_FAILED'
        );
      }

      return result;
    },

    onMutate: async ({ telegramId, isFavorite }) => {
      await queryClient.cancelQueries({ queryKey: ['crm-customers'] });
      patchFavoriteInCache(telegramId, isFavorite);
    },

    onSuccess: (result) => {
      const telegramId = String(result?.telegramId || '').trim();
      if (!telegramId) return;
      patchFavoriteInCache(telegramId, result?.isFavorite === true);
    },

    onError: (error, variables) => {
      if (variables?.telegramId != null) {
        patchFavoriteInCache(
          variables.telegramId,
          !variables.isFavorite
        );
      }

      if (error?.message === 'UNAUTHORIZED') {
        setPendingFavoriteRow(variables?.row || null);
        setAuthError('');
        setAuthOpen(true);
      }
    },
  });

  const toggleFavorite = (row) => {
    const telegramId = String(row?.telegramId || '').trim();
    if (!telegramId) return;

    favoriteMutation.mutate({
      telegramId,
      isFavorite: !row.isFavorite,
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

      // Повторяем действие ★ после успешного входа.
      if (row) {
        const telegramId = String(row?.telegramId || '').trim();
        if (telegramId) {
          favoriteMutation.mutate({
            telegramId,
            // pending row is the pre-click snapshot
            isFavorite: !row.isFavorite,
            row,
          });
        }
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

const encodeTargetsForTegger = (text) => {
  const bytes = new TextEncoder().encode(String(text || ''));
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return encodeURIComponent(btoa(binary));
};

const handleOpenInTegger = async () => {
  if (!TEGGER_URL) {
    setExportError('VITE_TEGGER_URL не настроен');
    return;
  }

  setExportLoading(true);
  setExportError('');

  try {
    const response = await crmFetch('/crm/customers/export?format=tegger');

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.error || `HTTP_${response.status}`);
    }

    const csvText = await response.text();
    const usernames = csvText
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .map((line) => line.trim().replace(/^"|"$/g, ''))
      .filter((line) => line && line.toLowerCase() !== 'username')
      .map((line) => line.replace(/^@+/, '').toLowerCase())
      .filter((line) => /^[a-z0-9_]{5,32}$/.test(line));

    if (usernames.length === 0) {
      throw new Error('NO_USERNAMES');
    }

    const payload = usernames.map((name) => `@${name}`).join('\n');
    const base = TEGGER_URL.replace(/\/$/, '');
    const teggerUrl = `${base}/campaigns?create=1&source=elfduck#elfduck=${encodeTargetsForTegger(payload)}`;

    window.open(teggerUrl, '_blank', 'noopener,noreferrer');
  } catch (error) {
    if (error?.message === 'NO_USERNAMES') {
      setExportError('В базе нет username для импорта в Tegger');
    } else {
      setExportError(
        error?.message === 'UNAUTHORIZED'
          ? 'Нужна авторизация CRM'
          : 'Не удалось открыть базу в Tegger'
      );
    }
  } finally {
    setExportLoading(false);
  }
};

  const columns = [
    {
      key: 'name',
      header: 'Клиент',
      render: (r) => (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              toggleFavorite(r);
            }}
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
              className={cn('h-4 w-4', r.isFavorite && 'fill-current')}
            />
          </button>
          <Avatar name={r.name} />
          <div>
            <div className="font-medium text-foreground">{r.name}</div>
            <div className="text-[11px] text-muted-2">{r.handle}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Статус',
      render: (r) => <Badge status={statusMap[r.status]} />,
    },
    {
      key: 'segment',
      header: 'Сегмент',
      render: (r) => (
        <span className="text-muted-foreground">{r.segment}</span>
      ),
    },
    {
      key: 'ltv',
      header: 'LTV',
      align: 'right',
      render: (r) => (
        <span className="font-medium text-foreground">
          {formatMoney(r.ltv)}
        </span>
      ),
    },
    {
      key: 'purchases',
      header: 'Покупки',
      align: 'right',
      render: (r) => (
        <span className="text-muted-foreground">{r.purchases}</span>
      ),
    },
    {
      key: 'interval',
      header: 'Период.',
      align: 'right',
      render: (r) => (
        <span className="text-muted-foreground">
          {r.interval ? `${r.interval} дн.` : '—'}
        </span>
      ),
    },
    {
      key: 'avgCheck',
      header: 'Ср. чек',
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
      header: 'Кэшбэк',
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
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск клиента…"
              className="h-9 w-full rounded-lg border border-border bg-[hsl(232_26%_7%)] pl-9 pr-3 text-[13px] outline-none focus:border-[hsl(255_100%_68%/0.4)]"
            />
            {isFetching && query !== debouncedQuery ? (
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-2">
                …
              </span>
            ) : null}
          </div>
          {TEGGER_URL ? (
            <button
              type="button"
              onClick={handleOpenInTegger}
              disabled={exportLoading}
              title="Выгрузить username и сразу открыть создание кампании в Tegger"
              className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-border bg-[hsl(232_26%_7%)] px-3 text-[13px] font-medium text-foreground transition-colors hover:border-[hsl(255_100%_68%/0.35)] disabled:opacity-60"
            >
              <Download className="h-3.5 w-3.5" />
              {exportLoading ? 'Выгрузка…' : 'Открыть в tegger'}
            </button>
          ) : null}
        </div>
      </div>

      {exportError ? (
        <p className="text-[13px] text-red-400">{exportError}</p>
      ) : null}

      <div className="rounded-2xl surface-card p-2">
        <div className="hidden md:block">
          <DataTable
            columns={columns}
            rows={pageRows}
            dense
            sortKey={sortKey}
            sortDirection={sortDirection}
            onSort={toggleSort}
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