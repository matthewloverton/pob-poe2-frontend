import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ParsedItem } from "./xmlImport";
import treeData from "../data/tree.json";
import type { PassiveTree } from "../types/tree";
import { clampWithinBounds, getMainBounds } from "../ui/tooltipBounds";

// One-time lookup: passive node name → its stats text. Used to attach the
// description of each node an "Allocates X" jewel mod grants.
const ALLOCATES_LOOKUP: Map<string, { kind: string; stats: string[] }> = (() => {
  const m = new Map<string, { kind: string; stats: string[] }>();
  const tree = treeData as unknown as PassiveTree;
  for (const node of Object.values(tree.nodes)) {
    const name = (node as unknown as { name?: string }).name;
    const stats = (node as unknown as { stats?: string[] }).stats;
    if (typeof name !== "string" || !Array.isArray(stats)) continue;
    const kind = (node as unknown as { isKeystone?: boolean; isNotable?: boolean }).isKeystone
      ? "Keystone"
      : (node as unknown as { isNotable?: boolean }).isNotable
      ? "Notable"
      : "Passive";
    // Many nodes share names (generic +10 life); we only store the first.
    // Jewels' "Allocates X" almost always references a notable or keystone,
    // which have unique names, so this is fine in practice.
    if (!m.has(name)) m.set(name, { kind, stats });
  }
  return m;
})();

const RARITY_COLOR: Record<ParsedItem["rarity"], string> = {
  NORMAL: "text-fg",
  MAGIC: "text-blue-300",
  RARE: "text-yellow-200",
  UNIQUE: "text-orange-400",
  RELIC: "text-purple-400",
};

