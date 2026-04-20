import { Button } from "./Button";
import {
  importBuildFromFile,
  exportBuildToFile,
  importBuildFromCode,
  exportBuildAsCode,
} from "../build/loadSave";
import { useBuildStore } from "../build/buildStore";

async function handleImportCode() {
  const code = window.prompt("Paste a PoB-PoE2 build code (pobb.in):");
  if (!code) return;
  try {
    await importBuildFromCode(code);
  } catch (e) {
    alert("Couldn't decode build code: " + String(e));
  }
}

async function handleCopyCode() {
  try {
    const code = await exportBuildAsCode();
    await navigator.clipboard.writeText(code);
    alert("Build code copied to clipboard.");
  } catch (e) {
    alert("Couldn't copy build code: " + String(e));
  }
}

export function Toolbar() {
  const dirty = useBuildStore((s) => s.dirty);
  const sourceXml = useBuildStore((s) => s.sourceXml);
  const reset = useBuildStore((s) => s.reset);
  const hasBuild = Boolean(sourceXml) || dirty;

  return (
    <div className="flex items-center gap-2 border-b border-border bg-bg px-4 py-2">
      <Button onClick={() => importBuildFromFile().catch((e) => alert(String(e)))}>Import XML</Button>
      <Button onClick={handleImportCode}>Import Code</Button>
      <Button onClick={() => exportBuildToFile().catch((e) => alert(String(e)))} disabled={!hasBuild}>
        {dirty ? "Save *" : "Save"}
      </Button>
      <Button onClick={handleCopyCode} disabled={!hasBuild}>Copy Code</Button>
      <Button onClick={() => reset()}>Reset</Button>
    </div>
  );
}
