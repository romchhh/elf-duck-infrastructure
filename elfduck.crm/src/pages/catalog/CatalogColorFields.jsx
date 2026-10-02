import React from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Field } from '@/pages/push/pushFormUi';
import { CATALOG_SWATCH_PRESETS } from '@/lib/catalogPresets';
import {
  formatRgbTriplet,
  hexToRgb,
  normalizeHex,
  parseRgbTriplet,
  rgbToHex,
  rgbTripletToHex,
} from '@/lib/catalogColorUtils';

function SwatchRow({ presets, currentHex, onPick }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {presets.map((hex) => (
        <button
          key={hex}
          type="button"
          title={hex}
          onClick={() => onPick(hex)}
          className={cn(
            'h-7 w-7 rounded-md border border-[hsl(0_0%_100%/0.12)] shadow-sm transition hover:scale-105 hover:border-[hsl(255_100%_68%/0.5)]',
            normalizeHex(currentHex) === normalizeHex(hex) &&
              'ring-2 ring-[hsl(255_100%_68%)] ring-offset-1 ring-offset-[hsl(232_26%_6%)]'
          )}
          style={{ backgroundColor: hex }}
        />
      ))}
    </div>
  );
}

function ColorPickerRow({ hex, onHexChange, presets, showHexInput }) {
  const safeHex = normalizeHex(hex);

  const applyHex = (next) => {
    onHexChange(normalizeHex(next, safeHex));
  };

  return (
    <div className="space-y-2" style={{ colorScheme: 'dark' }}>
      <div className="flex items-stretch gap-2">
        <label
          className="relative flex h-10 w-12 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-border bg-[hsl(232_22%_10%)]"
          title="Открыть палитру"
        >
          <span
            className="absolute inset-0"
            style={{ backgroundColor: safeHex }}
          />
          <input
            type="color"
            value={safeHex}
            onChange={(e) => applyHex(e.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>
        {showHexInput ? (
          <Input
            value={safeHex}
            onChange={(e) => applyHex(e.target.value)}
            className="h-10 flex-1 font-mono text-[12px]"
            spellCheck={false}
          />
        ) : (
          <div
            className="flex flex-1 items-center rounded-lg border border-border bg-[hsl(232_22%_8%)] px-3 font-mono text-[12px] text-muted-foreground"
          >
            {safeHex}
          </div>
        )}
      </div>
      {presets?.length ? (
        <SwatchRow presets={presets} currentHex={safeHex} onPick={applyHex} />
      ) : null}
    </div>
  );
}

/** Значение для API: `32, 130, 231` */
export function RgbTripletField({ label, value, onChange }) {
  const hex = rgbTripletToHex(value, '#2082e7');

  const onHexChange = (nextHex) => {
    const rgb = hexToRgb(nextHex);
    if (!rgb) return;
    onChange(formatRgbTriplet(rgb.r, rgb.g, rgb.b));
  };

  const parsed = parseRgbTriplet(value);
  const displayTriplet = parsed ? formatRgbTriplet(parsed.r, parsed.g, parsed.b) : '';

  const clear = () => onChange('');

  return (
    <Field label={label}>
      <ColorPickerRow
        hex={hex}
        onHexChange={onHexChange}
        presets={CATALOG_SWATCH_PRESETS}
        showHexInput={false}
      />
      <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-border bg-[hsl(232_22%_8%)] px-3 py-2">
        <span className="font-mono text-[12px] text-muted-foreground">
          {displayTriplet || 'Не выбран — нажмите палитру'}
        </span>
        {value ? (
          <button
            type="button"
            className="text-[11px] text-muted-2 underline-offset-2 hover:text-foreground hover:underline"
            onClick={clear}
          >
            Сбросить
          </button>
        ) : null}
      </div>
    </Field>
  );
}

export function HexColorField({ label, value, onChange, presets }) {
  const hex = normalizeHex(value || '#1a1a2e', '#1a1a2e');

  return (
    <Field label={label}>
      <ColorPickerRow
        hex={hex}
        onHexChange={(h) => onChange(h)}
        presets={presets || CATALOG_SWATCH_PRESETS}
        showHexInput
      />
    </Field>
  );
}

export function FlavorGradientPickers({ gradient0, gradient1, onChange0, onChange1 }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <HexColorField label="Цвет градиента 1" value={gradient0} onChange={onChange0} />
      <HexColorField label="Цвет градиента 2" value={gradient1} onChange={onChange1} />
      <div
        className="sm:col-span-2 h-10 rounded-lg border border-border"
        style={{
          background: `linear-gradient(135deg, ${normalizeHex(gradient0, '#1a1a2e')}, ${normalizeHex(gradient1, '#4a4a6a')})`,
        }}
      />
    </div>
  );
}
