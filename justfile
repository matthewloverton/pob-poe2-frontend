default:
    @just --list

install:
    pnpm install

extract:
    cargo run -p extract -- --pob vendor/PathOfBuilding-PoE2 --out src-frontend/data

bundle-luajit:
    pwsh scripts/bundle-luajit.ps1

dev: install
    pnpm tauri dev

build: install
    pnpm tauri build

test:
    pnpm test
    cargo test
