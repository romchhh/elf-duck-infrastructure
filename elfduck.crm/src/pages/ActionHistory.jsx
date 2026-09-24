import React from 'react';
import { actionHistory } from '@/lib/mockData';

export default function ActionHistory() {
  return (
    <div className="mx-auto max-w-2xl rounded-2xl surface-card p-6">
      <h3 className="font-heading text-[15px] font-semibold text-foreground">История действий</h3>
      <p className="mt-0.5 text-[12px] text-muted-foreground">Журнал активности сотрудников</p>
      <div className="relative mt-6 pl-6">
        <div className="absolute left-[7px] top-1 bottom-1 w-px bg-border" />
        <div className="space-y-5">
          {actionHistory.map((a, i) => (
            <div key={i} className="relative">
              <span className="absolute -left-[22px] top-1.5 h-3 w-3 rounded-full border-2 border-[hsl(255_100%_68%)] bg-background" />
              <div className="text-[13px] text-foreground">{a.action}</div>
              <div className="mt-0.5 text-[11px] text-muted-2">{a.user} · {a.time}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}