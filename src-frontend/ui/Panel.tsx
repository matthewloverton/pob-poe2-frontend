import type { ReactNode } from "react";

export function Panel({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="border border-border bg-bg-elevated">
      {title && (
        <div className="border-b border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          {title}
        </div>
      )}
      <div className="p-3">{children}</div>
    </div>
  );
}
