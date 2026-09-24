import React from 'react';
import { cn } from '@/lib/utils';

// columns: { key, header, align, width, render }
// rows: array of objects
export default function DataTable({ columns, rows, onRowClick, dense }) {
  return (
    <div className="w-full overflow-x-auto scrollbar-thin">
      <table className="w-full min-w-[640px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-border">
            {columns.map((c) => (
              <th
                key={c.key}
                style={{ width: c.width, textAlign: c.align || 'left' }}
                className="px-4 py-3 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-2"
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row.id || i}
              onClick={() => onRowClick?.(row)}
              className={cn(
                'border-b border-border-soft transition-colors',
                onRowClick && 'cursor-pointer',
                'hover:bg-[hsl(234_22%_11%/0.6)]'
              )}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  style={{ textAlign: c.align || 'left' }}
                  className={cn('px-4 text-foreground', dense ? 'py-2.5' : 'py-3.5', c.align === 'right' && 'tabular-nums')}
                >
                  {c.render ? c.render(row) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}