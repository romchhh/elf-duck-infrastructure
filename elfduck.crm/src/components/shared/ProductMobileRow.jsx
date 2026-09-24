import React from 'react';
import { Package, Droplet, Zap, Layers } from 'lucide-react';
import { currency, num } from '@/lib/mockData';
import Delta from '@/components/shared/Delta';
import MetricGrid from '@/components/shared/MetricGrid';
import { resolveProductImage } from '@/lib/productImages';

const catIcon = {
  'Одноразки': Zap,
  'Жидкости': Droplet,
  'Поды': Package,
  'Картриджи': Layers,
};

export default function ProductMobileRow({ p }) {
  const lowStock = p.days <= 2;
  const Icon = catIcon[p.category] || Package;
  const imageSrc = resolveProductImage(
    p.productKey,
    p.imageUrl
  );

  return (
    <div className="rounded-xl border border-border-soft bg-[hsl(232_26%_6%)] p-3.5">
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-[hsl(234_22%_18%)] to-[hsl(234_22%_10%)]">
          {imageSrc ? (
            <img
              src={imageSrc}
              alt={p.name}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <Icon className="h-4 w-4 text-[hsl(255_100%_72%)]" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium text-foreground">{p.name}</div>
          <div className="text-[11px] text-muted-2">{p.category}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="whitespace-nowrap text-[14px] font-semibold tabular-nums text-foreground">{currency(p.revenue)}</div>
          <div className="flex justify-end"><Delta value={p.trend} suffix="%" /></div>
        </div>
      </div>
      <div className="mt-3 border-t border-border-soft pt-3">
        <MetricGrid cols={3} items={[
          { label: 'Продано', value: `${num(p.sold)} шт.` },
          { label: 'Остаток', value: `${p.stock} шт.`, className: lowStock ? 'text-[hsl(36_90%_62%)]' : 'text-muted-foreground' },
          { label: 'Дн. запаса', value: p.days, className: lowStock ? 'text-[hsl(36_90%_62%)]' : 'text-muted-foreground' },
        ]} />
        <div className="mt-2.5">
          <MetricGrid cols={2} items={[
            { label: 'Повторные', value: `${p.repeat}%` },
            { label: 'Стоимость остатка', value: currency(p.stockValue) },
          ]} />
        </div>
      </div>
    </div>
  );
}