import React from 'react';

export default function PageHeader({ title, subtitle, children }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <h1 className="font-heading text-[24px] font-semibold leading-tight tracking-tight text-foreground">{title}</h1>
        {subtitle && <p className="mt-1 text-[13px] text-muted-foreground">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}