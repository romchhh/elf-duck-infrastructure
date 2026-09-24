import React, { useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { periodOptions } from '@/lib/mockData';
import { usePeriod } from '@/lib/PeriodContext';

export default function PeriodControl() {
  const { period, setPeriod, setCustomRange } = usePeriod();
  const [draftStart, setDraftStart] = useState('');
  const [draftEnd, setDraftEnd] = useState('');
  const [customOpen, setCustomOpen] = useState(false);

  const applyCustom = () => {
    if (!draftStart || !draftEnd) return;

    const start = new Date(
      draftStart + 'T00:00:00'
    );

    const end = new Date(
      draftEnd + 'T23:59:59'
    );

    if (
      isNaN(start.getTime()) ||
      isNaN(end.getTime()) ||
      start > end
    ) {
      return;
    }

    setCustomRange({
      start,
      end,
    });

    setCustomOpen(false);
  };

  const closeCustom = () => {
    setCustomOpen(false);
    setDraftStart('');
    setDraftEnd('');
    setCustomRange(null);
    setPeriod('Месяц');
  };

  return (
    <div className="relative w-full lg:w-auto">
      <div className="flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg border border-border bg-[hsl(232_26%_7%)] p-0.5 no-scrollbar lg:overflow-visible">
        {periodOptions.map((p) => (
          <button
            key={p}
            onClick={() => {
  setPeriod(p);

  if (
    p === 'Свой период'
  ) {
    setCustomOpen(true);
  } else {
    setCustomOpen(false);
  }
}}
            className={cn(
              'shrink-0 whitespace-nowrap rounded-md px-2 py-1.5 text-[11px] font-medium transition-all sm:px-2.5 sm:py-1.5 sm:text-[12px]',
              period === p
                ? 'bg-[hsl(255_100%_68%/0.14)] text-foreground shadow-[inset_0_0_0_1px_hsl(255_100%_68%/0.22)]'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {p}
          </button>
        ))}
      </div>

      {period === 'Свой период' &&

  customOpen && (
        <div className="absolute right-0 top-full z-30 mt-2 w-[340px] max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-[hsl(232_26%_8%)] p-3 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.85)]">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="date"
              value={draftStart}
              onChange={(e) => setDraftStart(e.target.value)}
              style={{ colorScheme: 'dark' }}
              className="input-base min-w-0 flex-1"
            />
            <span className="hidden text-muted-2 sm:inline">—</span>
            <input
              type="date"
              value={draftEnd}
              onChange={(e) => setDraftEnd(e.target.value)}
              style={{ colorScheme: 'dark' }}
              className="input-base min-w-0 flex-1"
            />
          </div>
          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              onClick={closeCustom}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-foreground"
              title="Закрыть"
            >
              <X className="h-4 w-4" />
            </button>
            <button
              onClick={applyCustom}
              disabled={!draftStart || !draftEnd}
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-[hsl(255_100%_68%)] to-[hsl(280_90%_60%)] px-4 py-2 text-[12px] font-medium text-white shadow-[0_4px_20px_-6px_hsl(255_100%_68%)] disabled:opacity-40"
            >
              Применить
            </button>
          </div>
        </div>
      )}
    </div>
  );
}