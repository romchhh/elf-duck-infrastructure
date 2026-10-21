import React from "react";
import { cn } from "@/lib/utils";

export default function TextInput({ className, ...props }) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-[14px] border border-input bg-card px-4 text-sm text-foreground placeholder:text-muted-foreground/60",
        "transition-colors hover:border-primary/40 focus:outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/20",
        className
      )}
      {...props}
    />
  );
}