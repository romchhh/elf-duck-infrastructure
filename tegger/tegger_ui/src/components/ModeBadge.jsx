import React from "react";
import { cn } from "@/lib/utils";

export default function ModeBadge({ mode, className, compact = false }) {
  const isLive = mode === "LIVE";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap",
        isLive
          ? "bg-red-50 text-red-700 ring-1 ring-red-200"
          : "bg-blue-50 text-primary ring-1 ring-primary/30",
        className
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", isLive ? "bg-red-500" : "bg-primary")} />
      {isLive ? (compact ? "LIVE" : "LIVE · Боевой режим") : (compact ? "DRY RUN" : "DRY RUN")}
    </span>
  );
}