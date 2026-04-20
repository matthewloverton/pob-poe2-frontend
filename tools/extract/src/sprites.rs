use anyhow::{Context, Result};
use serde_json::json;
use std::path::{Path, PathBuf};

pub fn copy_sprites(tree_dir: &Path, out_dir: &Path) -> Result<Vec<String>> {
    let src = tree_dir.join("assets");
    let dst = out_dir.join("sprites");
    std::fs::create_dir_all(&dst).context("create sprites dir")?;

    let mut copied = Vec::new();
    if !src.exists() {
        return Ok(copied); // some tree versions may not have assets yet
    }
    for entry in walkdir::WalkDir::new(&src).into_iter().filter_map(|e| e.ok()) {
        if !entry.file_type().is_file() {
            continue;
        }
        let rel = entry.path().strip_prefix(&src)?;
        let target = dst.join(rel);
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::copy(entry.path(), &target)?;
        copied.push(rel.to_string_lossy().into_owned());
    }
    Ok(copied)
}

pub fn write_sprite_manifest(out_dir: &Path, copied: &[String]) -> Result<PathBuf> {
    let manifest_path = out_dir.join("sprites.json");
    let manifest = json!({ "files": copied });
    std::fs::write(&manifest_path, serde_json::to_string_pretty(&manifest)?)?;
    Ok(manifest_path)
}
