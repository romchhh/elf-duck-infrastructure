import React from 'react';
import { cn } from '@/lib/utils';

export function Section({ label, children }) {
  return (
    <div>
      <div className="mb-2 text-[11px] uppercase tracking-wider text-muted-2">
        {label}
      </div>
      {children}
    </div>
  );
}

export function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-[12px] transition-all',
        active
          ? 'border-[hsl(255_100%_68%/0.4)] bg-[hsl(255_100%_68%/0.14)] text-foreground'
          : 'border-border text-muted-foreground hover:text-foreground'
      )}
    >
      {children}
    </button>
  );
}

export function Field({ label, children }) {
  return (
    <div>
      <label className="text-[11px] uppercase tracking-wider text-muted-2">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
