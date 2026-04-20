import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type Status = "loading" | "ok" | "error";

export function StatusPill() {
  const [status, setStatus] = useState<Status>("loading");
  const [version, setVersion] = useState<string>("");

  useEffect(() => {
    invoke<{ lua: string; jit: string }>("lua_version")
      .then((v) => {
        setVersion(`${v.jit}`);
        setStatus("ok");
      })
      .catch(() => setStatus("error"));
  }, []);

  const dotColor = status === "ok" ? "bg-accent" : status === "error" ? "bg-life" : "bg-fg-muted";

  return (
    <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-fg-muted">
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${dotColor}`} />
      <span>{status === "ok" ? `sidecar · ${version}` : status === "error" ? "sidecar · offline" : "sidecar · starting"}</span>
    </div>
  );
}
