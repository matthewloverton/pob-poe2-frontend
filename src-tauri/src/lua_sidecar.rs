use anyhow::{anyhow, Context, Result};
use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Manager};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tokio::sync::{oneshot, Mutex};

// Resource resolution differs between `tauri dev` and a bundled build. In dev
// the `resources` config doesn't materialise into a predictable folder on
// Windows, so we first try the official Resource base dir and then fall back
// to looking at the sidecar/main.lua path relative to the current working
// directory (the repo root when launched via `just dev`).
fn resolve_sidecar_script(app: &AppHandle) -> Result<PathBuf> {
    if let Ok(path) = app.path().resolve("main.lua", tauri::path::BaseDirectory::Resource) {
        if path.exists() {
            return Ok(path);
        }
        eprintln!("[lua_sidecar] Resource path missing: {}", path.display());
    }
    let candidates = [
        PathBuf::from("sidecar/main.lua"),
        PathBuf::from("../sidecar/main.lua"),
    ];
    for candidate in &candidates {
        if candidate.exists() {
            return Ok(candidate.canonicalize().unwrap_or_else(|_| candidate.clone()));
        }
    }
    Err(anyhow!("could not locate sidecar/main.lua via any known path"))
}

pub struct LuaSidecar {
    child: Mutex<Option<CommandChild>>,
    pending: Arc<Mutex<HashMap<u64, oneshot::Sender<Result<Value, String>>>>>,
    next_id: Mutex<u64>,
}

impl LuaSidecar {
    pub fn new() -> Self {
        Self {
            child: Mutex::new(None),
            pending: Arc::new(Mutex::new(HashMap::new())),
            next_id: Mutex::new(1),
        }
    }

    async fn ensure_spawned(&self, app: &AppHandle) -> Result<()> {
        let mut child_guard = self.child.lock().await;
        if child_guard.is_some() {
            return Ok(());
        }

        let script_path = resolve_sidecar_script(app)?;
        eprintln!("[lua_sidecar] launching with script: {}", script_path.display());

        let cmd = app
            .shell()
            .sidecar("luajit")
            .context("get luajit sidecar command")?
            .arg(&script_path);

        let (mut rx, child) = cmd.spawn().context("spawn luajit")?;

        let pending = Arc::clone(&self.pending);
        tauri::async_runtime::spawn(async move {
            while let Some(event) = rx.recv().await {
                match event {
                    CommandEvent::Stdout(bytes) => {
                        if let Ok(line) = std::str::from_utf8(&bytes) {
                            for part in line.split('\n').filter(|s| !s.trim().is_empty()) {
                                if let Ok(v) = serde_json::from_str::<Value>(part) {
                                    let id = v.get("id").and_then(|i| i.as_u64()).unwrap_or(0);
                                    let mut guard = pending.lock().await;
                                    if let Some(tx) = guard.remove(&id) {
                                        let result = if let Some(err) = v.get("error") {
                                            Err(err.as_str().unwrap_or("unknown error").to_string())
                                        } else {
                                            Ok(v.get("result").cloned().unwrap_or(Value::Null))
                                        };
                                        let _ = tx.send(result);
                                    }
                                } else {
                                    eprintln!("[lua_sidecar] non-JSON stdout: {}", part);
                                }
                            }
                        }
                    }
                    CommandEvent::Stderr(bytes) => {
                        if let Ok(s) = std::str::from_utf8(&bytes) {
                            eprintln!("[lua_sidecar stderr] {}", s.trim_end());
                        }
                    }
                    CommandEvent::Error(err) => {
                        eprintln!("[lua_sidecar error] {}", err);
                    }
                    CommandEvent::Terminated(payload) => {
                        eprintln!("[lua_sidecar terminated] code={:?} signal={:?}", payload.code, payload.signal);
                    }
                    _ => {}
                }
            }
        });

        *child_guard = Some(child);
        Ok(())
    }

    pub async fn invoke(&self, app: &AppHandle, command: &str, payload: Value) -> Result<Value> {
        self.ensure_spawned(app).await?;

        let id = {
            let mut guard = self.next_id.lock().await;
            let id = *guard;
            *guard += 1;
            id
        };

        let (tx, rx) = oneshot::channel();
        self.pending.lock().await.insert(id, tx);

        let request = serde_json::json!({ "id": id, "command": command, "payload": payload });
        let line = format!("{}\n", request);

        {
            let mut child_guard = self.child.lock().await;
            let child = child_guard.as_mut().ok_or_else(|| anyhow!("sidecar not spawned"))?;
            child.write(line.as_bytes()).context("write to sidecar")?;
        }

        match tokio::time::timeout(std::time::Duration::from_secs(5), rx).await {
            Ok(Ok(Ok(value))) => Ok(value),
            Ok(Ok(Err(msg))) => Err(anyhow!(msg)),
            Ok(Err(_)) => Err(anyhow!("sidecar closed channel")),
            Err(_) => Err(anyhow!("sidecar timeout")),
        }
    }
}
