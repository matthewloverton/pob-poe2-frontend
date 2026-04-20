import { Button } from "./Button";
import {
  importBuildFromFile,
  exportBuildToFile,
  importBuildFromCode,
  exportBuildAsCode,
} from "../build/loadSave";
import { useBuildStore } from "../build/buildStore";
import { useDialogStore } from "./dialogStore";

async function handleImportCode() {
  const { openPrompt, pushToast } = useDialogStore.getState();
  const code = await openPrompt("Import build code", "Paste a PoB-PoE2 / pobb.in build code");
  if (!code) return;
  try {
    await importBuildFromCode(code);
    pushToast("Build imported.", "success");
  } catch (e) {
    pushToast("Couldn't decode build code: " + String(e), "error");
  }
}

async function handleCopyCode() {
  const { pushToast } = useDialogStore.getState();
  try {
    const code = await exportBuildAsCode();
    await navigator.clipboard.writeText(code);
    pushToast("Build code copied to clipboard.", "success");
  } catch (e) {
    pushToast("Couldn't copy build code: " + String(e), "error");
  }
}

async function handleImportFile() {
  const { pushToast } = useDialogStore.getState();
  try {
    await importBuildFromFile();
  } catch (e) {
    pushToast(String(e), "error");
  }
}

async function handleSave() {
  const { pushToast } = useDialogStore.getState();
  try {
    await exportBuildToFile();
    pushToast("Build saved.", "success");
  } catch (e) {
    pushToast(String(e), "error");
  }
}

export function Toolbar() {
  const dirty = useBuildStore((s) => s.dirty);
  const sourceXml = useBuildStore((s) => s.sourceXml);
  const reset = useBuildStore((s) => s.reset);
  const hasBuild = Boolean(sourceXml) || dirty;

  return (
    <div className="flex items-center gap-2 border-b border-border bg-bg px-4 py-2">
      <Button onClick={handleImportFile}>Import XML</Button>
      <Button onClick={handleImportCode}>Import Code</Button>
      <Button onClick={handleSave} disabled={!hasBuild}>
        {dirty ? "Save *" : "Save"}
      </Button>
      <Button onClick={handleCopyCode} disabled={!hasBuild}>Copy Code</Button>
      <Button onClick={() => reset()}>Reset</Button>
    </div>
  );
}
