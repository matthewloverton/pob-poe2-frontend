import { XMLParser } from "fast-xml-parser";

export interface ParsedSpec {
  classId: number;
  ascendancyId: number;
  treeUrl: string;
  title: string;
  treeVersion: string;
}

export interface ParsedBuild {
  activeSpec: ParsedSpec;
  sourceXml: string;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseAttributeValue: true,
  trimValues: true,
});

function firstOrOnly<T>(value: T | T[] | undefined): T | undefined {
  if (value == null) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

export function parseBuildXml(xml: string): ParsedBuild {
  const raw = parser.parse(xml);
  const root = raw.PathOfBuilding2 ?? raw.PathOfBuilding;
  if (!root) throw new Error("missing <PathOfBuilding> / <PathOfBuilding2> root element");

  const tree = root.Tree;
  if (!tree) throw new Error("missing <Tree> element");

  const activeSpecIdx = Number(tree["@_activeSpec"] ?? 1);
  const specs = Array.isArray(tree.Spec) ? tree.Spec : [tree.Spec];
  const spec = specs[activeSpecIdx - 1] ?? specs[0];
  if (!spec) throw new Error("no <Spec> found in <Tree>");

  const urlValue = firstOrOnly(spec.URL);
  const treeUrl = typeof urlValue === "string" ? urlValue
                 : (urlValue && "#text" in (urlValue as object)) ? String((urlValue as { "#text": unknown })["#text"])
                 : String(urlValue ?? "");

  return {
    activeSpec: {
      classId: Number(spec["@_classId"] ?? 0),
      ascendancyId: Number(spec["@_ascendClassId"] ?? 0),
      treeUrl: treeUrl.trim(),
      title: String(spec["@_title"] ?? ""),
      treeVersion: String(spec["@_treeVersion"] ?? ""),
    },
    sourceXml: xml,
  };
}
