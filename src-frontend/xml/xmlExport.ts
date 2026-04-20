import type { ParsedBuild } from "./xmlImport";

export interface SerializeOptions {
  newTreeUrl: string;
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
  const newSpecBlock = specBlock.replace(
    /<URL>[\s\S]*?<\/URL>/,
    `<URL>${escapeXmlText(opts.newTreeUrl)}</URL>`,
  );

  const newTreeBlock = treeBlock.slice(0, specStart) + newSpecBlock + treeBlock.slice(specEnd);
  return xml.slice(0, treeStart) + newTreeBlock + xml.slice(treeClose + "</Tree>".length);
}

function escapeXmlText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
