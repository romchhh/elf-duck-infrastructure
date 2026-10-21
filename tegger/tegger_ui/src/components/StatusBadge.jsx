import React from "react";
import { cn } from "@/lib/utils";

const STATUS_STYLES = {
  // account statuses
  "Активен": "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  "Cooldown": "bg-orange-50 text-orange-700 ring-1 ring-orange-200",
  "Остановлен": "bg-neutral-100 text-neutral-600 ring-1 ring-neutral-200",
  "Не настроен": "bg-neutral-100 text-neutral-500 ring-1 ring-neutral-200",
  "Ошибка": "bg-destructive/10 text-destructive ring-1 ring-red-200",
  // campaign statuses
  "Активна": "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  "Остановлена": "bg-neutral-100 text-neutral-600 ring-1 ring-neutral-200",
  "Завершена": "bg-primary/10 text-primary ring-1 ring-blue-200",
  "Готова к запуску": "bg-primary/10 text-primary ring-1 ring-blue-200",
  "Готов к запуску": "bg-primary/10 text-primary ring-1 ring-blue-200",
  // target statuses
  "Отмечен": "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  "Ожидает": "bg-neutral-100 text-neutral-500 ring-1 ring-neutral-200",
};

export default function StatusBadge({ status, className, dot = false }) {
  const style = STATUS_STYLES[status] || "bg-neutral-100 text-neutral-600 ring-1 ring-neutral-200";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        style,
        className
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />}
      {status}
    </span>
  );
}