import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';

import PageHeader from '@/components/shared/PageHeader';
import MetricGrid from '@/components/shared/MetricGrid';
import Pagination from '@/components/shared/Pagination';
import { usePeriod } from '@/lib/PeriodContext';
import { crmFetchJson } from '@/lib/crmFetch';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 40;

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

const validPeriodKeys = new Set([
  'today',
  'week',
  'month',
  '3m',
  '6m',
  'all',
]);

function formatNumber(value) {
  return new Intl.NumberFormat('ru-RU').format(Number(value || 0));
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateOnly(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function ClientCell({ row }) {
  const name = [row?.firstName, row?.lastName].filter(Boolean).join(' ').trim();
  const username = String(row?.username || '').trim();
  const title = name || (username ? `@${username}` : row?.telegramId || '—');

  return (
    <div className="min-w-0">
      <div className="truncate font-medium text-foreground">{title}</div>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-2">
        {username ? (
          <a
            href={`https://t.me/${encodeURIComponent(username)}`}
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground hover:underline underline-offset-2"
          >
            @{username}
          </a>
        ) : null}
        <span>ID {row?.telegramId || '—'}</span>
      </div>
    </div>
  );
}

export default function Reviews() {
  const { period, range } = usePeriod();
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState('');

  const baseQueryString = useMemo(() => {
    const periodKey =
      periodMap[period] || (validPeriodKeys.has(period) ? period : null);

    if (periodKey) {
      return `period=${encodeURIComponent(periodKey)}`;
    }

    if (range?.start && range?.end) {
      return `from=${encodeURIComponent(formatDateOnly(range.start))}&to=${encodeURIComponent(formatDateOnly(range.end))}`;
    }

    return 'period=month';
  }, [period, range]);

  useEffect(() => {
    setPage(1);
  }, [baseQueryString, query]);

  const { data, isLoading, isFetching, isError } = useQuery({
    queryKey: ['crm-reviews', baseQueryString, query, page],
    queryFn: () => {
      const params = new URLSearchParams(baseQueryString);
      params.set('page', String(page));
      params.set('limit', String(PAGE_SIZE));
      if (query.trim()) params.set('search', query.trim());
      return crmFetchJson(`/crm/reviews?${params.toString()}`);
    },
    keepPreviousData: true,
  });

  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const stats = data?.stats || { total: 0, withOrder: 0, withImages: 0 };
  const pagination = data?.pagination || {
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    pageCount: 1,
  };

  const metrics = [
    { label: 'Отзывов', value: formatNumber(stats.total) },
    { label: 'С заказом', value: formatNumber(stats.withOrder) },
    { label: 'Со скринами', value: formatNumber(stats.withImages) },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Отзывы"
        subtitle="Все жалобы и отзывы, которые клиенты оставили из мини-аппа"
      />

      <MetricGrid items={metrics} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-2" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск: текст, @username, заказ, точка…"
            className="input-base h-9 w-full pl-9"
          />
        </div>
        <div className="text-[12px] text-muted-2">
          {isFetching ? 'Обновление…' : `${formatNumber(pagination.total)} записей`}
        </div>
      </div>

      {isError ? (
        <div className="rounded-xl border border-border bg-surface-card px-4 py-8 text-center text-[13px] text-muted-2">
          Не удалось загрузить отзывы
        </div>
      ) : isLoading && !rows.length ? (
        <div className="rounded-xl border border-border bg-surface-card px-4 py-8 text-center text-[13px] text-muted-2">
          Загрузка…
        </div>
      ) : !rows.length ? (
        <div className="rounded-xl border border-border bg-surface-card px-4 py-8 text-center text-[13px] text-muted-2">
          Пока нет отзывов за выбранный период
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const open = expandedId === row.id;
            const text = String(row.text || '');
            const short =
              text.length > 180 && !open ? `${text.slice(0, 180).trim()}…` : text;
            const images = Array.isArray(row.imageUrls) ? row.imageUrls : [];

            return (
              <article
                key={row.id}
                className="rounded-xl border border-border bg-surface-card p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <ClientCell row={row} />
                  <div className="shrink-0 text-[12px] text-muted-2 sm:text-right">
                    {formatDateTime(row.createdAt)}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-muted-2">
                  {row.orderNo ? (
                    <span>
                      Заказ{' '}
                      <span className="text-foreground">#{row.orderNo}</span>
                    </span>
                  ) : (
                    <span>Без заказа</span>
                  )}
                  {row.deliveryLabel ? <span>{row.deliveryLabel}</span> : null}
                  {row.pointTitle ? <span>{row.pointTitle}</span> : null}
                  {row.source ? <span>Источник: {row.source}</span> : null}
                </div>

                <p
                  className={cn(
                    'mt-3 whitespace-pre-wrap text-[13px] leading-relaxed text-foreground',
                    !open && text.length > 180 && 'line-clamp-4'
                  )}
                >
                  {short}
                </p>

                {text.length > 180 ? (
                  <button
                    type="button"
                    onClick={() => setExpandedId(open ? '' : row.id)}
                    className="mt-2 text-[12px] font-medium text-[hsl(255_100%_72%)] hover:underline underline-offset-2"
                  >
                    {open ? 'Свернуть' : 'Показать полностью'}
                  </button>
                ) : null}

                {images.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {images.map((src) => (
                      <a
                        key={src}
                        href={src}
                        target="_blank"
                        rel="noreferrer"
                        className="block overflow-hidden rounded-lg border border-border-soft"
                      >
                        <img
                          src={src}
                          alt=""
                          className="h-20 w-20 object-cover"
                          loading="lazy"
                        />
                      </a>
                    ))}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      <Pagination
        page={pagination.page}
        pageCount={pagination.pageCount}
        total={pagination.total}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
      />
    </div>
  );
}
