import { invoke } from "@tauri-apps/api/core";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { parseBuildXml } from "../xml/xmlImport";
import { serializeBuild } from "../xml/xmlExport";
import { decodeTreeUrl, encodeTreeUrl } from "../xml/treeUrlCodec";
import { decodeBuildCode, encodeBuildCode } from "./buildCode";
import { useBuildStore } from "./buildStore";
import treeData from "../data/tree.json";
import type { NodeId, PassiveTree } from "../types/tree";

const tree = treeData as unknown as PassiveTree;

function findClassStartNodeId(classId: number): NodeId | null {
  const classes = (tree as unknown as { classes?: Array<{ name?: string; integerId?: number }> }).classes;
  if (!Array.isArray(classes)) return null;
  const className = classes.find((c) => c.integerId === classId)?.name;
  if (!className) return null;
  for (const [idStr, node] of Object.entries(tree.nodes)) {
    if (Array.isArray(node.classesStart) && node.classesStart.includes(className)) {
      return Number(idStr);
    }
  }
  return null;
}

function nodesWithClassStart(classId: number, nodes: NodeId[]): NodeId[] {
  const startId = findClassStartNodeId(classId);
  // eslint-disable-next-line no-console
  console.log("[import] classId", classId, "-> class-start nodeId", startId);
  if (startId == null) return nodes;
  if (nodes.includes(startId)) return nodes;
  return [startId, ...nodes];
}

export async function importBuildFromFile(): Promise<void> {
  const path = await openDialog({
    filters: [{ name: "PoB build", extensions: ["xml"] }],
    multiple: false,
  });
  if (!path || typeof path !== "string") return;

  const xml = await invoke<string>("load_build", { path });
  const parsed = parseBuildXml(xml);
  const decoded = decodeTreeUrl(parsed.activeSpec.treeUrl);
  useBuildStore.getState().loadFromParsed(parsed, nodesWithClassStart(decoded.classId, decoded.nodes));
}

export async function importBuildFromCode(code: string): Promise<void> {
  const xml = await decodeBuildCode(code);
  const parsed = parseBuildXml(xml);
  const decoded = decodeTreeUrl(parsed.activeSpec.treeUrl);
  useBuildStore.getState().loadFromParsed(parsed, nodesWithClassStart(decoded.classId, decoded.nodes));
}

export async function exportBuildAsCode(): Promise<string> {
  const state = useBuildStore.getState();
  if (!state.sourceXml) throw new Error("No build loaded.");
  const xml = await buildUpdatedXml(state);
  return encodeBuildCode(xml);
}

async function buildUpdatedXml(state: ReturnType<typeof useBuildStore.getState>): Promise<string> {
  const encodedUrl = "https://www.pathofexile.com/passive-skill-tree/" + encodeTreeUrl({
    version: 6,
    classId: state.classId,
    ascendClassId: state.ascendancyId,
    secondaryAscendClassId: 0,
    nodes: [...state.allocated],
    clusterNodes: [],
    masteryEffects: [],
  });
  return serializeBuild(
    { activeSpec: { classId: state.classId, ascendancyId: state.ascendancyId, treeUrl: "", title: "", treeVersion: "" }, sourceXml: state.sourceXml! },
    { newTreeUrl: encodedUrl },
  );
}

export async function exportBuildToFile(): Promise<void> {
  const state = useBuildStore.getState();
  if (!state.sourceXml) {
    alert("No build loaded.");
    return;
  }
  const path = await saveDialog({
    filters: [{ name: "PoB build", extensions: ["xml"] }],
    defaultPath: "build.xml",
  });
  if (!path) return;

  const xml = await buildUpdatedXml(state);
  await invoke("save_build", { path, xml });
  useBuildStore.setState({ sourceXml: xml, dirty: false });
}
