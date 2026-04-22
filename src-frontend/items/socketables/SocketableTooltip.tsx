import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { clampWithinBounds, getMainBounds } from "../../ui/tooltipBounds";
import type { SocketableSlotEntry } from "./types";

interface Props {
  name: string;
  entry: SocketableSlotEntry;
  iconSrc?: string;
  x: number;
  y: number;
}

export function SocketableTooltip({ name, entry, iconSrc, x, y }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: x + 16, top: y + 16 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setPos(clampWithinBounds(x, y, el.offsetWidth, el.offsetHeight, getMainBounds()));
  }, [x, y, name, entry]);

  // "Rune" / "SoulCore" as emitted by PoB. Humanise "SoulCore" → "Soul Core".
  const typeLabel = entry.type === "SoulCore" ? "Soul Core" : entry.type;

  return createPortal(
    <div
      ref={ref}
      style={{ left: pos.left, top: pos.top, maxWidth: 360 }}
      className="pointer-events-none fixed z-[100] border border-border bg-bg-elevated/95 px-3 py-2 font-mono text-[11px] text-fg shadow-xl backdrop-blur-sm"
    >
      <div className="flex items-center gap-2">
        {iconSrc && (
          <img
            src={iconSrc}
            alt=""
            className="h-8 w-8 flex-shrink-0 rounded-sm bg-bg/60 ring-1 ring-border/60 object-contain"
          />
        )}
        <div className="min-w-0">
          <div className="text-sm font-semibold text-fg truncate">{name}</div>
          <div className="text-[10px] text-fg-muted opacity-80">{typeLabel}</div>
        </div>
      </div>
      {entry.mods.length > 0 && (
        <>
          <div className="my-2 border-t border-border" />
          <div className="space-y-0.5">
            {entry.mods.map((m, i) => (
              <div key={i} className="text-sky-300">{m}</div>
            ))}
          </div>
        </>
      )}
    </div>,
    document.body,
  );
}
