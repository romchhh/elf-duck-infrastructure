import React from 'react';
import { ImageIcon, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { parseRgbTriplet, rgbToHex } from '@/lib/catalogColorUtils';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';

export function StatusPill({ active }) {
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        active
          ? 'bg-[hsl(142_64%_47%/0.2)] text-[hsl(142_64%_55%)]'
          : 'bg-[hsl(0_0%_100%/0.08)] text-muted-2'
      )}
    >
      {active ? 'В магазине' : 'Скрыт'}
    </span>
  );
}

function MediaLayer({ bgUrl, duckUrl, duckRight }) {
  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-t-xl bg-[hsl(232_22%_10%)]">
      {bgUrl ? (
        <img
          src={bgUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full items-center justify-center text-muted-2">
          <ImageIcon className="h-10 w-10 opacity-40" />
        </div>
      )}
      {duckUrl ? (
        <img
          src={duckUrl}
          alt=""
          className={cn(
            'absolute bottom-0 h-[72%] w-auto max-w-[55%] object-contain drop-shadow-lg',
            duckRight ? 'right-0' : 'left-0'
          )}
        />
      ) : null}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[hsl(232_31%_4%/0.85)] via-transparent to-transparent" />
    </div>
  );
}

export function CategoryGridCard({
  category,
  onEdit,
  onDelete,
  onToggleActive,
  toggling,
}) {
  const duckRight = String(category.classCardDuck || '').includes('Right');

  return (
    <article
      className={cn(
        'group flex flex-col overflow-hidden rounded-xl border border-border-soft bg-[hsl(232_26%_6%)] shadow-sm transition hover:border-[hsl(255_100%_68%/0.35)]',
        !category.isActive && 'opacity-75'
      )}
    >
      <button type="button" className="text-left" onClick={() => onEdit(category)}>
        <MediaLayer
          bgUrl={category.cardBgUrl}
          duckUrl={category.cardDuckUrl}
          duckRight={duckRight}
        />
        <div className="relative px-3 pb-2 pt-2">
          {category.badgeText ? (
            <span
              className={cn(
                'absolute -top-8 z-10 rounded-md bg-[hsl(255_100%_68%)] px-2 py-0.5 text-[10px] font-bold text-white',
                category.badgeSide === 'right' ? 'right-3' : 'left-3'
              )}
            >
              {category.badgeText}
            </span>
          ) : null}
          <h3 className="truncate text-[15px] font-semibold text-foreground">
            {category.title}
          </h3>
          <p className="mt-0.5 font-mono text-[10px] text-muted-2">{category.key}</p>
        </div>
      </button>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border-soft px-3 py-2.5">
        <div className="flex items-center gap-2">
          <StatusPill active={category.isActive} />
          <span className="text-[11px] text-muted-2">#{category.sortOrder}</span>
        </div>
        <div className="flex items-center gap-1">
          <Switch
            checked={category.isActive}
            disabled={toggling}
            onCheckedChange={() => onToggleActive(category)}
            aria-label="Активность"
          />
          <Button type="button" size="icon" variant="ghost" onClick={() => onEdit(category)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button type="button" size="icon" variant="ghost" onClick={() => onDelete(category)}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>
    </article>
  );
}

export function ProductGridCard({
  product,
  categoryTitle,
  onEdit,
  onDelete,
  onToggleActive,
  toggling,
}) {
  const duckRight = String(product.classCardDuck || '').includes('Right');
  const title = [product.title1, product.title2].filter(Boolean).join(' ');

  return (
    <article
      className={cn(
        'group flex flex-col overflow-hidden rounded-xl border border-border-soft bg-[hsl(232_26%_6%)] transition hover:border-[hsl(255_100%_68%/0.35)]',
        !product.isActive && 'opacity-75'
      )}
    >
      <button type="button" className="text-left" onClick={() => onEdit(product)}>
        <MediaLayer
          bgUrl={product.cardBgUrl}
          duckUrl={product.cardDuckUrl}
          duckRight={duckRight}
        />
        <div className="relative px-3 pb-2 pt-2">
          {product.newBadge ? (
            <span className="absolute -top-8 left-3 z-10 rounded-md bg-[hsl(0_72%_58%)] px-2 py-0.5 text-[10px] font-bold text-white">
              {product.newBadge}
            </span>
          ) : null}
          <h3 className="line-clamp-2 text-[14px] font-semibold leading-snug text-foreground">
            {title || product.productKey}
          </h3>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {categoryTitle || product.categoryKey}
          </p>
          <p className="mt-1 text-[16px] font-semibold tabular-nums text-[hsl(255_100%_75%)]">
            {Number(product.price || 0)} zł
          </p>
          <p className="mt-0.5 text-[11px] text-muted-2">
            {(product.flavors || []).length} вкусов
          </p>
        </div>
      </button>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border-soft px-3 py-2.5">
        <StatusPill active={product.isActive} />
        <div className="flex items-center gap-1">
          <Switch
            checked={product.isActive}
            disabled={toggling}
            onCheckedChange={() => onToggleActive(product)}
          />
          <Button type="button" size="icon" variant="ghost" onClick={() => onEdit(product)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button type="button" size="icon" variant="ghost" onClick={() => onDelete(product)}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>
    </article>
  );
}

export function CategoryPreviewPanel({ form }) {
  const duckRight = String(form.classCardDuck || '').includes('Right');
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-[hsl(232_26%_5%)]">
      <div className="border-b border-border px-3 py-2 text-[11px] uppercase tracking-wider text-muted-2">
        Превью в магазине
      </div>
      <MediaLayer bgUrl={form.cardBgUrl} duckUrl={form.cardDuckUrl} duckRight={duckRight} />
      <div className="p-3">
        <div className="text-[16px] font-semibold">{form.title || 'Название'}</div>
        {form.badgeText ? (
          <div className="mt-2 text-[12px] text-muted-foreground">
            Плашка: {form.badgeText} ({form.badgeSide})
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ProductPreviewPanel({ form }) {
  const duckRight = String(form.classCardDuck || '').includes('Right');
  const title = [form.title1, form.title2].filter(Boolean).join(' ') || 'Товар';
  const accentRgb = parseRgbTriplet(form.accentColor);
  const accentCss = accentRgb ? rgbToHex(accentRgb.r, accentRgb.g, accentRgb.b) : null;
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-[hsl(232_26%_5%)]">
      <div className="border-b border-border px-3 py-2 text-[11px] uppercase tracking-wider text-muted-2">
        Карточка товара
      </div>
      <MediaLayer bgUrl={form.cardBgUrl} duckUrl={form.cardDuckUrl} duckRight={duckRight} />
      <div className="p-3">
        <div className="text-[15px] font-semibold">{title}</div>
        <div className="mt-1 text-[18px] font-bold text-[hsl(255_100%_75%)]">
          {Number(form.price || 0)} zł
        </div>
        {form.newBadge ? (
          <span className="mt-2 inline-block rounded bg-[hsl(0_72%_58%)] px-2 py-0.5 text-[11px] font-bold">
            {form.newBadge}
          </span>
        ) : null}
        {accentCss ? (
          <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-2">
            <span
              className="h-4 w-4 rounded-full border border-[hsl(0_0%_100%/0.15)]"
              style={{ backgroundColor: accentCss }}
            />
            Акцент {form.accentColor}
          </div>
        ) : null}
      </div>
    </div>
  );
}
