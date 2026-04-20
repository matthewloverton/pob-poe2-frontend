import type { PassiveNode } from "../types/tree";

export interface NodeTooltipProps {
  node: PassiveNode;
  x: number;
  y: number;
}

function nodeKind(node: PassiveNode): string {
  if (node.isKeystone) return "Keystone";
  if (node.isNotable) return "Notable";
  if (node.isJewelSocket) return "Socket";
  return "Passive";
}

export function NodeTooltip({ node, x, y }: NodeTooltipProps) {
  const statsArray = Array.isArray(node.stats) ? node.stats : [];
  const name = (node.name as string | undefined) ?? "Unknown";
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
