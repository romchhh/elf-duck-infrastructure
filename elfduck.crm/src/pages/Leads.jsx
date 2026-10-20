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

import Pagination from '@/components/shared/Pagination';
import MetricGrid from '@/components/shared/MetricGrid';

import {
  usePeriod,
} from '@/lib/PeriodContext';

import {
  cn,
} from '@/lib/utils';
import { crmFetch, CRM_API_URL } from '@/lib/crmFetch';
import { SortableHeader, useTableSort } from '@/lib/tableSort';

const PAGE_SIZE = 50;

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

function formatCreatedDate(
  value
) {
  if (!value) {
    return '—';
  }

  return (
    new Intl.DateTimeFormat(
      'ru-RU',
      {
        timeZone:
          'Europe/Warsaw',

        day:
          'numeric',

        month:
          'short',
      }
    ).format(
      new Date(value)
    )
  );
}

function LeadIdentity({
  lead,
}) {
  const username =
    String(
      lead?.username ||
        ''
    ).trim();

  const name =
    lead?.name ||
    lead?.telegramId ||
    '—';

  return (
    <div>
      <div className="font-medium text-foreground">
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
          {lead?.telegramId ||
            '—'}
        </div>
      )}
    </div>
  );
}

export default function Leads() {
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

  const { sortKey, sortDirection, toggleSort, appendSortParams } =
    useTableSort('createdAt', 'desc');

  /*
   * Стандартный период
   * всегда имеет приоритет
   * над старым custom range.
   */
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

        const trimmedQuery =
          query.trim();

        if (
          trimmedQuery
        ) {
          params.set(
            'search',
            trimmedQuery
          );
        }

        appendSortParams(params);

        return (
          params.toString()
        );
      },
      [
        baseQueryString,
        page,
        query,
        appendSortParams,
      ]
    );

  useEffect(
    () => {
      setPage(1);
    },
    [
      baseQueryString,
      query,
      sortKey,
      sortDirection,
    ]
  );

  const {
    data,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: [
      'crm-leads',
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
            `/crm/leads?${requestQuery}`
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
              'LEADS_LOAD_FAILED'
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

  const summary =
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

  const leadCount =
    Number(
      summary.leads ??
        pagination.total ??
        0
    );

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="font-heading text-[15px] font-semibold text-foreground">
            Лиды
          </h3>

          <span className="text-[12px] text-muted-2">
            Лидов:{' '}
            {formatNumber(
              leadCount
            )}
          </span>
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

            placeholder="Поиск лида…"

            className="h-9 w-full rounded-lg border border-border bg-[hsl(232_26%_7%)] pl-9 pr-3 text-[13px] outline-none focus:border-[hsl(255_100%_68%/0.4)] sm:w-64"
          />
        </div>
      </div>

      <div className="rounded-2xl surface-card p-2">
        {/* Desktop */}
        <div className="hidden overflow-x-auto scrollbar-thin md:block">
          {isLoading && (
            <div className="px-4 py-10 text-center text-[13px] text-muted-foreground">
              Загружаем лиды…
            </div>
          )}

          {!isLoading &&
            isError && (
              <div className="px-4 py-10 text-center text-[13px] text-red-400">
                Не удалось загрузить лиды:
                {' '}
                {error?.message ||
                  'LEADS_LOAD_FAILED'}
              </div>
            )}

          {!isLoading &&
            !isError &&
            rows.length ===
              0 && (
              <div className="px-4 py-10 text-center text-[13px] text-muted-foreground">
                Лиды не найдены
              </div>
            )}

          {!isLoading &&
            !isError &&
            rows.length >
              0 && (
              <table className="w-full min-w-[640px] table-fixed border-collapse text-[13px]">
                <colgroup>
                  <col className="w-[25%]" />
                  <col className="w-[25%]" />
                  <col className="w-[25%]" />
                  <col className="w-[25%]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-border">
                    {[
                      { key: 'name', label: 'Лид', align: 'left' },
                      { key: 'createdAt', label: 'Создан', align: 'left' },
                      { key: 'inLeads', label: 'В лидах', align: 'right' },
                      { key: 'completedTotal', label: 'Сумма', align: 'right' },
                    ].map((column) => (
                      <th
                        key={column.key}
                        className={cn(
                          'px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-2',
                          column.align === 'right' && 'text-right'
                        )}
                      >
                        <SortableHeader
                          label={column.label}
                          active={sortKey === column.key}
                          direction={sortDirection}
                          onClick={() => toggleSort(column.key)}
                        />
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {rows.map(
                    (lead) => (
                        <tr
                          key={
                            lead.id
                          }

                          className="border-b border-border-soft hover:bg-[hsl(234_22%_11%/0.6)]"
                        >
                          <td className="px-4 py-3">
                            <LeadIdentity
                              lead={
                                lead
                              }
                            />
                          </td>

                          <td className="px-4 py-3 text-muted-foreground">
                            {formatCreatedDate(
                              lead.createdAt
                            )}
                          </td>

                          <td className="px-4 py-3 text-right text-muted-foreground">
                            {Number(
                              lead.inLeads ||
                                0
                            )}{' '}
                            дн.
                          </td>

                          <td className="px-4 py-3 text-right font-medium text-foreground">
                            {formatMoney(
                              lead.completedTotal
                            )}
                          </td>
                        </tr>
                    )
                  )}
                </tbody>
              </table>
            )}
        </div>

        {/* Mobile */}
        <div className="space-y-2.5 p-1 md:hidden">
          {isLoading && (
            <div className="px-3 py-10 text-center text-[13px] text-muted-foreground">
              Загружаем лиды…
            </div>
          )}

          {!isLoading &&
            isError && (
              <div className="px-3 py-10 text-center text-[13px] text-red-400">
                Не удалось загрузить лиды
              </div>
            )}

          {!isLoading &&
            !isError &&
            rows.length ===
              0 && (
              <div className="px-3 py-10 text-center text-[13px] text-muted-foreground">
                Лиды не найдены
              </div>
            )}

          {!isLoading &&
            !isError &&
            rows.map(
              (lead) => (
                <LeadMobileRow
                  key={
                    lead.id
                  }
                  lead={
                    lead
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

function LeadMobileRow({
  lead,
}) {
  return (
    <div className="rounded-xl border border-border-soft bg-[hsl(232_26%_6%)] p-3.5">
      <div className="min-w-0">
        <LeadIdentity
          lead={
            lead
          }
        />
      </div>

      <div className="mt-3 border-t border-border-soft pt-3">
        <MetricGrid
          cols={
            3
          }

          items={[
            {
              label:
                'Создан',

              value:
                formatCreatedDate(
                  lead.createdAt
                ),
            },

            {
              label:
                'В лидах',

              value:
                `${Number(
                  lead.inLeads ||
                    0
                )} дн.`,
            },

            {
              label:
                'Сумма',

              value:
                formatMoney(
                  lead.completedTotal
                ),

              className:
                'text-foreground',
            },
          ]}
        />
      </div>
    </div>
  );
}