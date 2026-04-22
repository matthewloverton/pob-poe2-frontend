import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { clampWithinBounds, getMainBounds } from "./tooltipBounds";

interface Props {
  text: string;
  x: number;
  y: number;
  maxWidth?: number;
  /** Optional icon shown to the left of the text (same tooltip, richer layout). */
  iconSrc?: string;
}

export function TextTooltip({ text, x, y, maxWidth = 360, iconSrc }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: x + 16, top: y + 16 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { offsetWidth, offsetHeight } = el;
    setPos(clampWithinBounds(x, y, offsetWidth, offsetHeight, getMainBounds()));
  }, [x, y, text, iconSrc]);

  return createPortal(
    <div
      ref={ref}
      style={{ left: pos.left, top: pos.top, maxWidth }}
      className="pointer-events-none fixed z-50 rounded border border-border bg-bg-elevated px-3 py-2 text-[12px] leading-snug text-fg shadow-lg whitespace-pre-wrap flex items-center gap-2"
    >
      {iconSrc && (
        <img
          src={iconSrc}
          alt=""
          className="h-8 w-8 flex-shrink-0 rounded-sm bg-bg/60 ring-1 ring-border/60 object-contain"
        />
      )}
      <span>{text}</span>
    </div>,
    document.body,
  );
}
