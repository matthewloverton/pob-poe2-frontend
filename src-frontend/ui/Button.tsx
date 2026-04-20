import type { ButtonHTMLAttributes } from "react";

export function Button({ className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={
        "border border-border bg-bg-elevated px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-fg-dim " +
        "hover:border-fg-muted hover:text-fg disabled:opacity-50 disabled:cursor-not-allowed transition-colors " +
        className
      }
      {...props}
    />
  );
}
