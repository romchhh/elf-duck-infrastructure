import React from "react";
import { cn } from "@/lib/utils";

export default function PageHeader({ title, subtitle, children, right }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-6">
      <div>
        <h1 className="text-[28px] sm:text-2xl font-bold tracking-tight text-foreground leading-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {(right || children) && (
        <div className="flex items-center gap-2 flex-wrap">{right || children}</div>
      )}
    </div>
  );
}