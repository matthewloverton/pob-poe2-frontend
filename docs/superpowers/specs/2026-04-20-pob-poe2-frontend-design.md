# PoB-PoE2 Visual Overhaul Frontend — Design

**Status:** Approved (design phase)
**Date:** 2026-04-20
**Author:** Wil
**Scope:** Greenfield desktop application — `pob-poe2-frontend`

## Goal

Build a visually-overhauled desktop frontend for Path of Building (PoE2 fork) that preserves the existing feature set and interaction model of upstream PoB-PoE2 but replaces the SimpleGraphic-based UI with a modern, industrial-aesthetic interface. Users exporting builds from our app must be able to open them in upstream PoB unchanged (full XML round-trip), and vice versa.

Upstream: https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2 (MIT).

## Non-goals

- Not a fork of PoB-PoE2's Lua codebase. We consume PoB's data and (later) calc engine; we do not rewrite its math in TypeScript.
- Not a cross-platform deliverable. Windows-only for v1.x.
- Not a PoE1 tool. Only PoE2.
- Not a live-service / cloud app. Fully local, offline-capable.

## Locked decisions

| Decision | Choice | Rationale |
|---|---|---|
| Product framing | Visual overhaul (same features, same flows, reskinned) | Matches user intent; keeps scope tractable |
| Build-file compatibility | Full two-way XML compatibility with upstream PoB | Non-negotiable for community interop (pobb.in, shared builds) |
| OS target | Windows only (v1.x) | Where the user and most PoB users live |
| Desktop stack | Tauri 2 + React 18 + TypeScript | Small binaries, modern web tooling, Rust host for I/O & sidecar |
| Tree rendering | PixiJS 8 (WebGL) + `pixi-viewport` | Handles ~1500 nodes and thousands of edges smoothly |
| State | Zustand 5 | Simple store, no boilerplate |
| XML | `fast-xml-parser` v4 | Round-trip build/parse, no C deps |
| Styling | Tailwind CSS v4 (CSS-first config, `@tailwindcss/vite`) | Fast dev loop, small output; v4's `@theme` fits our design-token needs |
| Aesthetic | Industrial / data-dense (flat, high-contrast, mono numerics, thin borders, Linear-like) | Chosen during brainstorming — contrasts PoB's ornate defaults |
| Upstream sync | PoB-PoE2 as git submodule; Rust extractor CLI converts `tree.lua` → `tree.json` + sprite atlas at build time | Keeps frontend free of Lua at runtime (v0.1) while staying 1:1 with upstream data |
| Calc engine (future) | Headless PoB-PoE2 via bundled LuaJIT sidecar, JSON-RPC over stdio | Leverages `src/HeadlessWrapper.lua` — no need to port calc math |
| LuaJIT plumbing in v0.1 | Bundled and wired up with trivial `ping`/`version` commands only | De-risks milestone B by proving the packaging + IPC before it has to carry calc weight |

## Milestones

v0.1 is the focus of this spec. v0.2 and v0.3 are scoped to lock v0.1's architecture against painting-into-a-corner.

### v0.1 — Tree viewer / editor (this spec)
Standalone passive tree interaction. Pan/zoom/allocate, shortest-path preview, import & export PoB XML, ascendancies rendered inline on the main tree (as PoB does). No calcs. LuaJIT sidecar present but only handles ping.

### v0.2 — Read-only build viewer (future)
Above, plus display of gear, skills, and headline calc stats. Calcs via headless PoB sidecar. Non-editable items/skills.

### v0.3 — Editable MVP (future)
Fully editable build: item editor, gem links, config tab, live calcs. First version usable as a daily driver.

## Architecture

```
┌─────────────────────────── Tauri desktop app (Windows) ───────────────────────────┐
│                                                                                   │
│   ┌──────────────── WebView (React + TS) ────────────────┐                        │
│   │  Passive-tree canvas (PixiJS + pixi-viewport)        │                        │
│   │  Build state (Zustand)                               │  <—— tree.json         │
│   │  XML import/export (fast-xml-parser)                 │       sprites.json     │
│   │  Industrial design system (Tailwind v4 + custom)     │       manifest.json    │
│   └─────────────────────────┬────────────────────────────┘                        │
│                             │  Tauri invoke() / event                             │
│   ┌─────────────────────────▼────────────────────────────┐                        │
│   │           Rust host (Tauri backend)                  │                        │
│   │  File I/O (builds/*.xml, settings.json)              │                        │
│   │  Lua sidecar manager (spawn, stdio JSON-RPC)         │                        │
│   │  Extractor CLI (separate bin: tools/extract)         │                        │
│   └─────────────────────────┬────────────────────────────┘                        │
│                             │  stdio JSON-RPC                                     │
│   ┌─────────────────────────▼────────────────────────────┐                        │
│   │         LuaJIT sidecar (bundled via externalBin)     │                        │
│   │  v0.1: ping / version only                           │                        │
│   │  v0.2+: headless PoB-PoE2 calcs                      │                        │
│   └──────────────────────────────────────────────────────┘                        │
└───────────────────────────────────────────────────────────────────────────────────┘

        Build-time (CI or manual `just extract`):
        ┌─────────────────────────────────────────────┐
        │  Git submodule: PathOfBuilding-PoE2         │
        │  Extractor (Rust CLI, spawns LuaJIT once)   │
        │            │                                │
        │            ▼                                │
        │  src-frontend/data/tree.json + sprites      │
        │  (checked into repo)                        │
        └─────────────────────────────────────────────┘
```

