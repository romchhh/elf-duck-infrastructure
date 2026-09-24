import React, {
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  useQuery,
} from '@tanstack/react-query';

import {
  Search,
} from 'lucide-react';

import DataTable from '@/components/shared/DataTable';
import Delta from '@/components/shared/Delta';
import Pagination from '@/components/shared/Pagination';
import PartnerMobileRow from '@/components/shared/PartnerMobileRow';

import {
  usePeriod,
} from '@/lib/PeriodContext';
import { crmFetch, CRM_API_URL } from '@/lib/crmFetch';

const PAGE_SIZE = 25;

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

function formatMoney(
  value
) {
  return (
    `${new Intl.NumberFormat(
      'ru-RU',
      {
        maximumFractionDigits: 2,
      }
    ).format(
      Number(value || 0)
    )} zł`
  );
}

function formatNumber(
  value
) {
  return (
    new Intl.NumberFormat(
      'ru-RU'
    ).format(
      Number(value || 0)
    )
  );
}

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

  return (
    `${year}-${month}-${day}`
  );
}

function PartnerIdentity({
  row,
}) {
  const username =
    String(
      row?.username ||
        ''
    ).trim();

  const name =
    row?.name ||
    row?.telegramId ||
    '—';

  return (
    <div className="flex items-center gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[hsl(234_22%_18%)] to-[hsl(234_22%_10%)] text-[11px] font-semibold text-foreground">
        {String(name)
          .slice(0, 2)
          .toUpperCase()}
      </div>

      <div className="min-w-0">
        <div className="truncate font-medium text-foreground">
          {name}
        </div>

        {username ? (
          <a
            href={`https://t.me/${encodeURIComponent(
              username
            )}`}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] text-muted-2 hover:text-foreground hover:underline underline-offset-2"
          >
            @{username}
          </a>
        ) : (
          <div className="text-[11px] text-muted-2">
            {row?.telegramId ||
              '—'}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Partners() {
  const {
    period,
    range,
  } = usePeriod();

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
          String(
            PAGE_SIZE
          )
        );

        const trimmed =
          query.trim();

        if (trimmed) {
          params.set(
            'search',
            trimmed
          );
        }

        return (
          params.toString()
        );
      },
      [
        baseQueryString,
        page,
        query,
      ]
    );

  useEffect(
    () => {
      setPage(1);
    },
    [
      baseQueryString,
      query,
    ]
  );

  const {
    data,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: [
      'crm-partners',
      requestQuery,
    ],

    enabled:
      Boolean(
        requestQuery
      ),

    queryFn:
      async () => {
        if (
          !CRM_API_URL
        ) {
          throw new Error(
            'VITE_CRM_API_URL is not configured'
          );
        }

        const response =
          await crmFetch(
            `/crm/partners?${requestQuery}`
          );

        const result =
          await response
            .json()
            .catch(
              () => ({})
            );

        if (
          !response.ok ||
          result?.ok ===
            false
        ) {
          throw new Error(
            result?.error ||
              'PARTNERS_LOAD_FAILED'
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

  const pagination =
    data?.pagination ||
    {};

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

  const columns = [
    {
      key:
        'name',

      header:
        'Партнёр',

      render:
        (row) => (
          <PartnerIdentity
            row={
              row
            }
          />
        ),
    },

    {
      key:
        'invited',

      header:
        'Приглашено',

      align:
        'right',

      render:
        (row) => (
          <span className="text-muted-foreground">
            {formatNumber(
              row.invited
            )}
          </span>
        ),
    },

    {
      key:
        'bought',

      header:
        'Купили',

      align:
        'right',

      render:
        (row) => (
          <span className="text-muted-foreground">
            {formatNumber(
              row.bought
            )}
          </span>
        ),
    },

    {
      key:
        'conversion',

      header:
        'Конверсия',

      align:
        'right',

      render:
        (row) => (
          <span className="font-medium text-[hsl(255_100%_72%)]">
            {Number(
              row.conversion ||
                0
            )}
            %
          </span>
        ),
    },

    {
      key:
        'revenue',

      header:
        'Выручка',

      align:
        'right',

      render:
        (row) => (
          <span className="font-medium text-foreground">
            {formatMoney(
              row.revenue
            )}
          </span>
        ),
    },

    {
      key:
        'avgCheck',

      header:
        'Средний чек',

      align:
        'right',

      render:
        (row) => (
          <span className="text-muted-foreground">
            {formatMoney(
              row.avgCheck
            )}
          </span>
        ),
    },

    // {
    //   key:
    //     'ltv',

    //   header:
    //     'LTV клиентов',

    //   align:
    //     'right',

    //   render:
    //     (row) => (
    //       <span className="text-muted-foreground">
    //         {formatMoney(
    //           row.ltv
    //         )}
    //       </span>
    //     ),
    // },

    {
      key:
        'trend',

      header:
        'Тренд',

      align:
        'right',

      render:
        (row) =>
          row.trend === null ||
          row.trend ===
            undefined ? (
            <span className="text-muted-2">
              —
            </span>
          ) : (
            <Delta
              value={
                row.trend
              }
              suffix="%"
            />
          ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-[12px] text-muted-2">
          Найдено:{' '}
          {formatNumber(
            total
          )}
        </div>

        <div className="relative w-full sm:w-auto">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-2" />

          <input
            value={
              query
            }

            onChange={
              (event) =>
                setQuery(
                  event
                    .target
                    .value
                )
            }

            placeholder="Поиск партнёра…"

            className="h-9 w-full rounded-lg border border-border bg-[hsl(232_26%_7%)] pl-9 pr-3 text-[13px] outline-none focus:border-[hsl(255_100%_68%/0.4)] sm:w-64"
          />
        </div>
      </div>

      <div className="rounded-2xl surface-card p-2">
        <div className="hidden md:block">
          {isLoading && (
            <div className="px-4 py-10 text-center text-[13px] text-muted-foreground">
              Загружаем партнёров…
            </div>
          )}

          {!isLoading &&
            isError && (
              <div className="px-4 py-10 text-center text-[13px] text-red-400">
                Не удалось загрузить партнёров:
                {' '}
                {error?.message ||
                  'PARTNERS_LOAD_FAILED'}
              </div>
            )}

          {!isLoading &&
            !isError &&
            rows.length ===
              0 && (
              <div className="px-4 py-10 text-center text-[13px] text-muted-foreground">
                За выбранный период партнёров нет
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
              Загружаем партнёров…
            </div>
          )}

          {!isLoading &&
            isError && (
              <div className="px-3 py-10 text-center text-[13px] text-red-400">
                Не удалось загрузить партнёров
              </div>
            )}

          {!isLoading &&
            !isError &&
            rows.length ===
              0 && (
              <div className="px-3 py-10 text-center text-[13px] text-muted-foreground">
                За выбранный период партнёров нет
              </div>
            )}

          {!isLoading &&
            !isError &&
            rows.map(
              (row) => (
                <PartnerMobileRow

                  key={

                    row.id

                  }

                  p={

                    row

                  }

                  showName

                  showTrend

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
  );
}