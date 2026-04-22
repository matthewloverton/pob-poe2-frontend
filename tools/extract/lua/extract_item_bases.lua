-- Extracts every item base from PoB's Data/Bases/*.lua files into a single
-- JSON blob keyed by base name. Each base file defines `local itemBases = ...`
-- expecting the outer table to be passed in as the single vararg; we accumulate
-- all of them into one shared table and serialize at the end.
--
-- Args: out_json_path, base_file_1.lua, base_file_2.lua, ...

local args = { ... }
local out_json_path = args[1]
assert(out_json_path, "usage: extract_item_bases.lua <out_json> <base_file> ...")

-- Minimal JSON encoder; matches the pattern used by extract_tree.lua. Item
-- base tables are shallow by our needs — strings, booleans, numbers, nested
-- string-keyed tables, and array-style string lists.
local function encode(v)
    local t = type(v)
    if t == "nil" then return "null" end
    if t == "boolean" then return v and "true" or "false" end
    if t == "number" then
        if v ~= v then return "null" end
        if v == math.huge or v == -math.huge then return "null" end
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
        local is_array = (n == max) and (n > 0)
        if is_array then
            local parts = {}
            for i = 1, max do parts[i] = encode(v[i]) end
            return "[" .. table.concat(parts, ",") .. "]"
        else
            local parts = {}
            for k, val in pairs(v) do
                parts[#parts+1] = encode(tostring(k)) .. ":" .. encode(val)
            end
            return "{" .. table.concat(parts, ",") .. "}"
        end
    end
    error("cannot encode value of type " .. t)
end

local itemBases = {}

for i = 2, #args do
    local file = args[i]
    local chunk, err = loadfile(file)
    if not chunk then error("loadfile " .. file .. ": " .. tostring(err)) end
    -- Each Bases/*.lua is `local itemBases = ...; itemBases["Name"] = {...}; ...`
    -- so we pass our shared table in as the vararg.
    chunk(itemBases)
end

local f = assert(io.open(out_json_path, "wb"))
f:write(encode(itemBases))
f:close()
print("wrote " .. out_json_path)