Three processes at runtime (WebView ↔ Rust host ↔ LuaJIT sidecar). Extractor runs only at build time — no Lua at runtime in v0.1 beyond the ping-only sidecar.

### Tauri sidecar mechanics
- LuaJIT binary bundled via `tauri.conf.json > bundle.externalBin`, target-triple suffixed (`luajit-x86_64-pc-windows-msvc.exe`).
- Spawned once on first `invoke("lua_*")` call through `app.shell().sidecar("luajit").spawn()`; kept alive with stdin/stdout attached.
- Protocol: line-delimited JSON. Each request `{id, command, payload}` → response `{id, result}` or `{id, error}`.
- Capability: `shell:allow-spawn` for the `luajit` sidecar in `capabilities/default.json`.

### Build-time extractor
- Crate at `tools/extract/` (separate binary from the Tauri app).
- `tree_extractor`: spawns `luajit` on vendored PoB, runs a small Lua shim that loads the target version's `src/TreeData/<ver>/tree.lua`, `json.encode`s the resulting tree table, and writes `src-frontend/data/tree.json`. Handles the `local tree=` / `return tree` wrapper in the source file.
- `sprite_extractor`: copies PoB's atlas PNGs + emits `sprites.json` mapping `skill` id → atlas region.
- `version_stamp`: writes upstream submodule commit SHA and tree version into `manifest.json`.
- Driven by `just extract` (or `cargo run -p extract`). Outputs checked into git.

## Components

### Build-time (`tools/extract/`)
- `tree_extractor` — tree.lua → tree.json
- `sprite_extractor` — atlas PNG passthrough + sprites.json manifest
- `version_stamp` — manifest.json with upstream SHA + tree version

### Rust host (`src-tauri/`)
- `fs_commands` — `load_build`, `save_build`, `list_builds`. Reads/writes `%APPDATA%/PoBViewer/builds/*.xml`.
- `settings` — persisted JSON settings file.
- `lua_sidecar` — spawns bundled LuaJIT, owns stdin/stdout, implements `invoke(cmd, payload) -> Result<json>` over newline-delimited JSON-RPC. v0.1 handlers: `ping`, `version`.

### LuaJIT sidecar (`sidecar/`)
- `main.lua` — stdin line-loop dispatcher. v0.1: two handlers. v0.2+: wraps `HeadlessWrapper.lua` for calc commands.

### Frontend (`src-frontend/`)
- `data/` — static imports: `tree.json`, `sprites.json`, `manifest.json`, typed as `PassiveTree`.
- `tree/`
  - `TreeRenderer` — Pixi app + `pixi-viewport`, viewport culling, draws nodes + connections.
  - `NodeSprite` — single node, state variants (normal/notable/keystone/mastery × unallocated/allocated/pathing/hovered).
  - `ConnectionRenderer` — straight lines for cross-group/cross-orbit edges; circular arcs for same-group-same-orbit edges.
  - `TreeInteraction` — hover/click/drag-pan/wheel-zoom, emits store actions.
- `build/`
  - `buildStore` (Zustand) — `{ class, ascendancy, allocatedNodes: Set<NodeId>, sourceXml, dirty }`.
  - `pathing` — pure `shortestPath(from, to, graph)` BFS over `linkedId`.
- `xml/`
  - `xmlImport` — parses `<PathOfBuilding>` root; v0.1 only reads `<Tree>/<Spec>/<URL>`.
  - `xmlExport` — round-trip safe: if `sourceXml` is present, only rewrite the sections we own.
  - `treeUrlCodec` — encodes/decodes pathofexile.com tree URLs (base64 node-id layout).
- `ui/` — design-system primitives matching the industrial aesthetic (`Panel`, `StatRow`, `Button`, `Tabs`), plus layout (`Sidebar`, `Toolbar`).
- `app/` — root layout, Pixi↔React wiring, keyboard shortcuts.

### Explicitly out of v0.1
Items, gems/skills, calcs, config tab, node search, filtering, jewels, bandit/quests, multi-build tabs, build comparison, auto-updater, telemetry, installer signing.

## Data flow

### Tree positioning math (standard GGG schema, identical to PoB)
```
world_x = group.x + orbitRadii[node.orbit] * sin(orbitAnglesByOrbit[node.orbit][node.orbitIndex])
world_y = group.y - orbitRadii[node.orbit] * cos(orbitAnglesByOrbit[node.orbit][node.orbitIndex])
```
Applied to every node — class starts, ascendancies (positioned on tree edges per upstream), and main tree alike.

