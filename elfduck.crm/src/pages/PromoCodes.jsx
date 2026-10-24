import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';

import DataTable from '@/components/shared/DataTable';
import MetricGrid from '@/components/shared/MetricGrid';
import { usePeriod } from '@/lib/PeriodContext';
import { crmFetchJson } from '@/lib/crmFetch';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

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

function formatMoney(value) {
  return `${new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 2,
  }).format(Number(value || 0))} zł`;
}

function formatDateOnly(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

function statusLabel(row) {
  if (row?.isActive === false) return 'Выкл';
  if (row?.expiresAt) {
    const expires = new Date(row.expiresAt);
    if (Number.isFinite(expires.getTime()) && expires.getTime() <= Date.now()) {
      return 'Истёк';
    }
  }
  return 'Активен';
}

function statusClass(row) {
  const label = statusLabel(row);
  if (label === 'Активен') return 'text-[hsl(152_60%_55%)]';
  if (label === 'Истёк') return 'text-[hsl(35_90%_58%)]';
  return 'text-muted-2';
}

function CreatePromoForm({ onCreated }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [amountZl, setAmountZl] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [noExpiry, setNoExpiry] = useState(true);
  const [maxActivations, setMaxActivations] = useState('');
  const [maxActivationsPerUser, setMaxActivationsPerUser] = useState('1');
  const [note, setNote] = useState('');

  const createMutation = useMutation({
    mutationFn: async () => {
      const normalizedCode = String(code || '')
        .trim()
        .toUpperCase();
      const amount = Number(amountZl);
      const globalLimit = Number(maxActivations || 0);
      const perUserLimit = Number(
        maxActivationsPerUser === '' ? 1 : maxActivationsPerUser
      );

      if (!normalizedCode || normalizedCode.length < 3) {
        throw new Error('Укажите код промокода');
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error('Укажите сумму промокода (zł)');
      }
      if (!Number.isFinite(perUserLimit) || perUserLimit < 0) {
        throw new Error('Лимит на клиента должен быть числом (0 = без лимита)');
      }

      let expiresAtIso = null;
      if (!noExpiry) {
        if (!expiresAt) {
          throw new Error('Укажите срок действия или включите «Бессрочный»');
        }
        const parsed = new Date(expiresAt);
        if (
          !Number.isFinite(parsed.getTime()) ||
          parsed.getTime() <= Date.now()
        ) {
          throw new Error('Срок действия должен быть в будущем');
        }
        expiresAtIso = parsed.toISOString();
      }

      return crmFetchJson('/crm/promo-codes', {
        method: 'POST',
        body: JSON.stringify({
          code: normalizedCode,
          amountZl: amount,
          expiresAt: expiresAtIso,
          maxActivations:
            Number.isFinite(globalLimit) && globalLimit > 0 ? globalLimit : 0,
          maxActivationsPerUser: Number.isFinite(perUserLimit)
            ? perUserLimit
            : 1,
          note: String(note || '').trim(),
        }),
      });
    },
    onSuccess: (result) => {
      const createdCode = String(result?.promoCode?.code || code).toUpperCase();
      toast({ title: `Промокод ${createdCode} создан` });
      setOpen(false);
      setCode('');
      setAmountZl('');
      setExpiresAt('');
      setNoExpiry(true);
      setMaxActivations('');
      setMaxActivationsPerUser('1');
      setNote('');
      onCreated?.();
    },
    onError: (error) => {
      toast({
        title: 'Не удалось создать промокод',
        description: error?.message || 'PROMO_CODE_CREATE_FAILED',
        variant: 'destructive',
      });
    },
  });

  return (
    <div className="rounded-2xl border border-border-soft bg-[hsl(232_26%_6%)]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="text-[13px] font-medium text-foreground">
          Создать промокод
        </span>
        <span className="text-[11px] text-[hsl(255_100%_72%)]">
          {open ? 'Свернуть' : 'Открыть'}
        </span>
      </button>

      {open ? (
        <div className="space-y-2 border-t border-border-soft px-4 pb-4 pt-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Код (например WELCOME15)"
              className="input-base"
            />
            <input
              value={amountZl}
              onChange={(e) => setAmountZl(e.target.value)}
              placeholder="Сумма, zł"
              type="number"
              min="1"
              step="1"
              className="input-base"
            />
          </div>

          <div className="space-y-1.5 rounded-lg border border-border-soft p-2.5">
            <label className="flex items-center gap-2 text-[12px] text-foreground">
              <input
                type="checkbox"
                checked={noExpiry}
                onChange={(e) => {
                  setNoExpiry(e.target.checked);
                  if (e.target.checked) setExpiresAt('');
                }}
                className="rounded border-border"
              />
              Бессрочный
            </label>
            {!noExpiry ? (
              <input
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                type="datetime-local"
                style={{ colorScheme: 'dark' }}
                className="input-base"
              />
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              value={maxActivations}
              onChange={(e) => setMaxActivations(e.target.value)}
              placeholder="Общий лимит (0 = ∞)"
              type="number"
              min="0"
              className="input-base"
            />
            <input
              value={maxActivationsPerUser}
              onChange={(e) => setMaxActivationsPerUser(e.target.value)}
              placeholder="Лимит на клиента"
              type="number"
              min="0"
              className="input-base"
            />
          </div>

          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Заметка"
            className="input-base"
          />

          <button
            type="button"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-border px-3 text-[12px] font-medium text-foreground transition-colors hover:border-[hsl(255_100%_68%/0.35)] disabled:opacity-50"
          >
            {createMutation.isPending ? 'Создаём…' : 'Сохранить промокод'}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default function PromoCodes() {
  const { period, range } = usePeriod();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const periodQuery = useMemo(() => {
    const periodKey =
      periodMap[period] ||
      (validPeriodKeys.has(period) ? period : null);

    if (periodKey) {
      return `period=${encodeURIComponent(periodKey)}`;
    }

    if (range?.start && range?.end) {
      return (
        `from=${formatDateOnly(range.start)}` +
        `&to=${formatDateOnly(range.end)}`
      );
    }

    return 'period=all';
  }, [period, range?.start, range?.end]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['crm-promo-codes', periodQuery],
    queryFn: () => crmFetchJson(`/crm/promo-codes?${periodQuery}`),
    staleTime: 30_000,
  });

  const rows = Array.isArray(data?.promoCodes) ? data.promoCodes : [];
  const summary = data?.summary || {};

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    return rows.filter((row) => {
      const status = statusLabel(row);
      if (statusFilter === 'active' && status !== 'Активен') return false;
      if (statusFilter === 'off' && status !== 'Выкл') return false;
      if (statusFilter === 'expired' && status !== 'Истёк') return false;
      if (!q) return true;
      const hay = `${row.code || ''} ${row.note || ''}`.toUpperCase();
      return hay.includes(q);
    });
  }, [rows, query, statusFilter]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['crm-promo-codes'] });
  };

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }) =>
      crmFetchJson(`/crm/promo-codes/${encodeURIComponent(id)}/toggle`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive }),
      }),
    onSuccess: (_data, vars) => {
      toast({
        title: vars.isActive ? 'Промокод включён' : 'Промокод выключен',
      });
      invalidate();
    },
    onError: (error) => {
      toast({
        title: 'Не удалось изменить статус',
        description: error?.message || 'TOGGLE_FAILED',
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) =>
      crmFetchJson(`/crm/promo-codes/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      toast({ title: 'Промокод удалён' });
      invalidate();
    },
    onError: (error) => {
      toast({
        title: 'Не удалось удалить',
        description: error?.message || 'DELETE_FAILED',
        variant: 'destructive',
      });
    },
  });

  const columns = [
    {
      key: 'code',
      header: 'Код',
      render: (row) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-foreground">{row.code}</div>
          {row.note ? (
            <div className="truncate text-[11px] text-muted-2">{row.note}</div>
          ) : null}
        </div>
      ),
    },
    {
      key: 'amountZl',
      header: 'Сумма',
      align: 'right',
      render: (row) => formatMoney(row.amountZl),
    },
    {
      key: 'status',
      header: 'Статус',
      render: (row) => (
        <span className={cn('text-[12px]', statusClass(row))}>
          {statusLabel(row)}
        </span>
      ),
    },
    {
      key: 'periodActivations',
      header: 'Активации',
      align: 'right',
      render: (row) => (
        <span title={`Всего: ${formatNumber(row.activationsCount)}`}>
          {formatNumber(row.periodActivations)}
          <span className="text-muted-2">
            {' '}
            / {formatNumber(row.activationsCount)}
          </span>
        </span>
      ),
    },
    {
      key: 'orders',
      header: 'Заказы',
      align: 'right',
      render: (row) => formatNumber(row.orders),
    },
    {
      key: 'buyers',
      header: 'Клиенты',
      align: 'right',
      render: (row) => formatNumber(row.buyers),
    },
    {
      key: 'conversion',
      header: 'Конв.',
      align: 'right',
      render: (row) => `${Number(row.conversion || 0).toFixed(1)}%`,
    },
    {
      key: 'revenue',
      header: 'Выручка',
      align: 'right',
      render: (row) => formatMoney(row.revenue),
    },
    {
      key: 'discountZl',
      header: 'Скидки',
      align: 'right',
      render: (row) => formatMoney(row.discountZl),
    },
    {
      key: 'expiresAt',
      header: 'До',
      render: (row) =>
        row.expiresAt ? formatDateTime(row.expiresAt) : 'бессрочно',
    },
    {
      key: 'actions',
      header: '',
      sortable: false,
      render: (row) => (
        <div className="flex items-center justify-end gap-1.5">
          <button
            type="button"
            disabled={toggleMutation.isPending}
            onClick={() =>
              toggleMutation.mutate({
                id: row.id,
                isActive: row.isActive === false,
              })
            }
            className="rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            {row.isActive === false ? 'Вкл' : 'Выкл'}
          </button>
          <button
            type="button"
            disabled={deleteMutation.isPending}
            onClick={() => {
              if (
                !window.confirm(
                  `Удалить промокод «${row.code}»? Это действие нельзя отменить.`
                )
              ) {
                return;
              }
              deleteMutation.mutate(row.id);
            }}
            className="rounded-md px-2 py-1 text-[11px] text-muted-2 transition-colors hover:bg-[hsl(0_72%_58%/0.12)] hover:text-[hsl(0_80%_68%)]"
          >
            Удалить
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-2xl surface-card p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-heading text-[15px] font-semibold text-foreground">
              Статистика промокодов
            </h2>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              Активации и заказы с промо за выбранный период. Конверсия = заказы
              / активации.
            </p>
          </div>
          {isFetching && !isLoading ? (
            <span className="text-[11px] text-muted-2">Обновление…</span>
          ) : null}
        </div>

        <MetricGrid
          cols={4}
          items={[
            {
              label: 'Промокодов',
              value: `${formatNumber(summary.active || 0)} / ${formatNumber(summary.total || 0)}`,
            },
            {
              label: 'Активации',
              value: formatNumber(summary.activations || 0),
            },
            {
              label: 'Заказы с промо',
              value: formatNumber(summary.orders || 0),
            },
            {
              label: 'Конверсия',
              value: `${Number(summary.conversion || 0).toFixed(1)}%`,
            },
            {
              label: 'Выручка',
              value: formatMoney(summary.revenue || 0),
            },
            {
              label: 'Скидки выдано',
              value: formatMoney(summary.discountZl || 0),
            },
            {
              label: 'Клиенты',
              value: formatNumber(summary.buyers || 0),
            },
            {
              label: 'Активации (всё время)',
              value: formatNumber(summary.activationsAllTime || 0),
            },
          ]}
        />
      </div>

      <CreatePromoForm onCreated={invalidate} />

      <div className="rounded-2xl surface-card p-4 sm:p-5">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 z-[1] h-3.5 w-3.5 -translate-y-1/2 text-muted-2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по коду…"
              className="input-base h-9"
              style={{ paddingLeft: '2.25rem' }}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[
              { key: 'all', label: 'Все' },
              { key: 'active', label: 'Активные' },
              { key: 'off', label: 'Выкл' },
              { key: 'expired', label: 'Истёкшие' },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setStatusFilter(item.key)}
                className={cn(
                  'rounded-lg border px-2.5 py-1 text-[11px] transition-colors',
                  statusFilter === item.key
                    ? 'border-[hsl(255_100%_68%/0.45)] bg-[hsl(255_100%_68%/0.12)] text-foreground'
                    : 'border-border-soft text-muted-foreground hover:text-foreground'
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="px-4 py-10 text-center text-[13px] text-muted-foreground">
            Загружаем промокоды…
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-10 text-center text-[13px] text-muted-foreground">
            Промокодов пока нет
          </div>
        ) : (
          <DataTable columns={columns} rows={filtered} dense />
        )}
      </div>
    </div>
  );
}
