use crate::lua_sidecar::LuaSidecar;
use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn lua_ping(app: AppHandle, sidecar: State<'_, LuaSidecar>) -> Result<Value, String> {
    sidecar.invoke(&app, "ping", Value::Null).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn lua_version(app: AppHandle, sidecar: State<'_, LuaSidecar>) -> Result<Value, String> {
    sidecar.invoke(&app, "version", Value::Null).await.map_err(|e| e.to_string())
}

// Run arbitrary Lua in the sidecar. Intended for bootstrapping / debugging; not
// a production surface. Accepts a code string, returns whatever the chunk
// returns, as long as the value is JSON-encodable.
#[tauri::command]
pub async fn lua_eval(
    app: AppHandle,
    sidecar: State<'_, LuaSidecar>,
    code: String,
) -> Result<Value, String> {
    sidecar
        .invoke(&app, "eval", json!({ "code": code }))
        .await
        .map_err(|e| e.to_string())
}

// Walk up from the current working directory looking for the submodule root
// (vendor/PathOfBuilding-PoE2/src/HeadlessWrapper.lua), so both `cargo run`
// from src-tauri/ and `tauri dev` from the repo root resolve correctly.
fn resolve_pob_src() -> Option<PathBuf> {
    let mut dir = std::env::current_dir().ok()?;
    for _ in 0..6 {
        let candidate = dir.join("vendor/PathOfBuilding-PoE2/src/HeadlessWrapper.lua");
        if candidate.exists() {
            return candidate.parent().map(PathBuf::from);
        }
        dir = dir.parent()?.to_path_buf();
    }
    None
}

#[tauri::command]
pub async fn lua_load_pob(
    app: AppHandle,
    sidecar: State<'_, LuaSidecar>,
) -> Result<Value, String> {
    let pob_src = resolve_pob_src()
        .ok_or_else(|| "could not locate vendor/PathOfBuilding-PoE2/src".to_string())?;
    let pob_src_str = pob_src.to_string_lossy().replace('\\', "/");
    eprintln!("[lua_sidecar] load_pob → {}", pob_src_str);
    sidecar
        .invoke(&app, "load_pob", json!({ "pob_src": pob_src_str }))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn lua_load_build(
    app: AppHandle,
    sidecar: State<'_, LuaSidecar>,
    xml: String,
    name: Option<String>,
) -> Result<Value, String> {
    let payload = json!({ "xml": xml, "name": name.unwrap_or_else(|| "imported".into()) });
    sidecar
        .invoke(&app, "load_build", payload)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn lua_get_stats(
    app: AppHandle,
    sidecar: State<'_, LuaSidecar>,
) -> Result<Value, String> {
    sidecar
        .invoke(&app, "get_stats", Value::Null)
        .await
        .map_err(|e| e.to_string())
}

// Settles calcs + auto-picks the highest-DPS skill, then returns a fresh
// snapshot. Split from load_build so the loader UI can show distinct phases.
#[tauri::command]
pub async fn lua_compute_stats(
    app: AppHandle,
    sidecar: State<'_, LuaSidecar>,
) -> Result<Value, String> {
    sidecar
        .invoke(&app, "compute_stats", Value::Null)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn lua_dump_output_keys(
    app: AppHandle,
    sidecar: State<'_, LuaSidecar>,
) -> Result<Value, String> {
    sidecar
        .invoke(&app, "dump_output_keys", Value::Null)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn lua_get_jewel_sockets(
    app: AppHandle,
    sidecar: State<'_, LuaSidecar>,
) -> Result<Value, String> {
    sidecar
        .invoke(&app, "get_jewel_sockets", Value::Null)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn lua_set_main_skill(
    app: AppHandle,
    sidecar: State<'_, LuaSidecar>,
    index: u32,
) -> Result<Value, String> {
    sidecar
        .invoke(&app, "set_main_skill", json!({ "index": index }))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn lua_get_alloc_state(
    app: AppHandle,
    sidecar: State<'_, LuaSidecar>,
) -> Result<Value, String> {
    sidecar
        .invoke(&app, "get_alloc_state", Value::Null)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn lua_set_allocated(
    app: AppHandle,
    sidecar: State<'_, LuaSidecar>,
    ids: Vec<u32>,
    overrides: Option<std::collections::HashMap<String, u32>>,
) -> Result<Value, String> {
    // overrides comes over the wire as { "722": 0, ... } because JS object
    // keys are strings. The Lua side copes with either numeric or string keys
    // via tonumber(), so we just pass it through unchanged.
    let payload = match overrides {
        Some(m) if !m.is_empty() => json!({ "ids": ids, "overrides": m }),
        _ => json!({ "ids": ids }),
    };
    sidecar
        .invoke(&app, "set_allocated", payload)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn lua_set_config(
    app: AppHandle,
    sidecar: State<'_, LuaSidecar>,
    values: std::collections::HashMap<String, serde_json::Value>,
) -> Result<Value, String> {
    sidecar
        .invoke(&app, "set_config", json!({ "values": values }))
        .await
        .map_err(|e| e.to_string())
}
