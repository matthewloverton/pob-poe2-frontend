use anyhow::{bail, Context, Result};
use std::path::Path;
use std::process::Command;

pub fn extract_config(luajit: &Path, pob: &Path, out_json: &Path) -> Result<()> {
    let shim = Path::new(env!("CARGO_MANIFEST_DIR")).join("lua/extract_config.lua");
    let config_lua = pob.join("src/Modules/ConfigOptions.lua");
    if !config_lua.exists() {
        bail!("ConfigOptions.lua not found at {}", config_lua.display());
    }
    let status = Command::new(luajit)
        .arg(&shim)
        .arg(&config_lua)
        .arg(out_json)
        .status()
        .with_context(|| format!("spawn {}", luajit.display()))?;
    if !status.success() {
        bail!("luajit exited with {}", status);
    }
    Ok(())
}
