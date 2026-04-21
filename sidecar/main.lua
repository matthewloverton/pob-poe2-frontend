io.stdout:setvbuf("no")

-- ---------------------------------------------------------------------------
-- Minimal JSON codec. Hand-rolled because LuaJIT doesn't bundle cjson and we
-- don't want to wire up a C module just to round-trip small payloads.
-- Encoder handles: nil, booleans, numbers, strings, arrays (1-indexed contiguous
-- integer keys), and string-keyed tables. Decoder handles the standard JSON
-- subset produced by serde_json on the Rust side.
-- ---------------------------------------------------------------------------

local json = {}

local function json_escape(s)
    return (s:gsub('\\', '\\\\'):gsub('"', '\\"'):gsub('\n', '\\n'):gsub('\r', '\\r'):gsub('\t', '\\t'))
end

local function is_array(t)
    local n = 0
    for _ in pairs(t) do n = n + 1 end
    for i = 1, n do if t[i] == nil then return false end end
    return true
end

function json.encode(v)
    local t = type(v)
    if v == nil then return "null" end
    if t == "boolean" then return v and "true" or "false" end
    if t == "number" then return tostring(v) end
    if t == "string" then return '"' .. json_escape(v) .. '"' end
    if t == "table" then
        if is_array(v) then
            local parts = {}
            for i = 1, #v do parts[i] = json.encode(v[i]) end
            return "[" .. table.concat(parts, ",") .. "]"
        else
            local parts = {}
            for k, val in pairs(v) do
                parts[#parts+1] = '"' .. json_escape(tostring(k)) .. '":' .. json.encode(val)
            end
            return "{" .. table.concat(parts, ",") .. "}"
        end
    end
    error("unencodable type: " .. t)
end

function json.decode(s)
    local pos = 1
    local function skip_ws()
        while pos <= #s do
            local c = s:sub(pos, pos)
            if c == " " or c == "\t" or c == "\n" or c == "\r" then pos = pos + 1 else break end
        end
    end
    local parse
    local function parse_string()
        pos = pos + 1 -- opening quote
        local out = {}
        while pos <= #s do
            local c = s:sub(pos, pos)
            if c == '"' then pos = pos + 1; return table.concat(out) end
            if c == "\\" then
                local nx = s:sub(pos+1, pos+1)
                if nx == '"' then out[#out+1] = '"'
                elseif nx == "\\" then out[#out+1] = "\\"
                elseif nx == "/" then out[#out+1] = "/"
                elseif nx == "n" then out[#out+1] = "\n"
                elseif nx == "r" then out[#out+1] = "\r"
                elseif nx == "t" then out[#out+1] = "\t"
                elseif nx == "b" then out[#out+1] = "\b"
                elseif nx == "f" then out[#out+1] = "\f"
                elseif nx == "u" then
                    local hex = s:sub(pos+2, pos+5)
                    out[#out+1] = string.char(tonumber(hex, 16) % 256)
                    pos = pos + 4
                else error("bad escape \\" .. nx .. " at " .. pos) end
                pos = pos + 2
            else
                out[#out+1] = c
                pos = pos + 1
            end
        end
        error("unterminated string")
    end
    local function parse_number()
        local start = pos
        if s:sub(pos, pos) == "-" then pos = pos + 1 end
        while pos <= #s and s:sub(pos, pos):match("[%d%.eE%+%-]") do pos = pos + 1 end
        return tonumber(s:sub(start, pos - 1))
    end
    local function parse_object()
        pos = pos + 1 -- {
        local obj = {}
        skip_ws()
        if s:sub(pos, pos) == "}" then pos = pos + 1; return obj end
        while true do
            skip_ws()
            local key = parse_string()
            skip_ws()
            if s:sub(pos, pos) ~= ":" then error("expected : at " .. pos) end
            pos = pos + 1
            obj[key] = parse()
            skip_ws()
            local ch = s:sub(pos, pos)
            if ch == "," then pos = pos + 1
            elseif ch == "}" then pos = pos + 1; return obj
            else error("expected , or } at " .. pos) end
        end
    end
    local function parse_array()
        pos = pos + 1 -- [
        local arr = {}
        skip_ws()
        if s:sub(pos, pos) == "]" then pos = pos + 1; return arr end
        while true do
            arr[#arr+1] = parse()
            skip_ws()
            local ch = s:sub(pos, pos)
            if ch == "," then pos = pos + 1
            elseif ch == "]" then pos = pos + 1; return arr
            else error("expected , or ] at " .. pos) end
        end
    end
    parse = function()
        skip_ws()
        local c = s:sub(pos, pos)
        if c == '"' then return parse_string() end
        if c == "{" then return parse_object() end
        if c == "[" then return parse_array() end
        if c == "t" then if s:sub(pos, pos+3) == "true" then pos = pos + 4; return true end end
        if c == "f" then if s:sub(pos, pos+4) == "false" then pos = pos + 5; return false end end
        if c == "n" then if s:sub(pos, pos+3) == "null" then pos = pos + 4; return nil end end
        if c == "-" or c:match("%d") then return parse_number() end
        error("unexpected char " .. tostring(c) .. " at pos " .. pos)
    end
    return parse()
end

-- ---------------------------------------------------------------------------
-- Dispatcher
-- ---------------------------------------------------------------------------

local handlers = {}

function handlers.ping(_payload)
    return { ok = true }
end

function handlers.version(_payload)
    return {
        lua = _VERSION,
        jit = (jit and jit.version) or "no jit",
    }
end

-- Ad-hoc Lua execution. Accepts { code = "..." } and returns whatever the
-- chunk returns (must be JSON-encodable). Primarily for bootstrapping PoB's
-- HeadlessWrapper before we lock down a specific command set.
function handlers.eval(payload)
    if type(payload) ~= "table" or type(payload.code) ~= "string" then
        error("eval: payload.code must be a string")
    end
    local fn, err = loadstring(payload.code, "eval")
    if not fn then error("compile: " .. tostring(err)) end
    local ok, result = pcall(fn)
    if not ok then error("runtime: " .. tostring(result)) end
    return result
end

-- Load PoB's HeadlessWrapper.lua so the sidecar can parse builds and compute
-- stats. Because HeadlessWrapper.lua does `dofile("Launch.lua")` and PoB's own
-- modules assume the CWD is the PoB src/ directory, we patch dofile/loadfile/
-- io.open to rewrite relative paths against `payload.pob_src` before delegating
-- to the originals. package.path is also prepended so require() finds modules.
local pob_loaded = false
function handlers.load_pob(payload)
    if pob_loaded then return { ok = true, already = true } end
    if type(payload) ~= "table" or type(payload.pob_src) ~= "string" then
        error("load_pob: payload.pob_src must be a string")
    end
    local POB_SRC = payload.pob_src
    local last = POB_SRC:sub(-1)
    if last ~= "/" and last ~= "\\" then POB_SRC = POB_SRC .. "/" end

    local function is_absolute(p)
        return p:match("^[A-Za-z]:") ~= nil or p:sub(1, 1) == "/" or p:sub(1, 1) == "\\"
    end
    local function pob_path(p)
        if type(p) ~= "string" then return p end
        if is_absolute(p) then return p end
        return POB_SRC .. p
    end

    local orig_dofile = _G.dofile
    local orig_loadfile = _G.loadfile
    local orig_io_open = io.open

    _G.dofile = function(p) return orig_dofile(pob_path(p)) end
    _G.loadfile = function(p, ...) return orig_loadfile(pob_path(p), ...) end
    io.open = function(p, mode) return orig_io_open(pob_path(p), mode) end

    -- PoB ships its pure-Lua deps (xml, dkjson, base64, sha2, socket...) under
    -- runtime/lua/ and its C modules (lcurl, lua-utf8, lzip...) under runtime/.
    -- Both are siblings of src/, so derive the runtime root from POB_SRC.
    local RUNTIME = POB_SRC:gsub("src[/\\]?$", "runtime/")
    package.path = POB_SRC .. "?.lua;" .. POB_SRC .. "?/init.lua;"
        .. RUNTIME .. "lua/?.lua;" .. RUNTIME .. "lua/?/init.lua;"
        .. (package.path or "")
    package.cpath = RUNTIME .. "?.dll;" .. (package.cpath or "")

    local ok, err = pcall(orig_dofile, POB_SRC .. "HeadlessWrapper.lua")
    if not ok then
        error("HeadlessWrapper bootstrap failed: " .. tostring(err))
    end
    pob_loaded = true

    return {
        ok = true,
        has_build = _G.build ~= nil,
        has_mainObject = _G.mainObject ~= nil,
        prompt = _G.mainObject and _G.mainObject.promptMsg or nil,
    }
end

-- Load a PoB XML build. The frontend owns the XML (parsed from imports or saved
-- state) and ships it here as a string; the Lua side plumbs it through
-- loadBuildFromXML and runs a frame so calcs settle.
function handlers.load_build(payload)
    if not pob_loaded then error("load_build: call load_pob first") end
    if type(payload) ~= "table" or type(payload.xml) ~= "string" then
        error("load_build: payload.xml must be a string")
    end
    local name = type(payload.name) == "string" and payload.name or "imported"
    loadBuildFromXML(payload.xml, name)
    -- Don't settle or pick a skill here — parsing is cheap, but settling is not.
    -- The frontend calls compute_stats afterwards so the "Calculating Stats"
    -- loader phase is the slow one (matches what the user sees).
    return { ok = true, class = _G.build and _G.build.spec and _G.build.spec.curClassName or nil }
end

-- Run the full calc pipeline on the currently-loaded build. Split from load_build
-- so the UI can label the two phases (fast parse vs slow calc) accurately.
function handlers.compute_stats(_payload)
    if not pob_loaded then error("compute_stats: call load_pob first") end
    if not _G.build then error("compute_stats: no build loaded") end
    settle_calcs()
    pick_best_main_skill()
    return handlers.get_stats(nil)
end

-- loadBuildFromXML leaves calcs stale. PoB normally settles over many frames
-- of its main loop; headless we have to push them through manually. Empirically
-- ~20 frames + an explicit BuildOutput() lands real endgame numbers; 3 frames
-- returns naked-character values because items/allocations haven't propagated.
function settle_calcs()
    if not _G.build then return end
    _G.build.buildFlag = true
    -- 10 frames was empirically enough to land stable numbers for a 157-node
    -- Warrior build. Was 20; bump back up if stats start lagging one tick.
    for _ = 1, 10 do runCallback("OnFrame") end
    if _G.build.calcsTab and _G.build.calcsTab.BuildOutput then
        _G.build.calcsTab:BuildOutput()
    end
end

-- Iterate every enabled socket group, swap it into mainSocketGroup, run a
-- lightweight recalc, and remember the one with the highest CombinedDPS. Used
-- to auto-select the likely damage skill on build import so the sidebar's
-- headline DPS is meaningful without the user hunting through the dropdown.
-- Uses only 1 frame + BuildOutput per trial (vs 20 for a full settle) to keep
-- the total under a second even on builds with 10+ skills.
function pick_best_main_skill()
    if not (_G.build and _G.build.skillsTab and _G.build.skillsTab.socketGroupList) then return end
    local groups = _G.build.skillsTab.socketGroupList
    if #groups == 0 then return end
    local best_idx = _G.build.mainSocketGroup or 1
    local best_dps = -1
    for i = 1, #groups do
        if groups[i].enabled ~= false then
            _G.build.mainSocketGroup = i
            _G.build.buildFlag = true
            runCallback("OnFrame")
            if _G.build.calcsTab and _G.build.calcsTab.BuildOutput then
                _G.build.calcsTab:BuildOutput()
            end
            local out = _G.build.calcsTab and _G.build.calcsTab.mainOutput
            local dps = out and (out.CombinedDPS or out.TotalDPS) or 0
            if type(dps) == "number" and dps > best_dps then
                best_dps = dps
                best_idx = i
            end
        end
    end
    _G.build.mainSocketGroup = best_idx
    settle_calcs()
end

-- Debug helper: returns every scalar key in build.calcsTab.mainOutput so we
-- can see what PoE2's calc engine actually names its fields (vs. PoE1).
function handlers.dump_output_keys(_payload)
    if not pob_loaded then error("dump_output_keys: call load_pob first") end
    local out = _G.build and _G.build.calcsTab and _G.build.calcsTab.mainOutput
    if not out then return { ready = false } end
    local keys = {}
    for k, v in pairs(out) do
        local t = type(v)
        if t == "number" or t == "string" or t == "boolean" then
            keys[#keys + 1] = k .. " = " .. tostring(v)
        end
    end
    table.sort(keys)
    return { ready = true, keys = keys }
end

-- Curated slice of build.calcsTab.mainOutput so we never round-trip the whole
-- blob (it's huge, cyclic, and full of tables that blow up JSON encoding).
-- Extend this whitelist as the sidebar surfaces more numbers.
local STAT_FIELDS = {
    "AverageDamage", "TotalDPS", "CombinedDPS", "FullDPS",
    "Life", "LifeUnreserved", "LifeRegenRecovery",
    "EnergyShield", "EnergyShieldRegenRecovery",
    "Mana", "ManaUnreserved", "ManaRegenRecovery",
    "Spirit", "SpiritUnreserved",
    "Armour", "Evasion", "Ward",
    "FireResist", "ColdResist", "LightningResist", "ChaosResist",
    "Str", "Dex", "Int",
    "TotalEHP",
    "PhysicalMaximumHitTaken", "FireMaximumHitTaken", "ColdMaximumHitTaken",
    "LightningMaximumHitTaken", "ChaosMaximumHitTaken",
}

local function collect_skill_groups()
    local groups = {}
    if _G.build and _G.build.skillsTab and _G.build.skillsTab.socketGroupList then
        for i, g in ipairs(_G.build.skillsTab.socketGroupList) do
            groups[i] = {
                i = i,
                label = g.label or g.displayLabel or "(no label)",
                enabled = g.enabled and true or false,
            }
        end
    end
    return groups
end

-- PoB's own allocation counter. Returns 6 values:
--   used, ascUsed, secondaryAscUsed, sockets, weaponSet1Used, weaponSet2Used
-- Weapon-set bank membership is indicated by node.allocMode (1 or 2).
local function count_points()
    local spec = _G.build and _G.build.spec
    if not spec or type(spec.CountAllocNodes) ~= "function" then return {} end
    local ok, main, ascUsed, secondaryAsc, sockets, ws1, ws2 =
        pcall(function() return spec:CountAllocNodes() end)
    if not ok then return {} end

    main = main or 0
    ws1 = ws1 or 0
    ws2 = ws2 or 0
    -- PoB's raw `used` double-counts weapon-set bank nodes (they're non-ascend
    -- so they land in main AND in their WS bucket). Mirror Build.lua's display
    -- formula: subtract the smaller of the two banks so the shared overlap is
    -- removed and `normal_main` reads as the main-tree-only count.
    local normal_main = main - math.min(ws1, ws2)

    local level = _G.build.characterLevel or 1
    -- PoE2 awards 24 bonus passives via acts (matches PoB showing 123/123 at lv100).
    local max_main = math.max(level - 1 + 24, 0)
    return {
        main = normal_main,
        max_main = max_main,
        ascend = ascUsed or 0,
        max_ascend = 8, -- 2 per trial, 4 trials
        secondaryAscend = secondaryAsc or 0,
        sockets = sockets or 0,
        weaponSet1 = ws1,
        weaponSet2 = ws2,
    }
end

function handlers.get_stats(_payload)
    if not pob_loaded then error("get_stats: call load_pob first") end
    if not (_G.build and _G.build.calcsTab and _G.build.calcsTab.mainOutput) then
        return { ready = false }
    end
    local out = _G.build.calcsTab.mainOutput
    local picked = {}
    for _, key in ipairs(STAT_FIELDS) do
        local v = out[key]
        if type(v) == "number" or type(v) == "string" or type(v) == "boolean" then
            picked[key] = v
        end
    end
    local mainSkillName = nil
    local env = _G.build.calcsTab and _G.build.calcsTab.mainEnv
    if env and env.player and env.player.mainSkill
        and env.player.mainSkill.activeEffect and env.player.mainSkill.activeEffect.grantedEffect then
        mainSkillName = env.player.mainSkill.activeEffect.grantedEffect.name
    end
    return {
        ready = true,
        level = _G.build.characterLevel,
        class = _G.build.spec and _G.build.spec.curClassName or nil,
        ascendancy = _G.build.spec and _G.build.spec.curAscendClassName or nil,
        stats = picked,
        skills = collect_skill_groups(),
        mainSocketGroup = _G.build.mainSocketGroup,
        mainSkillName = mainSkillName,
        points = count_points(),
    }
end

-- Replace the allocated-nodes set for the current build and recompute stats.
-- The frontend owns the allocation state; this just pushes deltas into PoB's
-- spec and re-runs the calc pipeline so mainOutput reflects them.
function handlers.set_allocated(payload)
    if not pob_loaded then error("set_allocated: call load_pob first") end
    if type(payload) ~= "table" or type(payload.ids) ~= "table" then
        error("set_allocated: payload.ids must be an array of node ids")
    end
    if not (_G.build and _G.build.spec) then
        error("set_allocated: build.spec not ready")
    end
    local spec = _G.build.spec
    local nodes = spec.nodes or spec.tree and spec.tree.nodes or {}
    local alloc = {}
    for _, id in ipairs(payload.ids) do
        local node = nodes[id] or nodes[tostring(id)]
        if node then alloc[id] = node end
    end
    spec.allocNodes = alloc
    if spec.BuildAllDependsAndPaths then
        pcall(function() spec:BuildAllDependsAndPaths() end)
    end
    if spec.BuildClusterJewelGraphs then
        pcall(function() spec:BuildClusterJewelGraphs() end)
    end
    -- Don't re-pick the best skill on every allocation change — it'd iterate
    -- every socket group ~N times per click and rarely flips the answer.
    -- The skill picked at load_build stays unless the user overrides it.
    settle_calcs()
    return handlers.get_stats(nil)
end

-- Returns the authoritative allocated set + weapon-set mode map after PoB has
-- parsed an imported XML. PoE2 tree URLs only encode main-tree nodes, so the
-- frontend loses the WS1/WS2 slice unless it reconciles with this afterwards.
function handlers.get_alloc_state(_payload)
    if not pob_loaded then error("get_alloc_state: call load_pob first") end
    local spec = _G.build and _G.build.spec
    if not spec or not spec.allocNodes then return { allocated = {}, modes = {} } end
    local allocated, modes = {}, {}
    for id, node in pairs(spec.allocNodes) do
        allocated[#allocated + 1] = id
        if node.allocMode and node.allocMode ~= 0 then
            modes[tostring(id)] = node.allocMode
        end
    end
    return { allocated = allocated, modes = modes }
end

function handlers.set_main_skill(payload)
    if not pob_loaded then error("set_main_skill: call load_pob first") end
    if type(payload) ~= "table" or type(payload.index) ~= "number" then
        error("set_main_skill: payload.index must be a number")
    end
    if not (_G.build and _G.build.skillsTab and _G.build.skillsTab.socketGroupList) then
        error("set_main_skill: build or skillsTab not ready")
    end
    local groups = _G.build.skillsTab.socketGroupList
    if payload.index < 1 or payload.index > #groups then
        error("set_main_skill: index " .. payload.index .. " out of range (1.." .. #groups .. ")")
    end
    _G.build.mainSocketGroup = payload.index
    settle_calcs()
    return handlers.get_stats(nil)
end

local function respond(id, result, err)
    local payload
    if err then
        payload = json.encode({ id = id, error = err })
    else
        payload = json.encode({ id = id, result = result })
    end
    io.write(payload, "\n")
    io.flush()
end

for line in io.lines() do
    local ok, req = pcall(json.decode, line)
    if not ok then
        respond(0, nil, "malformed JSON: " .. tostring(req))
    else
        local id = type(req.id) == "number" and req.id or 0
        local cmd = type(req.command) == "string" and req.command or nil
        if not cmd then
            respond(id, nil, "missing command")
        elseif not handlers[cmd] then
            respond(id, nil, "unknown command: " .. cmd)
        else
            local okh, result = pcall(handlers[cmd], req.payload)
            if okh then
                local okj, encoded = pcall(json.encode, result)
                if okj then io.write('{"id":' .. id .. ',"result":' .. encoded .. '}\n'); io.flush()
                else respond(id, nil, "encode: " .. tostring(encoded)) end
            else
                respond(id, nil, tostring(result))
            end
        end
    end
end
