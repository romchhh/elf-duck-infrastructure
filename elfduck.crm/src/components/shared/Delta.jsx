import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Delta({ value, suffix = '', className }) {
  const up = value >= 0;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[12px] font-medium tabular-nums',
        up ? 'text-[hsl(142_70%_55%)]' : 'text-[hsl(0_80%_66%)]',
        className
      )}
    >
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {up ? '+' : ''}
      {value}
      {suffix}
    </span>
  );
}