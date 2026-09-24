import React from 'react';

const sections = [
  { title: 'Компания', items: ['Название', 'Валюта: PLN', 'Часовой пояс: Europe/Warsaw'] },
  { title: 'Уведомления', items: ['Email-отчёты', 'Push об окончании стока', 'Алёрты по отменам'] },
  { title: 'Интеграции', items: ['InPost API', 'Stripe', 'Google Sheets'] },
];

export default function Settings() {
  return (
    <div className="grid grid-cols-3 gap-5">
      {sections.map((s) => (
        <div key={s.title} className="rounded-2xl surface-card p-5">
          <h3 className="font-heading text-[14px] font-semibold text-foreground">{s.title}</h3>
          <div className="mt-4 space-y-3">
            {s.items.map((it) => (
              <div key={it} className="flex items-center justify-between rounded-lg border border-border-soft bg-[hsl(232_26%_6%)] px-3 py-2.5">
                <span className="text-[13px] text-muted-foreground">{it}</span>
                <span className="h-5 w-9 rounded-full bg-[hsl(255_100%_68%/0.3)] p-0.5">
                  <span className="block h-4 w-4 translate-x-4 rounded-full bg-[hsl(255_100%_68%)]" />
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}