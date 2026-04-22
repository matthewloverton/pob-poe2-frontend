import { useLayoutEffect, useRef, useState } from "react";
import type { PassiveNode } from "../types/tree";
import { clampWithinBounds, getMainBounds } from "./tooltipBounds";

export interface JewelEffectOnNode {
  jewelName: string;
  mods: string[];
}

export interface NodeTooltipProps {
  node: PassiveNode;
  x: number;
  y: number;
  /** When the node is a multi-option node and the user has already picked one,
   *  show the chosen option's name + stats rather than the generic base copy. */
  overrideIndex?: number;
  /** Jewel sockets whose radius includes this node, with each jewel's
   *  mod text — shown as a "From <jewel name>" block so the user knows
   *  which jewel(s) are affecting the hovered passive. */
  jewelAffects?: JewelEffectOnNode[];
}

function nodeKind(node: PassiveNode): string {
  if (node.isKeystone) return "Keystone";
  if (node.isNotable) return "Notable";
  if (node.isJewelSocket) return "Socket";
  return "Passive";
}

export function NodeTooltip({ node, x, y, overrideIndex, jewelAffects }: NodeTooltipProps) {
  const picked = overrideIndex != null && Array.isArray(node.options)
    ? node.options[overrideIndex]
    : undefined;
  const statsArray = picked?.stats && Array.isArray(picked.stats) ? picked.stats
                   : Array.isArray(node.stats) ? node.stats : [];
  const name = picked?.name ?? (node.name as string | undefined) ?? "Unknown";
  const kind = nodeKind(node);

  // Measure + clamp inside the <main> pane so the tooltip never slides
  // under the sidebar or off-screen. First render paints naively, then a
  // layout effect reads the actual bounding rect and repositions.
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x + 16, top: y + 16 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const bounds = getMainBounds();
    const next = clampWithinBounds(x, y, rect.width, rect.height, bounds);
    if (next.left !== pos.left || next.top !== pos.top) setPos(next);
  }, [x, y, node, jewelAffects, pos.left, pos.top]);

  return (
    <div
      ref={ref}
      className="pointer-events-none fixed z-30 border border-border bg-bg-elevated/95 px-3 py-2 font-mono text-xs text-fg shadow-xl backdrop-blur-sm max-w-sm"
      style={{ left: pos.left, top: pos.top }}
    >
      <div className="text-[9px] uppercase tracking-widest text-fg-muted mb-0.5">{kind}</div>
      <div className="text-sm font-semibold mb-1">{name}</div>
      {statsArray.length > 0 && (
        <ul className="space-y-0.5 text-fg-dim">
          {statsArray.map((stat, i) => (
            <li key={i} className="leading-tight">{stat}</li>
          ))}
        </ul>
      )}
      {/* Jewel-in-radius effects: one block per jewel whose socket radius
          includes this node, so the user sees "Megalomaniac grants X" etc.
          without having to inspect each jewel separately. */}
      {jewelAffects && jewelAffects.length > 0 && (
        <>
          {jewelAffects.map((j, i) => (
            <div key={i} className="mt-2 border-t border-border pt-1">
              <div className="text-[9px] uppercase tracking-widest text-purple-400">
                From {j.jewelName}
              </div>
              {j.mods.map((m, mi) => (
                <div key={mi} className="text-blue-200 leading-tight">{m}</div>
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
