import type { PassiveNode } from "../types/tree";

export interface NodeTooltipProps {
  node: PassiveNode;
  x: number;
  y: number;
  /** When the node is a multi-option node and the user has already picked one,
   *  show the chosen option's name + stats rather than the generic base copy. */
  overrideIndex?: number;
}

function nodeKind(node: PassiveNode): string {
  if (node.isKeystone) return "Keystone";
  if (node.isNotable) return "Notable";
  if (node.isJewelSocket) return "Socket";
  return "Passive";
}

export function NodeTooltip({ node, x, y, overrideIndex }: NodeTooltipProps) {
  const picked = overrideIndex != null && Array.isArray(node.options)
    ? node.options[overrideIndex]
    : undefined;
  const statsArray = picked?.stats && Array.isArray(picked.stats) ? picked.stats
                   : Array.isArray(node.stats) ? node.stats : [];
  const name = picked?.name ?? (node.name as string | undefined) ?? "Unknown";
  const kind = nodeKind(node);

  return (
    <div
      className="pointer-events-none fixed z-30 border border-border bg-bg-elevated/95 px-3 py-2 font-mono text-xs text-fg shadow-xl backdrop-blur-sm max-w-sm"
      style={{ left: x + 16, top: y + 16 }}
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
    </div>
  );
}
