import React, {
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  Search,
} from 'lucide-react';

import {
  useQuery,
  useQueryClient,
  useMutation,
} from '@tanstack/react-query';

import DataTable from '@/components/shared/DataTable';
import Pagination from '@/components/shared/Pagination';
import MetricGrid from '@/components/shared/MetricGrid';

import {
  usePeriod,
} from '@/lib/PeriodContext';

import {
  cn,
} from '@/lib/utils';
import { crmFetch, crmFetchJson, CRM_API_URL } from '@/lib/crmFetch';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';

const PAGE_SIZE = 50;

const filters = [
  {
    key: 'all',
    label: 'Все',
  },
  {
    key: 'balance',
    label: 'Есть баланс',
  },
  {
    key: 'expiring',
    label: 'Скоро сгорит',
  },
];

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

function formatMoney(value) {
  return `${new Intl.NumberFormat(
    'ru-RU',
    {
      maximumFractionDigits: 2,
    }
  ).format(
    Number(value || 0)
  )} zł`;
}

function formatDateOnly(date) {
  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1
    ).padStart(2, '0');

  const day =
    String(
      date.getDate()
    ).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function formatExpireDate(value) {
  if (!value) {
    return '—';
  }

  return new Intl.DateTimeFormat(
    'ru-RU',
    {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone:
        'Europe/Warsaw',
    }
  )
    .format(
      new Date(value)
    )
    .replace(
      /\s?г\.?$/,
      ''
    )
    .replace('.', '');
}

const adjustErrorText = (code) => {
  const key = String(code || '').trim();
  const map = {
    USERNAME_REQUIRED: 'Укажите Telegram username',
    USER_NOT_FOUND: 'Пользователь не найден',
    INVALID_CASHBACK_AMOUNT: 'Сумма должна быть больше 0',
    INSUFFICIENT_CASHBACK_BALANCE: 'Недостаточно кэшбэка на балансе',
    CASHBACK_LOOKUP_FAILED: 'Не удалось проверить баланс',
    CASHBACK_GRANT_FAILED: 'Не удалось начислить кэшбэк',
    CASHBACK_DEDUCT_FAILED: 'Не удалось списать кэшбэк',
  };
  return map[key] || key || 'Ошибка операции';
};

function normalizeAdjustUsername(raw) {
  return String(raw || '').trim().replace(/^@+/, '');
}