export function ItemTooltip({
  item,
  x,
  y,
  isShaman = false,
}: {
  item: ParsedItem;
  x: number;
  y: number;
  /** Bonded: runes only apply to the Druid Shaman ascendancy. When true we
   *  render them in purple; for every other class we hide them entirely
   *  since they have no effect and just create noise. */
  isShaman?: boolean;
}) {
  // Jewel mods of the form "Allocates <Node Name>" get a companion tooltip
  // showing the granted node's kind + stats — helpful for nodes like
  // Megalomaniac that allocate multiple notables without repeating their
  // text on the jewel itself. Scan implicits + explicits; ignore mods where
  // we couldn't resolve the named node.
  const allocates = useMemo(() => {
    const out: Array<{ name: string; kind: string; stats: string[] }> = [];
    const scan = (line: { text: string }) => {
      const m = line.text.match(/^Allocates\s+(.+?)\s*$/i);
      if (!m) return;
      const name = m[1]!.trim();
      const node = ALLOCATES_LOOKUP.get(name);
      if (node) out.push({ name, kind: node.kind, stats: node.stats });
    };
    item.implicits.forEach(scan);
    item.explicits.forEach(scan);
    return out;
  }, [item]);

  // Measure the rendered tooltip and clamp it inside the viewport. First
  // render positions naively at (x+16, y+16), then a layout effect reads
  // the actual bounding rect and adjusts. Avoids edge clipping without
  // hardcoding a maximum size — tooltips with lots of mods get tall.
  const ref = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x + 16, top: y + 16 });
  const [subTop, setSubTop] = useState<number | null>(null);
  const [flipped, setFlipped] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const bounds = getMainBounds();
    // Reserve room for sub-tooltips on the right so the main tooltip flips
    // early enough for both panels to fit on the same side of the cursor.
    const SUB_W = 300;
    const reservedRight = allocates.length > 0 ? SUB_W + 8 : 0;
    const next = clampWithinBounds(x, y, rect.width + reservedRight, rect.height, bounds);
    const didFlip = next.left < x; // flipped = sub-tooltips go to the left
    if (next.left !== pos.left || next.top !== pos.top) setPos(next);
    if (didFlip !== flipped) setFlipped(didFlip);

    // Slide the sub-tooltips stack upward when anchoring to the main
    // tooltip's top would overflow the bottom of the content area.
    if (subRef.current) {
      const subRect = subRef.current.getBoundingClientRect();
      const margin = 8;
      let nextSubTop = next.top;
      if (next.top + subRect.height > bounds.bottom - margin) {
        nextSubTop = Math.max(bounds.top + margin, bounds.bottom - subRect.height - margin);
      }
      if (nextSubTop !== subTop) setSubTop(nextSubTop);
    } else if (subTop !== null) {
      setSubTop(null);
    }
  }, [x, y, item, isShaman, pos.left, pos.top, flipped, allocates.length, subTop]);

  const MAIN_W = 340;
  const SUB_W = 300;
  const subLeft = flipped
    ? pos.left - SUB_W - 8
    : pos.left + MAIN_W + 8;

  return createPortal(
    <>
    <div
      ref={ref}
      className="pointer-events-none fixed z-[100] border border-border bg-bg-elevated/95 px-3 py-2 font-mono text-[11px] text-fg shadow-xl backdrop-blur-sm"
      style={{ left: pos.left, top: pos.top, width: MAIN_W }}
    >
      <div className={`text-sm font-semibold ${RARITY_COLOR[item.rarity]}`}>{item.name}</div>
      {item.baseType !== item.name && (
        <div className={`text-[10px] ${RARITY_COLOR[item.rarity]} opacity-80`}>{item.baseType}</div>
      )}
      {item.itemClass && (
        <div className="mt-1 text-[9px] uppercase tracking-widest text-fg-muted">{item.itemClass}</div>
      )}

      {item.requirements.level != null && (
        <div className="mt-2 text-[10px] text-fg-dim">
          Requires{" "}
          {item.requirements.level != null && <span>Level {item.requirements.level}</span>}
          {item.requirements.strength ? <span className="text-red-400">, {item.requirements.strength} Str</span> : null}
          {item.requirements.dexterity ? <span className="text-green-400">, {item.requirements.dexterity} Dex</span> : null}
          {item.requirements.intelligence ? <span className="text-blue-400">, {item.requirements.intelligence} Int</span> : null}
        </div>
      )}

      {item.properties.length > 0 && (
        <div className="mt-2 space-y-0.5">
          {item.properties.map((p, i) => (
            <div key={i} className="flex justify-between gap-4">
              <span className="text-fg-muted">{p.key}</span>
              <span className="text-fg">{p.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Enchant / rune mods — socketed into the item; shown as their own
          block in gold/amber above implicits. Bonded: runes only apply to
          the Druid Shaman ascendancy — rendered in purple when active,
          and hidden entirely for every other class (they just add noise). */}
      {(() => {
        const visibleRunes = item.runes.filter((m) => !m.bonded || isShaman);
        if (visibleRunes.length === 0) return null;
        return (
          <>
            <div className="my-2 border-t border-border" />
            {visibleRunes.map((m, i) => (
              <div key={i} className={m.bonded ? "text-purple-400" : "text-amber-300"}>
                {m.text}
              </div>
            ))}
          </>
        );
      })()}

      {item.implicits.length > 0 && (
        <>
          <div className="my-2 border-t border-border" />
          {item.implicits.map((m, i) => (
            <div key={i} className="text-cyan-300">{m.text}</div>
          ))}
        </>
      )}

      {item.explicits.length > 0 && (
        <>
          <div className="my-2 border-t border-border" />
          {item.explicits.map((m, i) => (
            <div
              key={i}
              className={
                m.mutated
                  ? "text-red-400"  // mutated: corruption result, red
                  : m.fractured
                  ? "text-yellow-300"  // fractured mods: golden
                  : m.desecrated
                  ? "text-green-400 bg-green-950/40"  // desecrated: green tint w/ flush green bg
                  : "text-blue-200"    // regular explicit
              }
            >
              {m.text}
            </div>
          ))}
        </>
      )}

      {item.corrupted && (
        <>
          <div className="my-2 border-t border-border" />
          <div className="text-red-500">Corrupted</div>
        </>
      )}
    </div>
    {/* Stacked sub-tooltips for each "Allocates X" mod. They sit to the
        right (or left if the main tooltip flipped), anchored to the same
        top edge, so the user sees the granted passive's stats without
        needing to remember the name. */}
    {allocates.length > 0 && (
      <div
        ref={subRef}
        className="pointer-events-none fixed z-[100] flex flex-col gap-2"
        style={{ left: subLeft, top: subTop ?? pos.top, width: SUB_W }}
      >
        {allocates.map((a, i) => (
          <div
            key={i}
            className="border border-border bg-bg-elevated/95 px-3 py-2 font-mono text-[11px] text-fg shadow-xl backdrop-blur-sm"
          >
            <div className="text-[9px] uppercase tracking-widest text-fg-muted">{a.kind}</div>
            <div className="text-sm font-semibold text-fg">{a.name}</div>
            <div className="mt-1 space-y-0.5">
              {a.stats.map((s, j) => (
                <div key={j} className="text-blue-200">{s}</div>
              ))}
            </div>
          </div>
        ))}
      </div>
    )}
    </>,
    document.body,
  );
}
