import { Assets, Rectangle, Texture, type TextureSource } from "pixi.js";

export interface AtlasFrame {
  a: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AtlasManifest {
  atlasSize: number;
  atlases: string[];
  frames: Record<string, AtlasFrame>;
}

const ATLAS_BASE = "/tree-icons/atlas/";

export async function loadAtlases(): Promise<{
  manifest: AtlasManifest;
  sources: TextureSource[];
}> {
  const manifest: AtlasManifest = await fetch(`${ATLAS_BASE}manifest.json`).then((r) => r.json());
  const sources = await Promise.all(
    manifest.atlases.map((name) =>
      Assets.load<Texture>(`${ATLAS_BASE}${name}`).then((t) => t.source),
    ),
  );
  return { manifest, sources };
}

// Build a Texture that references a sub-rect of the given atlas source. All
// Textures sharing a source let Pixi batch their draw calls.
export function frameTexture(sources: TextureSource[], frame: AtlasFrame): Texture {
  return new Texture({
    source: sources[frame.a],
    frame: new Rectangle(frame.x, frame.y, frame.w, frame.h),
  });
}

// Manifest keys are stored as POSIX paths with .webp extension; tree.json node
// icons are DDS paths. Normalise a node icon path to its manifest key.
export function manifestKey(iconPath: string): string {
  return iconPath.replace(/\\/g, "/").replace(/\.dds$/i, ".webp");
}
