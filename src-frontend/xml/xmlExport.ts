import type { ParsedBuild } from "./xmlImport";
import { useConfigStore } from "../config/configStore";

export interface SerializeOptions {
  newTreeUrl: string;
  /** Map of nodeId → 0/1/2 for Str/Dex/Int picks on "+5 to any Attribute"
   *  and similar multi-option nodes. Serialized as <Overrides> inside <Spec>
   *  using PoB's strNodes/dexNodes/intNodes convention. */
  nodeOverrides?: Record<number, number>;
}

function buildOverridesBlock(overrides: Record<number, number>): string {
  const str: number[] = [], dex: number[] = [], intl: number[] = [];
  for (const [idStr, idx] of Object.entries(overrides)) {
    const id = Number(idStr);
    if (!Number.isFinite(id)) continue;
    if (idx === 0) str.push(id);
    else if (idx === 1) dex.push(id);
    else if (idx === 2) intl.push(id);
  }
  if (str.length + dex.length + intl.length === 0) return "";
  return `<Overrides>
<AttributeOverride strNodes="${str.join(",")}" dexNodes="${dex.join(",")}" intNodes="${intl.join(",")}"/>
</Overrides>`;
}

export function serializeBuild(build: ParsedBuild, opts: SerializeOptions): string {
  const xml = build.sourceXml;

  const treeOpen = xml.match(/<Tree\b[^>]*>/);
  const treeClose = xml.indexOf("</Tree>");
  if (!treeOpen || treeClose < 0) throw new Error("could not locate <Tree> block");

  const treeStart = treeOpen.index!;
  const treeBlock = xml.slice(treeStart, treeClose + "</Tree>".length);

  const activeSpecMatch = treeBlock.match(/activeSpec="(\d+)"/);
  const activeIdx = activeSpecMatch ? Number(activeSpecMatch[1]) : 1;

  const specRegex = /<Spec\b[\s\S]*?<\/Spec>/g;
  let match: RegExpExecArray | null;
  let count = 0;
  let specStart = -1;
  let specEnd = -1;
  while ((match = specRegex.exec(treeBlock)) !== null) {
    count++;
    if (count === activeIdx) {
      specStart = match.index;
      specEnd = match.index + match[0].length;
      break;
    }
  }
  if (specStart < 0) throw new Error("active <Spec> block not found");

  const specBlock = treeBlock.slice(specStart, specEnd);
  // URL replacement — preserve whitespace around the tag body.
  let newSpecBlock = specBlock.replace(
    /<URL>[\s\S]*?<\/URL>/,
    `<URL>${escapeXmlText(opts.newTreeUrl)}</URL>`,
  );
  // Strip any pre-existing <Overrides>...</Overrides> so we don't duplicate
  // when round-tripping, then insert our fresh block after </URL> if we have
  // any picks to record.
  newSpecBlock = newSpecBlock.replace(/<Overrides>[\s\S]*?<\/Overrides>\s*/g, "");
  const overridesBlock = opts.nodeOverrides ? buildOverridesBlock(opts.nodeOverrides) : "";
  if (overridesBlock) {
    newSpecBlock = newSpecBlock.replace(/<\/URL>/, `</URL>\n${overridesBlock}`);
  }

  const newTreeBlock = treeBlock.slice(0, specStart) + newSpecBlock + treeBlock.slice(specEnd);
  let output = xml.slice(0, treeStart) + newTreeBlock + xml.slice(treeClose + "</Tree>".length);

  // Splice in current Config values from configStore.
  const configFragment = useConfigStore.getState().toXml();
  const configRe = /<Config\s*\/>|<Config>[\s\S]*?<\/Config>/;
  if (configRe.test(output)) {
    output = output.replace(configRe, configFragment);
  } else {
    // No existing Config element — insert before the closing root tag.
    output = output.replace(/<\/PathOfBuilding>/, `${configFragment}\n</PathOfBuilding>`);
  }

  return output;
}

function escapeXmlText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
