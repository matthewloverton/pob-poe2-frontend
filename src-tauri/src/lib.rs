mod commands;
mod lua_sidecar;

use lua_sidecar::LuaSidecar;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(LuaSidecar::new())
        .invoke_handler(tauri::generate_handler![
            commands::lua::lua_ping,
            commands::lua::lua_version,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
