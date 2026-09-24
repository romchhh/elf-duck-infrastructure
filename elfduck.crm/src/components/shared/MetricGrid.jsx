import React from 'react';
import { cn } from '@/lib/utils';

// items: [{ label, value, className }]
export default function MetricGrid({ cols = 3, items, className }) {
  const colClass = cols === 2 ? 'grid-cols-2' : cols === 4 ? 'grid-cols-4' : 'grid-cols-3';
  return (
    <div className={cn('grid gap-x-3 gap-y-2.5', colClass, className)}>
      {items.map((m, i) => (
        <div key={i} className="min-w-0 overflow-hidden">
          <div className="whitespace-nowrap text-[10px] uppercase leading-[1.2] tracking-[0.04em] text-muted-2">{m.label}</div>
          <div className={cn('whitespace-nowrap text-[13px] font-medium leading-tight tabular-nums text-muted-foreground', m.className)}>{m.value}</div>
        </div>
      ))}
    </div>
  );
}