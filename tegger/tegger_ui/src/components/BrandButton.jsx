import React from "react";
import { cn } from "@/lib/utils";

const VARIANTS = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm",
  secondary: "bg-white text-foreground border border-border hover:bg-muted",
  ghost: "bg-muted text-foreground hover:bg-surface",
  danger: "bg-red-500 text-white hover:bg-red-600 shadow-sm",
  dangerOutline: "bg-white text-red-600 border border-red-200 hover:bg-red-50",
  link: "text-primary hover:text-primary/80 px-0 py-0 h-auto",
  outline: "bg-white text-primary border border-primary/30 hover:bg-blue-50",
};

const SIZES = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-4 text-sm",
  lg: "h-11 px-6 text-sm",
  icon: "h-9 w-9",
};

export default function BrandButton({
  children,
  variant = "primary",
  size = "md",
  className,
  as: As = "button",
  ...props
}) {
  return (
    <As
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap",
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...props}
    >
      {children}
    </As>
  );
}