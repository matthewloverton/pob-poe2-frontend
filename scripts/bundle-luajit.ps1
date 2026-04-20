# scripts/bundle-luajit.ps1
$ErrorActionPreference = "Stop"

# Primary URL: MSYS2/mingw64 prebuilt LuaJIT (used by Scoop)
$LUAJIT_URL = "https://mirror.msys2.org/mingw/mingw64/mingw-w64-x86_64-luajit-2.1.1744318430-1-any.pkg.tar.zst"
$DEST_DIR = Join-Path $PSScriptRoot "..\src-tauri\binaries"
$TARGET_TRIPLE = "x86_64-pc-windows-msvc"
$FINAL_NAME = "luajit-$TARGET_TRIPLE.exe"

New-Item -ItemType Directory -Force -Path $DEST_DIR | Out-Null

$extractDir = Join-Path $env:TEMP "luajit-extract-$(Get-Random)"
New-Item -ItemType Directory -Force -Path $extractDir | Out-Null

$pkgFile = Join-Path $extractDir "luajit.pkg.tar.zst"
Invoke-WebRequest -Uri $LUAJIT_URL -OutFile $pkgFile

# Use Windows built-in tar (not Git's tar) which supports .tar.zst natively on Windows 11
& "$env:SystemRoot\System32\tar.exe" -xf $pkgFile -C $extractDir

$luajitExe = Get-ChildItem -Path $extractDir -Recurse -Filter "luajit.exe" | Select-Object -First 1
if (-not $luajitExe) { throw "luajit.exe not found in archive" }

$finalPath = Join-Path $DEST_DIR $FINAL_NAME
Copy-Item -Path $luajitExe.FullName -Destination $finalPath -Force

# Copy any DLLs adjacent to luajit.exe (lua51.dll etc.)
Get-ChildItem -Path $luajitExe.DirectoryName -Filter "*.dll" | ForEach-Object {
    Copy-Item -Path $_.FullName -Destination $DEST_DIR -Force
}

Remove-Item -Recurse -Force $extractDir

Write-Host "Bundled $FINAL_NAME to $DEST_DIR"
