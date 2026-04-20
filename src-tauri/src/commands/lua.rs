use crate::lua_sidecar::LuaSidecar;
use serde_json::Value;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn lua_ping(app: AppHandle, sidecar: State<'_, LuaSidecar>) -> Result<Value, String> {
    sidecar.invoke(&app, "ping", Value::Null).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn lua_version(app: AppHandle, sidecar: State<'_, LuaSidecar>) -> Result<Value, String> {
    sidecar.invoke(&app, "version", Value::Null).await.map_err(|e| e.to_string())
}
