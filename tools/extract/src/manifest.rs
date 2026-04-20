use anyhow::{Context, Result};
use serde_json::json;
use std::path::{Path, PathBuf};
use std::process::Command;

pub fn write_manifest(pob: &Path, out_dir: &Path, tree_version: &str) -> Result<PathBuf> {
    let upstream_sha = Command::new("git")
        .arg("-C")
        .arg(pob)
        .args(["rev-parse", "HEAD"])
        .output()
        .context("git rev-parse")?
        .stdout;
    let upstream_sha = String::from_utf8(upstream_sha)?.trim().to_string();

    let manifest = json!({
        "appVersion": env!("CARGO_PKG_VERSION"),
        "upstreamSha": upstream_sha,
        "treeVersion": tree_version,
        "generatedAt": chrono::Utc::now().to_rfc3339(),
    });

    let path = out_dir.join("manifest.json");
    std::fs::write(&path, serde_json::to_string_pretty(&manifest)?)?;
    Ok(path)
}
