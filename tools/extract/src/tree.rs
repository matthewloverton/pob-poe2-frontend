use anyhow::{bail, Context, Result};
use std::path::{Path, PathBuf};
use std::process::Command;

/// Find the most recent tree version under `<pob>/src/TreeData/`.
pub fn find_latest_tree(pob: &Path) -> Result<(String, PathBuf)> {
    let tree_data = pob.join("src/TreeData");
    let mut versions: Vec<(String, PathBuf)> = std::fs::read_dir(&tree_data)
        .with_context(|| format!("read {}", tree_data.display()))?
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
        .filter_map(|e| {
            let name = e.file_name().into_string().ok()?;
            let path = e.path().join("tree.lua");
            if path.exists() { Some((name, path)) } else { None }
        })
        .collect();
    if versions.is_empty() {
        bail!("no tree versions found under {}", tree_data.display());
    }
    // Version strings sort lexicographically for PoE tree versions (e.g., "0_1", "0_2").
    versions.sort_by(|a, b| a.0.cmp(&b.0));
    Ok(versions.pop().unwrap())
}

pub fn extract_tree(luajit: &Path, tree_lua: &Path, out_json: &Path) -> Result<()> {
    let shim = Path::new(env!("CARGO_MANIFEST_DIR")).join("lua/extract_tree.lua");
    let status = Command::new(luajit)
        .arg(&shim)
        .arg(tree_lua)
        .arg(out_json)
        .status()
        .with_context(|| format!("spawn {}", luajit.display()))?;
    if !status.success() {
        bail!("luajit exited with {}", status);
    }
    Ok(())
}
