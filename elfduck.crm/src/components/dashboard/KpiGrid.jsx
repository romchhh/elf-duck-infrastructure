import React from 'react';
import KpiCard from '@/components/shared/KpiCard';

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

function money(value) {
  return `${moneyFormatter.format(
    Number(value || 0)
  )} zł`;
}

export default function KpiGrid({
  data,
  series = [],
  loading = false,
}) {
  const ordersSeries =
    series.map(
      (row) =>
        Number(row.orders || 0)
    );

  const avgCheckSeries =
    series.map((row) => {
      const orders =
        Number(row.orders || 0);

      if (!orders) {
        return 0;
      }

      return Number(
        (
          Number(
            row.revenue || 0
          ) / orders
        ).toFixed(2)
      );
    });

  const customersSeries =
    series.map(
      (row) =>
        Number(
          row.newCustomers || 0
        ) +
        Number(
          row.repeatCustomers || 0
        )
    );

  const repeatSeries =
    series.map(
      (row) =>
        Number(
          row.repeatCustomers || 0
        )
    );

  const newCustomersSeries =
    series.map(
      (row) =>
        Number(
          row.newCustomers || 0
        )
    );

  /*
   * Отмены пока отсутствуют
   * в businessDynamics по дням,
   * поэтому для sparkline используем
   * пустой массив.
   */
  const cancelSeries =
  series.map(
    (row) =>
      Number(
        row.cancellations || 0
      )
  );

  const cards = [
    {
      key: 'orders',
      label: 'Заказы',
      value:
        data?.orders?.value,
        delta:

          data?.orders

            ?.changeValue,
      fmt: num,
      spark:
        ordersSeries,
      color:
        'hsl(255 100% 68%)',
      suffix: ' шт.',
    },

    {
      key: 'avgCheck',
      label: 'Ср. чек',
      value:
        data?.averageCheck
          ?.value,
        delta:

          data?.averageCheck

            ?.changeValue,
      fmt: money,
      spark:
        avgCheckSeries,
      color:
        'hsl(214 84% 60%)',
      suffix: ' zł',
    },

    {
      key: 'customers',
      label: 'Клиенты',
      value:
        data?.customers?.value,
        delta:

          data?.customers

            ?.changeValue,
      fmt: num,
      spark:
        customersSeries,
      color:
        'hsl(142 64% 47%)',
    },

    {
      key: 'repeat',
      label:
        'Пов. покупки',
      value:
        data?.repeatPurchases
          ?.percent,
      delta:
        data?.repeatPurchases
          ?.changePoints,
      fmt: (v) =>
        `${Number(
          v || 0
        ).toFixed(1)}%`,
      spark:
        repeatSeries,
      color:
        'hsl(255 100% 68%)',
      suffix: '%',
    },

    {
      key: 'cancel',
      label: 'Отмены',
      value:
        data?.cancellations
          ?.percent,
      delta:
        data?.cancellations
          ?.changePoints,
      fmt: (v) =>
        `${Number(
          v || 0
        ).toFixed(1)}%`,
      spark:
        cancelSeries,
      color:
        'hsl(0 72% 58%)',
      suffix: '%',
      invert: true,
    },

    {
      key: 'newCustomers',
      label:
        'Новые кл.',
      value:
        data?.newCustomers
          ?.percent,
      delta:
        data?.newCustomers
          ?.changePoints,
      fmt: (v) =>
        `${Number(
          v || 0
        ).toFixed(1)}%`,
      spark:
        newCustomersSeries,
      color:
        'hsl(214 84% 60%)',
      suffix: '%',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
      {cards.map((card) => (
        <KpiCard
          key={card.key}
          label={card.label}
          value={
            loading
              ? '—'
              : card.fmt(
                  card.value
                )
          }
          delta={
            loading
              ? null
              : card.delta
          }
          series={
            card.spark
          }
          color={
            card.color
          }
          suffix={
            card.suffix
          }
          invert={
            card.invert
          }
        />
      ))}
    </div>
  );
}