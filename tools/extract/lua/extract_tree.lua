-- Args: tree_lua_path, out_json_path
local tree_lua_path, out_json_path = ...
assert(tree_lua_path and out_json_path, "usage: extract_tree.lua <tree.lua> <out.json>")

-- Minimal JSON encoder for Lua tables (tree data has no cycles, no functions, no userdata)
local function encode(v)
    local t = type(v)
    if t == "nil" then return "null" end
    if t == "boolean" then return v and "true" or "false" end
    if t == "number" then
        if v ~= v then return "null" end      -- NaN → null
        if v == math.huge or v == -math.huge then return "null" end
        return tostring(v)
    end
    if t == "string" then
        return '"' .. v:gsub('\\', '\\\\'):gsub('"', '\\"')
                        :gsub('\n', '\\n'):gsub('\r', '\\r')
                        :gsub('\t', '\\t') .. '"'
    end
    if t == "table" then
        -- Decide array vs object
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

-- Load the tree.lua file. Upstream tree files are either `return { ... }` or
-- `local tree = { ... }; return tree`. `loadfile + call` handles both.
local chunk, err = loadfile(tree_lua_path)
if not chunk then error("loadfile failed: " .. tostring(err)) end
local tree = chunk()
assert(type(tree) == "table", "tree file did not return a table")

local f = assert(io.open(out_json_path, "wb"))
f:write(encode(tree))
f:close()
print("wrote " .. out_json_path)
