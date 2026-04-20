import { Button } from "./Button";
import { importBuildFromFile, exportBuildToFile } from "../build/loadSave";
import { useBuildStore } from "../build/buildStore";

export function Toolbar() {
  const dirty = useBuildStore((s) => s.dirty);
  const sourceXml = useBuildStore((s) => s.sourceXml);
  const reset = useBuildStore((s) => s.reset);

  return (
    <div className="flex items-center gap-2 border-b border-border bg-bg px-4 py-2">
      <Button onClick={() => importBuildFromFile().catch((e) => alert(String(e)))}>Import</Button>
      <Button onClick={() => exportBuildToFile().catch((e) => alert(String(e)))} disabled={!dirty && !sourceXml}>
        {dirty ? "Save *" : "Save"}
      </Button>
      <Button onClick={() => reset()}>Reset</Button>
    </div>
  );
}
