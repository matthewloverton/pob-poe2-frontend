-- Args: config_options_lua_path, out_json_path
local config_lua_path, out_json_path = ...
assert(config_lua_path and out_json_path,
    "usage: extract_config.lua <ConfigOptions.lua> <out.json>")

-- Strip PoB inline color codes: ^xRRGGBB, ^1..^9, ^7
local function stripColor(s)
    if type(s) ~= "string" then return s end
    return (s:gsub("%^x%x%x%x%x%x%x", ""):gsub("%^%d", ""))
end

-- Stub globals referenced at ConfigOptions load time.
-- We only need the file to PARSE and POPULATE the configSettings table.
-- Apply functions, tooltip callbacks, etc. never run — they stay as functions
-- in the table and we drop them when serializing.
local dataStub = setmetatable({}, { __index = function(_, k)
    if k == "bossSkills" then return setmetatable({}, { __index = function() return { tooltip = "" } end }) end
    if k == "monsterLifeTable" then return setmetatable({}, { __index = function() return 0 end }) end
    if k == "questRewards" then return {} end
    return setmetatable({}, { __index = function() return {} end })
end })

_G.data = dataStub
_G.modLib = setmetatable({}, { __index = function() return function() end end })
_G.StripEscapes = function(s) return s end
_G.colorCodes = setmetatable({}, { __index = function() return "" end })
_G.s_format = string.format
_G.launch = { devMode = false }
_G.SkillType = setmetatable({}, { __index = function(_, k) return k end })

-- ConfigOptions.lua ends with `return configSettings`. Some PoB versions keep
-- it module-local and return the table; loadfile+call captures that.
local chunk, err = loadfile(config_lua_path)
if not chunk then error("loadfile failed: " .. tostring(err)) end
local settings = chunk()
assert(type(settings) == "table", "ConfigOptions.lua did not return a table")

-- Walk into sections. Each entry is either { section = "...", col = N }
-- (section header) or an option { var, type, label, ... }.
local sections, current = {}, nil
for _, entry in ipairs(settings) do
    if entry.section then
        current = { name = entry.section, options = {} }
        sections[#sections+1] = current
    elseif entry.var and entry.type and current then
        local o = {
            var = entry.var,
            type = entry.type,
            label = stripColor(entry.label),
            tooltip = stripColor(type(entry.tooltip) == "string" and entry.tooltip or nil),
        }
        if entry.type == "check" then
            o.default = entry.defaultState == true
        elseif entry.type == "count" then
            if type(entry.defaultState) == "number" then o.default = entry.defaultState end
        elseif entry.type == "list" then
            o.defaultIndex = entry.defaultIndex
            if type(entry.list) == "table" then
                local ls = {}
                for i, item in ipairs(entry.list) do
                    ls[i] = { val = item.val, label = stripColor(item.label) }
                end
                o.list = ls
            end
        end
        -- Capture gate fields for future conditional visibility (unused in v0.1.4).
        local gate = {}
        if entry.ifSkillData then gate.ifSkillData = entry.ifSkillData end
        if entry.ifCond then gate.ifCond = entry.ifCond end
        if entry.ifMod then gate.ifMod = entry.ifMod end
        if next(gate) then o.gate = gate end
        current.options[#current.options+1] = o
    end
end

-- JSON encoder (same shape as extract_tree.lua)
local function encode(v)
    local t = type(v)
    if t == "nil" then return "null" end
    if t == "boolean" then return v and "true" or "false" end
    if t == "number" then
        if v ~= v or v == math.huge or v == -math.huge then return "null" end
        return tostring(v)
    end
    if t == "string" then
        return '"' .. v:gsub('\\', '\\\\'):gsub('"', '\\"')
                        :gsub('\n', '\\n'):gsub('\r', '\\r')
                        :gsub('\t', '\\t') .. '"'
    end
    if t == "table" then
        local n, max = 0, 0
        for k, _ in pairs(v) do
            n = n + 1
            if type(k) == "number" and k > max then max = k end
        end
        if n == max and n > 0 then
            local parts = {}
            for i = 1, max do parts[i] = encode(v[i]) end
            return "[" .. table.concat(parts, ",") .. "]"
        else
            local parts = {}
            for k, val in pairs(v) do
                if type(val) ~= "function" then
                    parts[#parts+1] = encode(tostring(k)) .. ":" .. encode(val)
                end
            end
            return "{" .. table.concat(parts, ",") .. "}"
        end
    end
    return "null"
end

-- encode_array: always emit a JSON array, even for empty tables
local function encode_array(arr)
    local parts = {}
    for i = 1, #arr do parts[i] = encode(arr[i]) end
    return "[" .. table.concat(parts, ",") .. "]"
end

-- Build top-level JSON with options always as arrays
local sec_parts = {}
for _, sec in ipairs(sections) do
    sec_parts[#sec_parts+1] = '{"name":' .. encode(sec.name) .. ',"options":' .. encode_array(sec.options) .. '}'
end
local out = '{"sections":[' .. table.concat(sec_parts, ",") .. "]}"

local f = assert(io.open(out_json_path, "wb"))
f:write(out)
f:close()
print(string.format("wrote %s (%d sections)", out_json_path, #sections))
