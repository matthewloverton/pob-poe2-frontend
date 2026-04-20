use anyhow::{anyhow, Context, Result};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Manager};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tokio::sync::{oneshot, Mutex};

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

        let script_path = app
            .path()
            .resolve("main.lua", tauri::path::BaseDirectory::Resource)
            .context("resolve sidecar script path")?;

        let cmd = app
            .shell()
            .sidecar("luajit")
            .context("get luajit sidecar command")?
            .arg(script_path);

        let (mut rx, child) = cmd.spawn().context("spawn luajit")?;

        let pending = Arc::clone(&self.pending);
        tauri::async_runtime::spawn(async move {
            while let Some(event) = rx.recv().await {
                if let CommandEvent::Stdout(bytes) = event {
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
                            }
                        }
                    }
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
