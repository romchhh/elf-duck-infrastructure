import React from "react";
import { cn } from "@/lib/utils";

export default function MetricCard({ label, value, sub, className, accent = false }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card px-4 py-3.5 sm:px-5 sm:py-4",
        accent && "ring-1 ring-primary/20",
        className
      )}
    >
      <div className="brand-eyebrow text-[10px]">{label}</div>
      <div className="mt-1.5 text-2xl font-bold tracking-tight text-foreground tabular-nums">
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}