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
  /** Druid Shaman gets an extra per-rune Bonded: line. Hide them for every
   *  other ascendancy so we don't show mods that do nothing. */
  isShaman?: boolean;
}

const BONDED_PREFIX = /^Bonded:\s*/;

export function SocketableTooltip({ name, entry, iconSrc, x, y, isShaman = false }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: x + 16, top: y + 16 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setPos(clampWithinBounds(x, y, el.offsetWidth, el.offsetHeight, getMainBounds()));
  }, [x, y, name, entry, isShaman]);

  // "Rune" / "SoulCore" as emitted by PoB. Humanise "SoulCore" → "Soul Core".
  const typeLabel = entry.type === "SoulCore" ? "Soul Core" : entry.type;

  // Mods: hide Bonded: lines for non-Shaman, strip the prefix when showing them.
  const visibleMods = entry.mods
    .filter((m) => isShaman || !BONDED_PREFIX.test(m))
    .map((m) => ({ text: m.replace(BONDED_PREFIX, ""), bonded: BONDED_PREFIX.test(m) }));

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
      {visibleMods.length > 0 && (
        <>
          <div className="my-2 border-t border-border" />
          <div className="space-y-0.5">
            {visibleMods.map((m, i) => (
              <div key={i} className={m.bonded ? "text-purple-400" : "text-sky-300"}>{m.text}</div>
            ))}
          </div>
        </>
      )}
    </div>,
    document.body,
  );
}
