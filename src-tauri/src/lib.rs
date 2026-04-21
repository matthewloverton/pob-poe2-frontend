mod commands;
mod lua_sidecar;

use lua_sidecar::LuaSidecar;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(LuaSidecar::new())
        .invoke_handler(tauri::generate_handler![
            commands::lua::lua_ping,
            commands::lua::lua_version,
            commands::lua::lua_eval,
            commands::lua::lua_load_pob,
            commands::lua::lua_load_build,
            commands::lua::lua_get_stats,
            commands::lua::lua_compute_stats,
            commands::lua::lua_dump_output_keys,
            commands::lua::lua_set_main_skill,
            commands::lua::lua_set_allocated,
            commands::lua::lua_get_alloc_state,
            commands::fs::load_build,
            commands::fs::save_build,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
