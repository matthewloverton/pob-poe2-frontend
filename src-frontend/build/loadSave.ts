import { invoke } from "@tauri-apps/api/core";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { parseBuildXml } from "../xml/xmlImport";
import { serializeBuild } from "../xml/xmlExport";
import { decodeTreeUrl, encodeTreeUrl } from "../xml/treeUrlCodec";
import { decodeBuildCode, encodeBuildCode } from "./buildCode";
import { useBuildStore } from "./buildStore";

export async function importBuildFromFile(): Promise<void> {
  const path = await openDialog({
    filters: [{ name: "PoB build", extensions: ["xml"] }],
    multiple: false,
  });
  if (!path || typeof path !== "string") return;

  const xml = await invoke<string>("load_build", { path });
  const parsed = parseBuildXml(xml);
  const decoded = decodeTreeUrl(parsed.activeSpec.treeUrl);
  useBuildStore.getState().loadFromParsed(parsed, decoded.nodes);
}

export async function importBuildFromCode(code: string): Promise<void> {
  const xml = await decodeBuildCode(code);
  const parsed = parseBuildXml(xml);
  const decoded = decodeTreeUrl(parsed.activeSpec.treeUrl);
  useBuildStore.getState().loadFromParsed(parsed, decoded.nodes);
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
