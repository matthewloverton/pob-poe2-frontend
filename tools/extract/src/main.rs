use anyhow::{Context, Result};
use clap::Parser;
use std::path::PathBuf;

mod tree;
mod sprites;
mod manifest;

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

    let (version, tree_lua) = tree::find_latest_tree(&args.pob)?;
    println!("extracting tree version {}", version);

    tree::extract_tree(&args.luajit, &tree_lua, &args.out.join("tree.json"))?;

    let tree_dir = tree_lua.parent().unwrap();
    let copied = sprites::copy_sprites(tree_dir, &args.out)?;
    sprites::write_sprite_manifest(&args.out, &copied)?;
    println!("copied {} sprite files", copied.len());

    manifest::write_manifest(&args.pob, &args.out, &version)?;
    println!("wrote manifest.json");
    Ok(())
}
