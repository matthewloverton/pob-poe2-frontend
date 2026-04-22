use anyhow::{bail, Context, Result};
use std::path::Path;
use std::process::Command;

pub fn extract_socketables(luajit: &Path, pob: &Path, out_json: &Path) -> Result<()> {
    let shim = Path::new(env!("CARGO_MANIFEST_DIR")).join("lua/extract_socketables.lua");
    let runes = pob.join("src/Data/ModRunes.lua");
    if !runes.exists() {
        bail!("ModRunes.lua not found at {}", runes.display());
    }
    let status = Command::new(luajit)
        .arg(&shim)
        .arg(&runes)
        .arg(out_json)
        .status()
        .with_context(|| format!("spawn {}", luajit.display()))?;
    if !status.success() {
        bail!("luajit exited with {}", status);
    }
    Ok(())
}