### Connection rendering
For each `node.linkedId` edge: if both endpoints share a `group` AND share an `orbit`, draw a **circular arc** along the orbit radius; otherwise a **straight line**. This is what makes the tree circular rather than a spiderweb.

### Startup
1. React mounts → load `data/*.json` (static imports).
2. Zustand initialized with empty build.
3. `TreeRenderer` bootstraps Pixi, loads atlas as `PIXI.Texture`.
4. Tauri `invoke("lua_ping")` → Rust spawns LuaJIT (lazy, once) → returns version → footer pill updates.
5. UI ready.

### XML import
1. User picks file → Rust reads raw XML → returns to frontend.
2. `xmlImport.parse(xml)` → intermediate object.
3. Extract `<Tree>/<Spec active>/<URL>`.
4. `treeUrlCodec.decode(url)` → `{ class, ascendancy, allocatedNodeIds[] }`.
5. `buildStore.set({ class, ascendancy, allocatedNodes, sourceXml: raw, dirty: false })`.
6. Renderer re-renders; camera centers on class start.

### Tree interaction
- **Hover** → `pathing.shortestPath(allocated, hoveredId, graph)` → nodes tinted "pathing".
- **Click** on path node → allocate the whole path; store updates; `dirty = true`.
- **Click** on allocated leaf → deallocate; store updates.
- Renderer subscribes to allocation set; diffs and retints only affected sprites.

### Save (round-trip preservation)
`xmlExport.build(state)`:
- If `sourceXml` present: parse, mutate `<Tree>/<Spec>/<URL>` only, serialize back. All other sections (items, calcs, notes, config…) pass through untouched. Enables ping-pong with upstream PoB without data loss.
- If fresh build: emit a minimal `<PathOfBuilding>` doc.

### Error paths
| Failure | Handling |
|---|---|
| Malformed XML on import | Toast "couldn't parse build"; store unchanged |
| Build's tree version ≠ ours | Warn user; render with best-effort mapping; skip unknown nodes |
| Sidecar spawn fails | Status pill red; retry button; app still functional in v0.1 |
| File I/O failure | Toast + log to Tauri log |
| Tree URL decode failure | Toast; XML imports without tree allocation rather than failing whole import |

## Testing

### Unit (Vitest)
- `treeUrlCodec` — round-trip real pathofexile.com tree URLs; decode→encode byte-equal.
- `xmlImport` / `xmlExport` — fixture builds in `test/fixtures/`; import→export deep-equal (preservation regression guard).
- `pathing.shortestPath` — synthetic graphs + real-tree snapshot for known allocation cases.

### Integration
- Build pipeline: extractor run in CI against submodule produces `tree.json` matching expected top-level shape. Guards against upstream format drift.
- Sidecar smoke: spawn → send `ping` → assert response within 2s.

### Manual acceptance ("looks correct")
Three reference builds (witch, mercenary, ranger). Screenshot ours next to PoB at equivalent zoom. Pass criteria: node positions within 1 px, connections visually match, ascendancies positioned correctly.

### Not tested in v0.1
- No Pixi rendering unit tests (add if a visual bug recurs).
- No Playwright E2E (manual acceptance above).
- No performance benchmarks ("feels smooth on dev machine" suffices).

### CI (GitHub Actions, Windows runner)
- On PR: `cargo check`, `cargo test`, `pnpm typecheck`, `pnpm test`.
- On main: above + `cargo build --release` smoke build.
- Weekly: re-run extractor; if `tree.json` differs from committed, open PR labeled `upstream-sync`.

## Risks and open questions

- **LuaJIT Windows bundling quirks.** Target-triple naming is documented but edge cases (missing DLLs, path resolution) could bite. Mitigation: trivial ping command in v0.1 surfaces issues early.
- **PoE2 tree URL byte layout.** Less documented than PoE1; reverse-engineering from upstream `PassiveSpec:Load` may be needed. Not a blocker, just a time sink for `treeUrlCodec`.
- **Sprite atlas licensing.** PoB's atlas PNGs derive from GGG assets. MIT-licensed within the PoB project. We'll ship them with attribution in `ABOUT` and respect any upstream notice.
- **Upstream schema drift.** Weekly extractor CI catches it automatically.

## Dependencies

### Runtime
Tauri 2.9+, React 18, TypeScript 5, PixiJS 8.16+, pixi-viewport, Zustand 5, fast-xml-parser 4, Tailwind CSS 4 (`@tailwindcss/vite`).

### Build
Rust (stable), LuaJIT (for extractor + bundled runtime), `just`, pnpm.

## Appendix — key upstream files referenced

- `src/TreeData/<version>/tree.lua` — primary tree data source.
- `src/Classes/PassiveTree.lua` — upstream tree loader; reference for constants (`orbitRadii`, `orbitAnglesByOrbit`, `skillsPerOrbit`).
- `src/Classes/PassiveSpec.lua` — allocation logic; reference for `:Load(xml)` XML shape.
- `src/HeadlessWrapper.lua` — sidecar entry point (v0.2+).
- `LICENSE.md` — MIT.
