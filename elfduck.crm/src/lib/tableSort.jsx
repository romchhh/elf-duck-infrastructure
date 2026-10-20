import React, { useCallback, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Shared CRM table sort state.
 * Toggle: same key flips asc/desc; new key starts at desc.
 */
export function useTableSort(initialKey = '', initialDirection = 'desc') {
  const [sortKey, setSortKey] = useState(initialKey);
  const [sortDirection, setSortDirection] = useState(initialDirection);

  const toggleSort = useCallback(
    (key) => {
      if (!key) return;

      if (sortKey === key) {
        setSortDirection((dir) => (dir === 'desc' ? 'asc' : 'desc'));
        return;
      }

      setSortKey(key);
      setSortDirection('desc');
    },
    [sortKey]
  );

  const appendSortParams = useCallback(
    (params) => {
      if (!sortKey) return params;
      params.set('sortKey', sortKey);
      params.set('sortDirection', sortDirection);
      return params;
    },
    [sortKey, sortDirection]
  );

  return {
    sortKey,
    sortDirection,
    setSortKey,
    setSortDirection,
    toggleSort,
    appendSortParams,
  };
}

export function SortableHeader({
  label,
  active,
  direction = 'desc',
  onClick,
  className = '',
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap text-inherit transition-colors hover:text-foreground',
        className
      )}
    >
      <span>{label}</span>
      {!active ? (
        <ArrowUpDown className="h-3 w-3 shrink-0 text-muted-2" />
      ) : direction === 'desc' ? (
        <ArrowDown className="h-3 w-3 shrink-0 text-[hsl(255_100%_72%)]" />
      ) : (
        <ArrowUp className="h-3 w-3 shrink-0 text-[hsl(255_100%_72%)]" />
      )}
    </button>
  );
}
