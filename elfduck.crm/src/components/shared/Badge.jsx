import React from 'react';
import { cn } from '@/lib/utils';

const map = {
  active: { label: 'Активный', cls: 'bg-[hsl(142_64%_47%/0.12)] text-[hsl(142_70%_60%)] border-[hsl(142_64%_47%/0.2)]' },
  sleeping: { label: 'Спящий', cls: 'bg-[hsl(36_92%_56%/0.1)] text-[hsl(36_90%_64%)] border-[hsl(36_92%_56%/0.2)]' },
  vip: { label: 'VIP', cls: 'bg-[hsl(255_100%_68%/0.12)] text-[hsl(255_100%_75%)] border-[hsl(255_100%_68%/0.25)]' },
  new: { label: 'Новый', cls: 'bg-[hsl(214_84%_60%/0.12)] text-[hsl(214_90%_72%)] border-[hsl(214_84%_60%/0.22)]' },
  lost: { label: 'Потерян', cls: 'bg-[hsl(0_72%_58%/0.1)] text-[hsl(0_80%_68%)] border-[hsl(0_72%_58%/0.2)]' },
  done: { label: 'Выполнен', cls: 'bg-[hsl(142_64%_47%/0.12)] text-[hsl(142_70%_60%)] border-[hsl(142_64%_47%/0.2)]' },
  processing: { label: 'В обработке', cls: 'bg-[hsl(255_100%_68%/0.12)] text-[hsl(255_100%_75%)] border-[hsl(255_100%_68%/0.25)]' },
  cancelled: { label: 'Отменён', cls: 'bg-[hsl(0_72%_58%/0.1)] text-[hsl(0_80%_68%)] border-[hsl(0_72%_58%/0.2)]' },
  draft: { label: 'Черновик', cls: 'bg-[hsl(228_12%_30%/0.2)] text-[hsl(228_12%_70%)] border-[hsl(228_12%_30%/0.3)]' },
  converted: { label: 'Конвертирован', cls: 'bg-[hsl(142_64%_47%/0.12)] text-[hsl(142_70%_60%)] border-[hsl(142_64%_47%/0.2)]' },
  in_progress: { label: 'В работе', cls: 'bg-[hsl(36_92%_56%/0.1)] text-[hsl(36_90%_64%)] border-[hsl(36_92%_56%/0.2)]' },
  leadNew: { label: 'Новый', cls: 'bg-[hsl(214_84%_60%/0.12)] text-[hsl(214_90%_72%)] border-[hsl(214_84%_60%/0.22)]' },
  leadLost: { label: 'Потерян', cls: 'bg-[hsl(0_72%_58%/0.1)] text-[hsl(0_80%_68%)] border-[hsl(0_72%_58%/0.2)]' },
};

export default function Badge({ status, label, className }) {
  const cfg = map[status] || { label: label || status, cls: 'bg-[hsl(228_12%_30%/0.2)] text-[hsl(228_12%_70%)] border-[hsl(228_12%_30%/0.3)]' };
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none whitespace-nowrap', cfg.cls, className)}>
      {cfg.label}
    </span>
  );
}