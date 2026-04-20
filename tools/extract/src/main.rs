use anyhow::{Context, Result};
use clap::Parser;
use std::path::PathBuf;

#[derive(Parser, Debug)]
#[command(about = "Extract PoB-PoE2 data artifacts into frontend-consumable JSON")]
struct Args {
    /// Path to PoB-PoE2 repo (usually vendor/PathOfBuilding-PoE2)
    #[arg(long)]
    pob: PathBuf,

    /// Output directory (src-frontend/data)
    #[arg(long)]
    out: PathBuf,

    /// Path to bundled luajit executable
    #[arg(long, default_value = "src-tauri/binaries/luajit-x86_64-pc-windows-msvc.exe")]
    luajit: PathBuf,
}

fn main() -> Result<()> {
    let args = Args::parse();
    std::fs::create_dir_all(&args.out).context("create output dir")?;
    println!("extract: pob={} out={}", args.pob.display(), args.out.display());
    // Real work added in Tasks 5–7
    Ok(())
}
