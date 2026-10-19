import React, { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Подтвердить",
  cancelLabel = "Отмена",
  danger = false,
  children,
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className={cn(
          "relative w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl bg-card border border-border shadow-lg p-6 m-0 sm:m-4",
          "animate-in fade-in slide-in-from-bottom-4"
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        {description && <p className="mt-2 text-sm text-muted-foreground">{description}</p>}
        {children}
        <div className="mt-6 flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="h-9 px-4 rounded-full text-sm font-medium bg-muted text-foreground hover:bg-surface"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={cn(
              "h-9 px-4 rounded-full text-sm font-medium text-white shadow-sm",
              danger ? "bg-red-500 hover:bg-red-600" : "bg-primary hover:bg-primary/90"
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}