import React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Branded custom dropdown — replaces all native <select> controls.
 * Accessible (Radix), keyboard-navigable, no native browser chrome.
 *
 * options: array of [value, label] tuples, {value, label} objects, or strings.
 */
export default function BrandedSelect({
  value,
  onChange,
  options = [],
  placeholder,
  className,
  ariaLabel,
  triggerClassName,
}) {
  const normalized = options.map((opt) => {
    if (Array.isArray(opt)) return { value: opt[0], label: opt[1] ?? opt[0] };
    if (typeof opt === "string") return { value: opt, label: opt };
    return opt;
  });

  return (
    <SelectPrimitive.Root value={value} onValueChange={onChange}>
      <SelectPrimitive.Trigger
        aria-label={ariaLabel}
        className={cn(
          "inline-flex w-full items-center justify-between gap-2 rounded-[14px] border border-input bg-card px-4 text-sm text-foreground",
          "h-11 min-w-0 transition-colors duration-150",
          "data-[placeholder]:text-muted-foreground",
          "hover:border-primary/40 focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/20",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} className="truncate" />
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-150" strokeWidth={1.75} />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          className={cn(
            "z-50 max-h-[280px] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-[14px] border border-border bg-card shadow-[0_8px_30px_rgba(5,5,5,0.10)]",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
            triggerClassName
          )}
        >
          <SelectPrimitive.Viewport className="p-2">
            {normalized.map((opt) => (
              <SelectPrimitive.Item
                key={opt.value}
                value={opt.value}
                className={cn(
                  "relative flex cursor-pointer select-none items-center gap-2 rounded-lg py-2.5 pl-3 pr-9 text-sm text-foreground outline-none transition-colors duration-100",
                  "data-[highlighted]:bg-muted",
                  "data-[state=checked]:bg-primary/10 data-[state=checked]:text-primary"
                )}
              >
                <SelectPrimitive.ItemText className="truncate">{opt.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="absolute right-3 inline-flex items-center">
                  <Check className="h-4 w-4 text-primary" strokeWidth={2.5} />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}