use std::path::PathBuf;

#[tauri::command]
pub async fn load_build(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_build(path: String, xml: String) -> Result<(), String> {
    if let Some(parent) = PathBuf::from(&path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, xml).map_err(|e| e.to_string())
}
