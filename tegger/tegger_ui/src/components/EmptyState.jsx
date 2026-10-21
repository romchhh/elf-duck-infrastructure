import React from "react";
import { Network } from "lucide-react";
import { cn } from "@/lib/utils";

export default function EmptyState({ title, description, action, className }) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-16 px-6 text-center rounded-xl border border-dashed border-border bg-muted/40",
        className
      )}
    >
      <div className="relative mb-4">
        <div className="absolute inset-0 brand-grid-bg opacity-40 rounded-full" />
        <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/20">
          <Network className="h-5 w-5 text-primary" strokeWidth={1.5} />
        </div>
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="mt-1 text-xs text-muted-foreground max-w-xs">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}