function CashbackAdjustPanel({ onAdjusted }) {
  const [mode, setMode] = useState('lookup');
  const [username, setUsername] = useState('');
  const [amountZl, setAmountZl] = useState('');
  const [lookup, setLookup] = useState(null);

  const lookupMutation = useMutation({
    mutationFn: async () => {
      const u = normalizeAdjustUsername(username);
      if (!u) throw new Error('USERNAME_REQUIRED');
      return crmFetchJson(
        `/crm/cashback/user?username=${encodeURIComponent(u)}`
      );
    },
    onSuccess: (data) => {
      setLookup(data);
      toast({
        title: 'Баланс получен',
        description: `${formatMoney(data?.cashbackBalance)} · @${data?.user?.username || ''}`,
      });
    },
    onError: (error) => {
      setLookup(null);
      toast({
        variant: 'destructive',
        title: 'Ошибка',
        description: adjustErrorText(error?.message),
      });
    },
  });

  const grantMutation = useMutation({
    mutationFn: async () => {
      const u = normalizeAdjustUsername(username);
      const amount = Number(String(amountZl).replace(',', '.'));
      if (!u) throw new Error('USERNAME_REQUIRED');
      if (!(amount > 0)) throw new Error('INVALID_CASHBACK_AMOUNT');
      return crmFetchJson('/crm/cashback/grant', {
        method: 'POST',
        body: JSON.stringify({ username: u, amountZl: amount }),
      });
    },
    onSuccess: (data) => {
      setLookup({
        user: data?.user,
        cashbackBalance: data?.cashbackBalance,
        activeLots: [],
      });
      onAdjusted?.();
      toast({
        title: 'Кэшбэк начислен',
        description: `Новый баланс: ${formatMoney(data?.cashbackBalance)}`,
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Ошибка начисления',
        description: adjustErrorText(error?.message),
      });
    },
  });

  const deductMutation = useMutation({
    mutationFn: async () => {
      const u = normalizeAdjustUsername(username);
      const amount = Number(String(amountZl).replace(',', '.'));
      if (!u) throw new Error('USERNAME_REQUIRED');
      if (!(amount > 0)) throw new Error('INVALID_CASHBACK_AMOUNT');
      return crmFetchJson('/crm/cashback/deduct', {
        method: 'POST',
        body: JSON.stringify({ username: u, amountZl: amount }),
      });
    },
    onSuccess: (data) => {
      setLookup({
        user: data?.user,
        cashbackBalance: data?.cashbackBalance,
        activeLots: [],
      });
      onAdjusted?.();
      toast({
        title: 'Кэшбэк списан',
        description: `Новый баланс: ${formatMoney(data?.cashbackBalance)}`,
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Ошибка списания',
        description: adjustErrorText(error?.message),
      });
    },
  });

  const busy =
    lookupMutation.isPending ||
    grantMutation.isPending ||
    deductMutation.isPending;

  const runPrimary = () => {
    if (mode === 'lookup') lookupMutation.mutate();
    else if (mode === 'grant') grantMutation.mutate();
    else deductMutation.mutate();
  };

  const primaryLabel =
    mode === 'lookup'
      ? 'Проверить'
      : mode === 'grant'
        ? 'Начислить'
        : 'Списать';

  return (
    <div className="rounded-2xl surface-card p-6 space-y-4">
      <div>
        <h3 className="font-heading text-[15px] font-semibold text-foreground">
          Управление балансом клиента
        </h3>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          Начисление, списание и проверка по Telegram @username (как в админ-боте)
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { key: 'lookup', label: 'Проверить' },
          { key: 'grant', label: 'Начислить' },
          { key: 'deduct', label: 'Списать' },
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => {
              setMode(item.key);
              setLookup(null);
            }}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-[12px] transition-colors',
              mode === item.key
                ? 'border-[hsl(255_100%_68%/0.5)] bg-[hsl(255_100%_68%/0.12)] text-foreground'
                : 'border-border-soft text-muted-foreground hover:text-foreground'
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-[11px] uppercase tracking-wider text-muted-2">
            Username
          </span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="@username"
            className="h-9 w-full rounded-lg border border-border bg-[hsl(232_26%_7%)] px-3 text-[13px] outline-none focus:border-[hsl(255_100%_68%/0.4)]"
          />
        </label>

        {mode !== 'lookup' && (
          <label className="block space-y-1.5">
            <span className="text-[11px] uppercase tracking-wider text-muted-2">
              Сумма, zł
            </span>
            <input
              value={amountZl}
              onChange={(e) => setAmountZl(e.target.value)}
              placeholder="25"
              inputMode="decimal"
              className="h-9 w-full rounded-lg border border-border bg-[hsl(232_26%_7%)] px-3 text-[13px] outline-none focus:border-[hsl(255_100%_68%/0.4)]"
            />
          </label>
        )}
      </div>

      <Button
        type="button"
        disabled={busy}
        onClick={runPrimary}
        className="bg-[hsl(255_100%_68%)] text-[hsl(232_30%_6%)] hover:bg-[hsl(255_100%_72%)]"
      >
        {busy ? 'Выполняется…' : primaryLabel}
      </Button>

      {lookup?.user && (
        <div className="rounded-xl border border-border-soft bg-[hsl(232_26%_6%)] p-4 text-[13px] space-y-1">
          <div className="font-medium text-foreground">
            {[lookup.user.firstName, lookup.user.lastName].filter(Boolean).join(' ') ||
              '—'}
          </div>
          <div className="text-muted-foreground">
            @{lookup.user.username || '—'} · ID {lookup.user.telegramId || '—'}
          </div>
          <div className="pt-2 text-[hsl(255_100%_72%)] font-semibold">
            Баланс: {formatMoney(lookup.cashbackBalance)}
          </div>
          {Array.isArray(lookup.activeLots) && lookup.activeLots.length > 0 && (
            <ul className="mt-2 space-y-1 text-[12px] text-muted-2">
              {lookup.activeLots.slice(0, 6).map((row, i) => (
                <li key={i}>
                  {formatMoney(row.remainingZl)} · сгорит{' '}
                  {formatExpireDate(row.expiresAt)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function CashbackMobileRow({ r }) {
  const isExpiring =
    r.status === 'expiring';

  return (
    <div className="rounded-xl border border-border-soft bg-[hsl(232_26%_6%)] p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-medium text-foreground">
            {r.name}
          </div>

          <div className="truncate text-[11px] text-muted-2">
            {r.handle}
          </div>
        </div>

        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 text-[12px]',

            isExpiring
              ? 'text-[hsl(36_90%_62%)]'
              : 'text-[hsl(142_70%_58%)]'
          )}
        >
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',

              isExpiring
                ? 'bg-[hsl(36_90%_58%)]'
                : 'bg-[hsl(142_64%_47%)]'
            )}
          />

          {isExpiring
            ? 'Скоро сгорит'
            : 'Активен'}
        </span>
      </div>

      <div className="mt-3 border-t border-border-soft pt-3">
        <MetricGrid
          cols={3}
          items={[
            {
              label: 'Баланс',

              value:
                formatMoney(
                  r.balance
                ),

              className:
                'text-[hsl(255_100%_72%)]',
            },

            {
              label: 'Выдано',

              value:
                formatMoney(
                  r.issued
                ),
            },

            {
              label:
                'Использовано',

              value:
                formatMoney(
                  r.used
                ),
            },
          ]}
        />

        <div className="mt-2 text-[11px] text-muted-2">
          Сгорит:{' '}

          <span
            className={
              isExpiring
                ? 'font-medium text-[hsl(36_90%_62%)]'
                : 'text-muted-foreground'
            }
          >
            {formatExpireDate(
              r.expiresAt
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function Cashback() {
  const queryClient = useQueryClient();

  const {
    period,
    range,
  } = usePeriod();

  const [
    filter,
    setFilter,
  ] = useState('all');

  const [
    query,
    setQuery,
  ] = useState('');

  const [
    page,
    setPage,
  ] = useState(1);

  const baseQueryString =
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
         * Стандартный период
         * важнее старого range.
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

  const requestQuery =
    useMemo(
      () => {
        if (
          !baseQueryString
        ) {
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
          'filter',
          filter
        );

        if (query.trim()) {
          params.set(
            'search',
            query.trim()
          );
        }

        return (
          params.toString()
        );
      },
      [
        baseQueryString,
        page,
        filter,
        query,
      ]
    );

  useEffect(() => {
    setPage(1);
  }, [
    baseQueryString,
    filter,
    query,
  ]);

  const {
    data,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: [
      'crm-cashback',
      requestQuery,
    ],

    enabled:
      Boolean(
        requestQuery
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
            `/crm/cashback?${requestQuery}`
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
              'CASHBACK_LOAD_FAILED'
          );
        }

        return result;
      },
  });

  const rows =
    Array.isArray(
      data?.rows
    )
      ? data.rows
      : [];

  const summaryData =
    data?.summary || {};

  const pagination =
    data?.pagination || {};

  const safePage =
    Number(
      pagination.page ||
        page
    );

  const pageCount =
    Number(
      pagination.pageCount ||
        1
    );

  const total =
    Number(
      pagination.total ||
        0
    );

  const activeFilterLabel =
    filters.find(
      (f) => f.key === filter
    )?.label || 'Все';

  const summary = [
    ...(filter !== 'all'
      ? [
          {
            label: 'Клиентов в выборке',
            value: String(
              summaryData.clients ??
                total
            ),
          },
        ]
      : []),
    {
      label:
        filter === 'all'
          ? 'Начислено'
          : `Начислено (${activeFilterLabel})`,

      value:
        formatMoney(
          summaryData.issued
        ),
    },

    {
      label:
        'Использовано',

      value:
        formatMoney(
          summaryData.used
        ),
    },

    {
      label:
        'Активный баланс',

      value:
        formatMoney(
          summaryData.balance
        ),
    },

    {
      label:
        'Использовано в %',

      value:
        `${Number(
          summaryData.utilisation ||
            0
        )}%`,
    },
  ];

  const distribution =
    useMemo(
      () => {
        const issued =
          Number(
            summaryData.issued ||
              0
          );

        const used =
          Number(
            summaryData.used ||
              0
          );

        const balance =
          Number(
            summaryData.balance ||
              0
          );

        const items = [
          {
            label:
              'Активный баланс',

            value:
              balance,
          },

          {
            label:
              'Использовано',

            value:
              used,
          },

          {
            label:
              'Начислено за период',

            value:
              issued,
          },
        ];

        const totalValue =
          items.reduce(
            (
              sum,
              item
            ) =>
              sum +
              item.value,
            0
          );

        return items.map(
          (item) => ({
            ...item,

            share:
              totalValue > 0
                ? Number(
                    (
                      (
                        item.value /
                        totalValue
                      ) *
                      100
                    ).toFixed(
                      1
                    )
                  )
                : 0,
          })
        );
      },
      [
        summaryData.issued,
        summaryData.used,
        summaryData.balance,
      ]
    );

  const columns = [
    {
      key: 'name',

      header:
        'Клиент',

      render:
        (r) => (
          <div>
            <div className="font-medium text-foreground">
              {r.name}
            </div>

            <div className="text-[11px] text-muted-2">
              {r.handle}
            </div>
          </div>
        ),
    },

    {
      key:
        'balance',

      header:
        'Баланс',

      align:
        'right',

      render:
        (r) => (
          <span className="font-medium text-[hsl(255_100%_72%)]">
            {formatMoney(
              r.balance
            )}
          </span>
        ),
    },

    {
      key:
        'issued',

      header:
        'Выдано всего',

      align:
        'right',

      render:
        (r) => (
          <span className="text-muted-foreground">
            {formatMoney(
              r.issued
            )}
          </span>
        ),
    },

    {
      key:
        'used',

      header:
        'Использовано',

      align:
        'right',

      render:
        (r) => (
          <span className="text-muted-foreground">
            {formatMoney(
              r.used
            )}
          </span>
        ),
    },

    {
      key:
        'expire',

      header:
        'Сгорит',

      align:
        'right',

      render:
        (r) => (
          <span
            className={
              r.status ===
              'expiring'
                ? 'font-medium text-[hsl(36_90%_62%)]'
                : 'text-muted-foreground'
            }
          >
            {formatExpireDate(
              r.expiresAt
            )}
          </span>
        ),
    },

    {
      key:
        'status',

      header:
        'Статус',

      align:
        'right',

      render:
        (r) => {
          const isExpiring =
            r.status ===
            'expiring';

          return (
            <span
              className={cn(
                'inline-flex items-center gap-1.5 text-[12px]',

                isExpiring
                  ? 'text-[hsl(36_90%_62%)]'
                  : 'text-[hsl(142_70%_58%)]'
              )}
            >
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',

                  isExpiring
                    ? 'bg-[hsl(36_90%_58%)]'
                    : 'bg-[hsl(142_64%_47%)]'
                )}
              />

              {isExpiring
                ? 'Скоро сгорит'
                : 'Активен'}
            </span>
          );
        },
    },
  ];

  const distributionMax =
    Math.max(
      1,

      ...distribution.map(
        (item) =>
          item.value
      )
    );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {summary.map(
          (s) => (
            <div
              key={
                s.label
              }
              className="rounded-2xl surface-card p-5"
            >
              <div className="text-[11px] uppercase tracking-wider text-muted-2">
                {s.label}
              </div>

              <div className="mt-2 font-heading text-[26px] font-semibold text-foreground">
                {s.value}
              </div>
            </div>
          )
        )}
      </div>

      <CashbackAdjustPanel
        onAdjusted={() => {
          queryClient.invalidateQueries({
            queryKey: ['crm-cashback'],
          });
        }}
      />

      <div className="rounded-2xl surface-card p-6">
        <h3 className="font-heading text-[15px] font-semibold text-foreground">
          Распределение кэшбэка
        </h3>

        <p className="mt-0.5 text-[12px] text-muted-foreground">
          Структура начислений и использования
        </p>

        <div className="mt-5 space-y-4">
          {distribution.map(
            (
              d,
              i
            ) => (
              <div
                key={
                  d.label
                }
              >
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-muted-foreground">
                    {d.label}
                  </span>

                  <span className="font-medium text-foreground">
                    {formatMoney(
                      d.value
                    )}{' '}
                    ·{' '}
                    {d.share}%
                  </span>
                </div>

                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-[hsl(234_22%_11%)]">
                  <div
                    className={cn(
                      'h-full rounded-full',

                      i === 0
                        ? 'bg-[hsl(255_100%_68%)]'
                        : 'bg-[hsl(234_18%_28%)]'
                    )}
                    style={{
                      width:
                        `${(
                          d.value /
                          distributionMax
                        ) * 100}%`,
                    }}
                  />
                </div>
              </div>
            )
          )}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="font-heading text-[15px] font-semibold text-foreground">
            Кэшбэк клиентов
          </h3>

          <div className="flex items-center gap-3">
            <div className="relative w-full sm:w-auto">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-2" />

              <input
                value={
                  query
                }
                onChange={
                  (e) => {
                    setQuery(
                      e.target.value
                    );

                    setPage(
                      1
                    );
                  }
                }
                placeholder="Имя или @telegram…"
                className="h-9 w-full rounded-lg border border-border bg-[hsl(232_26%_7%)] pl-9 pr-3 text-[13px] outline-none focus:border-[hsl(255_100%_68%/0.4)] sm:w-56"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg border border-border bg-[hsl(232_26%_7%)] p-0.5 no-scrollbar">
            {filters.map(
              (f) => (
                <button
                  key={
                    f.key
                  }
                  onClick={
                    () => {
                      setFilter(
                        f.key
                      );

                      setPage(
                        1
                      );
                    }
                  }
                  className={cn(
                    'shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-[12px] font-medium transition-all',

                    filter ===
                      f.key
                      ? 'bg-[hsl(255_100%_68%/0.14)] text-foreground shadow-[inset_0_0_0_1px_hsl(255_100%_68%/0.22)]'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {f.label}
                </button>
              )
            )}
          </div>

          <div className="text-[12px] text-muted-2">
            Найдено: {total}
          </div>
        </div>

        <div className="rounded-2xl surface-card p-2">
          <div className="hidden md:block">
            {isLoading && (
              <div className="px-4 py-10 text-center text-[13px] text-muted-foreground">
                Загружаем кэшбэк…
              </div>
            )}

            {!isLoading &&
              isError && (
                <div className="px-4 py-10 text-center text-[13px] text-red-400">
                  Не удалось загрузить кэшбэк:{' '}
                  {error?.message ||
                    'CASHBACK_LOAD_FAILED'}
                </div>
              )}

            {!isLoading &&
              !isError &&
              rows.length ===
                0 && (
                <div className="px-4 py-10 text-center text-[13px] text-muted-foreground">
                  Данных не найдено
                </div>
              )}

            {!isLoading &&
              !isError &&
              rows.length >
                0 && (
                <DataTable
                  columns={
                    columns
                  }
                  rows={
                    rows
                  }
                  dense
                />
              )}
          </div>

          <div className="space-y-2.5 p-1 md:hidden">
            {isLoading && (
              <div className="px-3 py-10 text-center text-[13px] text-muted-foreground">
                Загружаем кэшбэк…
              </div>
            )}

            {!isLoading &&
              isError && (
                <div className="px-3 py-10 text-center text-[13px] text-red-400">
                  Не удалось загрузить кэшбэк
                </div>
              )}

            {!isLoading &&
              !isError &&
              rows.length ===
                0 && (
                <div className="px-3 py-10 text-center text-[13px] text-muted-foreground">
                  Данных не найдено
                </div>
              )}

            {!isLoading &&
              !isError &&
              rows.map(
                (r) => (
                  <CashbackMobileRow
                    key={
                      r.id
                    }
                    r={
                      r
                    }
                  />
                )
              )}
          </div>

          <Pagination
            page={
              safePage
            }
            pageCount={
              pageCount
            }
            total={
              total
            }
            pageSize={
              PAGE_SIZE
            }
            onPageChange={
              setPage
            }
          />
        </div>
      </div>
    </div>
  );
}