import React from 'react';
import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { groups } from '@/lib/navConfig';
import { BRAND_LOGO_URL } from '@/lib/productImages';

export default function Sidebar() {
  return (
    <aside className="hidden h-full w-[236px] shrink-0 flex-col border-r border-border bg-[hsl(232_28%_5%)] lg:flex">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5">
<div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg">
  <img
    src={BRAND_LOGO_URL}
    alt="ElfDuck"
    className="h-full w-full object-cover"
  />
</div>
        <div className="font-heading text-[16px] font-semibold tracking-tight text-foreground">
          ELFDUCK
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin px-3 pb-4">
        {groups.map((g) => (
          <div key={g.label} className="mb-5">
            <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-2">
              {g.label}
            </div>
            <div className="space-y-0.5">
              {g.items.map((it) => (
                <NavLink
                  key={it.to}
                  to={it.to}
                  end={it.end}
                  className={({ isActive }) =>
                    cn(
                      'group flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition-all',
                      isActive
                        ? 'bg-[hsl(255_100%_68%/0.1)] text-foreground shadow-[inset_0_0_0_1px_hsl(255_100%_68%/0.18)]'
                        : 'text-muted-foreground hover:bg-[hsl(234_22%_11%/0.5)] hover:text-foreground'
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <it.icon
                        className={cn('h-4 w-4 shrink-0', isActive ? 'text-[hsl(255_100%_72%)]' : 'text-muted-2 group-hover:text-muted-foreground')}
                      />
                      <span className="font-medium">{it.label}</span>
                      {isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[hsl(255_100%_72%)]" />}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Profile */}
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-[hsl(234_22%_11%/0.5)]">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[hsl(234_22%_18%)] to-[hsl(234_22%_12%)] text-[12px] font-semibold text-foreground">
            ED
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium text-foreground">Основатель</div>
            <div className="truncate text-[11px] text-muted-2">Менеджер</div>
          </div>
        </div>
      </div>
    </aside>
  );
}