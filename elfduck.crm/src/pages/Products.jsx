import React, {
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  useQuery,
} from '@tanstack/react-query';

import DataTable from '@/components/shared/DataTable';
import Sparkline from '@/components/shared/Sparkline';
import Delta from '@/components/shared/Delta';
import Pagination from '@/components/shared/Pagination';
import KpiCard from '@/components/shared/KpiCard';
import ProductMobileRow from '@/components/shared/ProductMobileRow';

import {
  usePeriod,
} from '@/lib/PeriodContext';
import { crmFetch, CRM_API_URL } from '@/lib/crmFetch';

const PAGE_SIZE = 10;

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

export default function Products() {
  const {
    period,
    range,
  } = usePeriod();

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

        return (
          params.toString()
        );
      },
      [
        baseQueryString,
        page,
      ]
    );

  useEffect(
    () => {
      setPage(1);
    },
    [
      baseQueryString,
    ]
  );

  const {
    data,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: [
      'crm-products',
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
            `/crm/products?${requestQuery}`
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
              'PRODUCTS_LOAD_FAILED'
          );
        }

        return result;
      },
  });

  const rawRows =
    Array.isArray(
      data?.rows
    )
      ? data.rows
      : [];

  const pageRows =
    rawRows.map(
      (row) => ({
        ...row,

        repeat:
          Number(
            row?.repeatPercent ||
              0
          ),
      })
    );

  const summaryData =
    data?.summary ||
    {};

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

  const summary = [
    {
      label:
        'выручка',

      value:
        formatMoney(
          summaryData.revenue
        ),
    },

    {
      label:
        'продано',

      value:
        formatNumber(
          summaryData.sold
        ),
    },

    {
      label:
        'бестселлеры',

      value:
        formatNumber(
          summaryData.bestsellers
        ),
    },

    {
      label:
        'медленные',

      value:
        formatNumber(
          summaryData.slow
        ),
    },

    {
      label:
        'заканчиваются',

      value:
        formatNumber(
          summaryData.ending
        ),
    },

    {
      label:
        'стоимость остатков',

      value:
        formatMoney(
          summaryData.stockValue
        ),
    },
  ];

  const columns = [
    {
      key:
        'name',

      header:
        'Товар',

      render:
        (row) => (
          <span className="font-medium text-foreground">
            {row.name}
          </span>
        ),
    },

    {
      key:
        'category',

      header:
        'Категория',

      render:
        (row) => (
          <span className="text-muted-foreground">
            {row.category}
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
        'sold',

      header:
        'Продано',

      align:
        'right',

      render:
        (row) => (
          <span className="text-muted-foreground">
            {formatNumber(
              row.sold
            )}
          </span>
        ),
    },

    {
      key:
        'trend',

      header:
        'Динамика',

      render:
        (row) => (
          <div className="flex items-center gap-2">
            <div className="w-16">
              <Sparkline
                data={
                  Array.isArray(
                    row.spark
                  )
                    ? row.spark
                    : []
                }
                color="hsl(255 100% 68%)"
                height={22}
              />
            </div>

            {row.trend === null ||
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
            )}
          </div>
        ),
    },

    {
      key:
        'repeat',

      header:
        'Повторные',

      align:
        'right',

      render:
        (row) => (
          <span className="text-muted-foreground">
            {Number(
              row.repeat ||
                0
            )}
            %
          </span>
        ),
    },

    {
      key:
        'stock',

      header:
        'Остаток',

      align:
        'right',

      render:
        (row) => (
          <span
            className={
              row.days !== null &&
              row.days !==
                undefined &&
              Number(
                row.days
              ) <= 2
                ? 'text-[hsl(36_90%_62%)]'
                : 'text-muted-foreground'
            }
          >
            {formatNumber(
              row.stock
            )}{' '}
            шт.
          </span>
        ),
    },

    {
      key:
        'days',

      header:
        'Дн. запаса',

      align:
        'right',

      render:
        (row) => (
          <span
            className={
              row.days !== null &&
              row.days !==
                undefined &&
              Number(
                row.days
              ) <= 2
                ? 'font-medium text-[hsl(36_90%_62%)]'
                : 'text-muted-foreground'
            }
          >
            {row.days === null ||
            row.days ===
              undefined
              ? '—'
              : Math.round(
                  Number(
                    row.days
                  )
                )}
          </span>
        ),
    },

    {
      key:
        'stockValue',

      header:
        'Стоимость остатка',

      align:
        'right',

      render:
        (row) => (
          <span className="whitespace-nowrap text-muted-foreground">
            {formatMoney(
              row.stockValue
            )}
          </span>
        ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {summary.map(
          (item) => (
            <KpiCard
              key={
                item.label
              }
              label={
                item.label
              }
              value={
                item.value
              }
            />
          )
        )}
      </div>

      <div className="rounded-2xl surface-card p-2">
        <div className="hidden md:block">
          {isLoading && (
            <div className="px-4 py-10 text-center text-[13px] text-muted-foreground">
              Загружаем товары…
            </div>
          )}

          {!isLoading &&
            isError && (
              <div className="px-4 py-10 text-center text-[13px] text-red-400">
                Не удалось загрузить товары:
                {' '}
                {error?.message ||
                  'PRODUCTS_LOAD_FAILED'}
              </div>
            )}

          {!isLoading &&
            !isError &&
            pageRows.length ===
              0 && (
              <div className="px-4 py-10 text-center text-[13px] text-muted-foreground">
                За выбранный период данных по товарам нет
              </div>
            )}

          {!isLoading &&
            !isError &&
            pageRows.length >
              0 && (
              <DataTable
                columns={
                  columns
                }
                rows={
                  pageRows
                }
                dense
              />
            )}
        </div>

        <div className="space-y-2.5 p-1 md:hidden">
          {isLoading && (
            <div className="px-3 py-10 text-center text-[13px] text-muted-foreground">
              Загружаем товары…
            </div>
          )}

          {!isLoading &&
            isError && (
              <div className="px-3 py-10 text-center text-[13px] text-red-400">
                Не удалось загрузить товары
              </div>
            )}

          {!isLoading &&
            !isError &&
            pageRows.length ===
              0 && (
              <div className="px-3 py-10 text-center text-[13px] text-muted-foreground">
                За выбранный период данных по товарам нет
              </div>
            )}

          {!isLoading &&
            !isError &&
            pageRows.map(
              (product) => (
                <ProductMobileRow
                  key={
                    product.id
                  }
                  p={
                    product
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
  );
}