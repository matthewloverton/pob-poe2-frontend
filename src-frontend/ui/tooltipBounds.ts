// Shared clamp helpers for any floating tooltip (node or item). Tooltips
// should live inside the main content pane (the `<main>` element) so they
// never overflow into the sidebar / toolbar — mouseover-triggered floating
// UI sliding under the sidebar looks like a bug even if it's technically
// inside the window.

export interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Get the clamp rect for the main content area, falling back to the
 *  viewport if the `<main>` element isn't present. Runs on every measurement
 *  call so the bounds stay correct when the sidebar's width toggle flips. */
export function getMainBounds(): Bounds {
  if (typeof document === "undefined") {
    return { left: 0, top: 0, right: 1600, bottom: 900 };
  }
  const main = document.querySelector("main");
  if (!main) {
    return { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
  }
  const r = main.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
}

/** Pick a tooltip anchor {left, top} that keeps the given rect-sized box
 *  inside `bounds`. Starts at (cursorX + 16, cursorY + 16), flips if the
 *  tooltip would cross the right/bottom edges, and clamps to the opposite
 *  edges when both directions would overflow. */
export function clampWithinBounds(
  cursorX: number,
  cursorY: number,
  tooltipW: number,
  tooltipH: number,
  bounds: Bounds,
  gap = 16,
  margin = 8,
): { left: number; top: number } {
  let left = cursorX + gap;
  let top = cursorY + gap;
  if (left + tooltipW > bounds.right - margin) {
    // Flip to the left side of the cursor.
    left = cursorX - tooltipW - gap;
  }
  if (left < bounds.left + margin) left = bounds.left + margin;
  if (left + tooltipW > bounds.right - margin) {
    left = Math.max(bounds.left + margin, bounds.right - tooltipW - margin);
  }
  if (top + tooltipH > bounds.bottom - margin) {
    top = cursorY - tooltipH - gap;
  }
  if (top < bounds.top + margin) top = bounds.top + margin;
  if (top + tooltipH > bounds.bottom - margin) {
    top = Math.max(bounds.top + margin, bounds.bottom - tooltipH - margin);
  }
  return { left, top };
}
