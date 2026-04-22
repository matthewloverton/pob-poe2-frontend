import type { NodeKind, NodeVisualState } from "./NodeSprite";

// Maps a node's (kind, visual state, ascendancy membership) to the logical
// frame-image name emitted by the background extractor. Ascendancy nodes use
// their own ornate per-ascendancy frames (Small for normal passives, Large
// for notables); everything else uses the generic PoB frame sheets.
//
// Note the suffix conventions differ between sheets:
//   - PSSkillFrame (normal): "PSSkillFrame" / "PSSkillFrameActive" / "PSSkillFrameHighlighted"
//   - Notable/Jewel/Keystone: "{Kind}FrameUnallocated" / "CanAllocate" / "Allocated"
//   - Per-ascendancy:         "{Ascend}Frame{Small|Large}{Normal|CanAllocate|Allocated}"
export function frameNameFor(
  kind: NodeKind,
  state: NodeVisualState,
  ascendancyName?: string,
): string | null {
  const canAlloc = state === "pathing" || state === "hovered";
  const allocated = state === "allocated";
  // Use CanAllocate art for "removing" too so the red preview gets a clear
  // "it's about to be unallocated" border — the color comes from the overlay
  // tint drawn on top, not the frame itself.
  const showCanAlloc = canAlloc || state === "removing";

  if (ascendancyName) {
    const size = kind === "notable" ? "Large" : "Small";
    const suffix = allocated ? "Allocated" : showCanAlloc ? "CanAllocate" : "Normal";
    return `${ascendancyName}Frame${size}${suffix}`;
  }
  if (kind === "keystone") {
    return `KeystoneFrame${allocated ? "Allocated" : showCanAlloc ? "CanAllocate" : "Unallocated"}`;
  }
  if (kind === "notable") {
    return `NotableFrame${allocated ? "Allocated" : showCanAlloc ? "CanAllocate" : "Unallocated"}`;
  }
  if (kind === "socket") {
    return `JewelFrame${allocated ? "Allocated" : showCanAlloc ? "CanAllocate" : "Unallocated"}`;
  }
  // Normal passive — PSSkillFrame sheet uses "Active" / "Highlighted" / base.
  if (allocated) return "PSSkillFrameActive";
  if (showCanAlloc) return "PSSkillFrameHighlighted";
  return "PSSkillFrame";
}

// Target on-screen diameter for each kind's frame in tree units. Tuned so the
// ornate ring sits comfortably outside the icon — the art needs ~40-50% of
// the frame diameter to be the visible ornament, so frame has to be ~2x the
// icon diameter for the ornament to read clearly.
export const FRAME_DIAMETER: Record<NodeKind, number> = {
  keystone: 220,
  notable: 170,
  socket: 150,
  normal: 90,
};

// Ascendancy frames are drawn larger so their per-class ornate detail reads.
// Indexed separately because ascendancy nodes use their own art regardless
// of the underlying kind. `middle` is the gold-diamond "AscendancyMiddle"
// asset used for the ascendancy root node (clicking it swaps ascendancy).
export const ASCEND_FRAME_DIAMETER = {
  small: 110,
  large: 200,
  middle: 140,
};

// Ascendancy root nodes use a fixed gold-diamond frame and don't show an
// icon inside — click behaviour differs (swap ascendancy, not allocate).
export const ASCEND_ROOT_FRAME = "AscendancyMiddle";
