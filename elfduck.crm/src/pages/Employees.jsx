import React from 'react';
import { employees, currency, num } from '@/lib/mockData';
import DataTable from '@/components/shared/DataTable';

export default function Employees() {
  const columns = [
    {
      key: 'name', header: 'Сотрудник', render: (r) => (
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[hsl(234_22%_18%)] to-[hsl(234_22%_10%)] text-[11px] font-semibold text-foreground">
            {r.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}
          </div>
          <span className="font-medium text-foreground">{r.name}</span>
        </div>
      ),
    },
    { key: 'role', header: 'Роль', render: (r) => <span className="text-muted-foreground">{r.role}</span> },
    { key: 'location', header: 'Точка', render: (r) => <span className="text-muted-foreground">{r.location}</span> },
    { key: 'orders', header: 'Заказы', align: 'right', render: (r) => <span className="text-muted-foreground">{num(r.orders)}</span> },
    { key: 'revenue', header: 'Выручка', align: 'right', render: (r) => <span className="font-medium text-foreground">{currency(r.revenue)}</span> },
    {
      key: 'active', header: 'Статус', render: (r) => (
        <span className={r.active ? 'text-[hsl(142_70%_58%)]' : 'text-muted-2'}>
          {r.active ? '● Активен' : '○ Неактивен'}
        </span>
      ),
    },
  ];

  return (
    <div className="rounded-2xl surface-card p-2">
      <DataTable columns={columns} rows={employees} dense />
    </div>
  );
}