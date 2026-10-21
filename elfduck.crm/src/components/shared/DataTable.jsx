import React from 'react';
import { cn } from '@/lib/utils';
import { SortableHeader } from '@/lib/tableSort';

// columns: { key, header, align, width, render, sortable?, sortKey? }
// When onSort is provided, string headers become sortable unless sortable: false.
export default function DataTable({
  columns,
  rows,
  onRowClick,
  dense,
  sortKey = '',
  sortDirection = 'desc',
  onSort,
}) {
  return (
    <div className="w-full overflow-x-auto scrollbar-thin">
      <table className="w-full min-w-[640px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-border">
            {columns.map((c) => {
              const columnSortKey = c.sortKey || c.key;
              const canSort =
                typeof onSort === 'function' &&
                c.sortable !== false &&
                typeof c.header === 'string';

              return (
                <th
                  key={c.key}
                  style={{ width: c.width, textAlign: c.align || 'left' }}
                  className="px-4 py-3 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-2"
                >
                  {canSort ? (
                    <SortableHeader
                      label={c.header}
                      active={sortKey === columnSortKey}
                      direction={sortDirection}
                      onClick={() => onSort(columnSortKey)}
                      className={
                        c.align === 'right'
                          ? 'w-full justify-end'
                          : 'w-full justify-start'
                      }
                    />
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
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
                  className={cn(
                    'px-4 text-foreground',
                    dense ? 'py-2.5' : 'py-3.5',
                    c.align === 'right' && 'tabular-nums'
                  )}
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
