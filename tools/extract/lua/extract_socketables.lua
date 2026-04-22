-- Args: mod_runes_lua_path, out_json_path
local runes_path, out_json_path = ...
assert(runes_path and out_json_path,
    "usage: extract_socketables.lua <ModRunes.lua> <out.json>")

-- ModRunes.lua is self-contained: a pure `return { ... }` table keyed by
-- socketable name, with an inner table keyed by slot type (helmet, boots,
-- body armour, focus, ring, amulet, weapon, etc.). Each inner entry has a
-- `type` field plus array-indexed mod lines.
local chunk, err = loadfile(runes_path)
if not chunk then error("loadfile failed: " .. tostring(err)) end
local data = chunk()
assert(type(data) == "table", "ModRunes.lua did not return a table")

local out = {}
for name, bySlot in pairs(data) do
    if type(bySlot) == "table" then
        local slots = {}
        for slotType, entry in pairs(bySlot) do
            if type(entry) == "table" then
                local mods = {}
                for i, line in ipairs(entry) do
                    if type(line) == "string" then mods[i] = line end
                end
                slots[slotType] = {
                    type = type(entry.type) == "string" and entry.type or "Rune",
                    mods = mods,
                }
            end
        end
        out[name] = { slots = slots }
    end
end

-- JSON encoder (same shape as existing extractors; handles inf/nan → null).
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

local function count(t) local n = 0 for _ in pairs(t) do n = n + 1 end return n end

local f = assert(io.open(out_json_path, "wb"))
f:write(encode(out))
f:close()
print(string.format("wrote %s (%d socketables)", out_json_path, count(out)))
