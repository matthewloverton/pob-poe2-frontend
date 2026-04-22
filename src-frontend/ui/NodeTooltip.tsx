import { Fragment, useLayoutEffect, useRef, useState } from "react";
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

// PoE2 "X% increased Effect of Notable Passive Skills in Radius" — applies to
// both the notable's own mods and the grants from the jewel. We parse the
// percentage out of any matching line and multiply numeric values elsewhere by
// (1 + pct/100). Multiple matching lines compound additively (PoB semantics).
const EFFECT_RE = /(\d+(?:\.\d+)?)%\s+increased\s+Effect\s+of\s+Notable\s+Passive\s+Skills\s+in\s+Radius/i;
const GRANT_PREFIX = /^Notable\s+Passive\s+Skills\s+in\s+Radius\s+also\s+grant\s+/i;

function computeEffectMultiplier(mods: string[] | undefined): number {
  if (!mods) return 1;
  let pct = 0;
  for (const m of mods) {
    const match = m.match(EFFECT_RE);
    if (match) pct += Number(match[1]);
  }
  return 1 + pct / 100;
}

/** Render a stat line with any `N%` or bare `N` integer scaled by `mult`,
 *  highlighting changed values. When mult === 1, returns a plain string. */
function ScaledLine({ text, mult }: { text: string; mult: number }) {
  if (mult === 1) return <>{text}</>;
  // Split on %, so we can scale the preceding number. Also handles standalone
  // integers adjacent to mod keywords ("grant 7 life") — rare but real.
  const parts = text.split(/(\d+(?:\.\d+)?)(%?)/g);
  return (
    <>
      {parts.map((p, i) => {
        // Every third chunk is a number token (index 1, 4, 7, …)
        if (i % 3 !== 1) return <Fragment key={i}>{p}</Fragment>;
        const n = Number(p);
        if (!Number.isFinite(n)) return <Fragment key={i}>{p}</Fragment>;
        const scaled = Math.round(n * mult * 100) / 100;
        const pretty = Number.isInteger(scaled) ? String(scaled) : scaled.toFixed(2).replace(/\.?0+$/, "");
        return (
          <span key={i} className="text-cyan-300">{pretty}</span>
        );
      })}
    </>
  );
}

export function NodeTooltip({ node, x, y, overrideIndex, jewelAffects }: NodeTooltipProps) {
  const picked = overrideIndex != null && Array.isArray(node.options)
    ? node.options[overrideIndex]
    : undefined;
  const statsArray = picked?.stats && Array.isArray(picked.stats) ? picked.stats
                   : Array.isArray(node.stats) ? node.stats : [];
  const name = picked?.name ?? (node.name as string | undefined) ?? "Unknown";
  const kind = nodeKind(node);

  // Aggregate all jewel mods to find the overall multiplier. Filter grant-type
  // mods for display; strip the redundant prefix. Non-grant mods (radius
  // upgrades, the "increased Effect" line itself) are dropped.
  const allJewelMods = (jewelAffects ?? []).flatMap((j) => j.mods);
  const effectMult = computeEffectMultiplier(allJewelMods);
  const jewelNames = (jewelAffects ?? []).map((j) => j.jewelName);
  const grants: string[] = [];
  for (const m of allJewelMods) {
    const g = m.match(GRANT_PREFIX);
    if (g) grants.push(m.replace(GRANT_PREFIX, ""));
  }

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
            <li key={i} className="leading-tight">
              <ScaledLine text={stat} mult={effectMult} />
            </li>
          ))}
        </ul>
      )}
      {(grants.length > 0 || jewelNames.length > 0) && (
        <div className="mt-2 border-t border-border pt-1">
          {jewelNames.length > 0 && (
            <div className="text-[9px] uppercase tracking-widest text-purple-400">
              From {jewelNames.join(", ")}
            </div>
          )}
          {grants.map((g, i) => (
            <div key={i} className="text-blue-200 leading-tight">
              <ScaledLine text={g} mult={effectMult} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
